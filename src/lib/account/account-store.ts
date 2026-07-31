import "server-only";
import { randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import type {
  AccountUser,
  CompanyMember,
  InviteMemberRequest,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  UpdateMemberRequest,
  UpdateProfileRequest,
} from "@/lib/account/contract";

/**
 * Customer accounts, stored HERE.
 *
 * Replaces the HDCtool client that used to sit behind this interface. The
 * contract types are unchanged, so every page and action above it is untouched
 * — which is the whole reason they were written against a contract rather than
 * against a fetch.
 *
 * Why here and not in HDCtool: its `Customer` table mirrors SoftOne TRDR. That
 * is the commercial entity we invoice, and it holds no credentials. An account
 * is an email and a password that may place an order. The two meet at the ΑΦΜ,
 * which becomes `Company.erpTrdr` — a join, not a copy.
 */

const SESSION_DAYS = 30;
const INVITE_DAYS = 14;

/** 5 failures in 15 minutes locks the identifier out. Same rule as `/admin`. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * argon2id hash of a value nobody knows.
 *
 * Verified against when the email does not exist, so a missing account and a
 * wrong password take the same time. Without it the login form is an oracle for
 * which of your customers have accounts.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$3o8kZ5H0y8mQmXk9J7nQ8Q0z1v2w3x4y5z6A7B8C9D0";

const newToken = () => randomBytes(32).toString("base64url");
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const WITH_COMPANY = { company: true } as const;

type Loaded = Awaited<ReturnType<typeof loadCustomer>>;

function loadCustomer(where: { id: string } | { email: string }) {
  return prisma.customer.findUnique({ where: where as never, include: WITH_COMPANY });
}

function toUser(row: NonNullable<Loaded>): AccountUser {
  const company = row.company;
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    accountType: row.accountType,
    status: row.status,
    role: row.role,
    spendLimit: num(row.spendLimit),
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    company: company
      ? {
          id: company.id,
          name: company.name,
          afm: company.afm,
          doy: company.doy,
          profession: company.profession,
          trdr: company.erpTrdr,
          billAddress: company.billAddress,
          billCity: company.billCity,
          billPostcode: company.billPostcode,
          phone: company.phone,
          status: company.status,
          partnerFactor: num(company.partnerFactor),
          creditLimit: num(company.creditLimit),
          creditUsed: num(company.creditUsed),
        }
      : null,
  };
}

async function isLockedOut(identifier: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
  const failures = await prisma.loginAttempt.count({
    where: { identifier, successful: false, attemptedAt: { gte: since } },
  });
  return failures >= MAX_ATTEMPTS;
}

async function issueSession(customerId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.customerSession.create({ data: { token, customerId, expiresAt } });
  return { token, expiresAt };
}

export const accountStore = {
  async login(input: LoginRequest): Promise<LoginResponse> {
    const email = input.email.trim().toLowerCase();

    // Checked before any hashing, so a locked account cannot be used as a
    // timing oracle either.
    if (await isLockedOut(email)) return { ok: false, error: "locked_out" };

    const customer = await loadCustomer({ email });

    let valid = false;
    try {
      valid = await verify(customer?.passwordHash ?? DUMMY_HASH, input.password);
    } catch {
      valid = false;
    }

    await prisma.loginAttempt.create({
      data: { identifier: email, successful: valid && !!customer },
    });

    if (!valid || !customer) return { ok: false, error: "invalid_credentials" };
    if (customer.status === "suspended" || customer.status === "rejected") {
      return { ok: false, error: "suspended" };
    }
    // A company account that has not been approved cannot sign in — signing in
    // would put them in an account that cannot do the one thing they
    // registered for.
    if (customer.status === "pending") return { ok: false, error: "pending_approval" };

    const { token, expiresAt } = await issueSession(customer.id);
    await prisma.customer.update({
      where: { id: customer.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      ok: true,
      user: toUser({ ...customer, lastLoginAt: new Date() }),
      token,
      expiresAt: expiresAt.toISOString(),
    };
  },

  async register(input: RegisterRequest): Promise<RegisterResponse> {
    const email = input.email.trim().toLowerCase();

    if (await prisma.customer.findUnique({ where: { email }, select: { id: true } })) {
      return { ok: false, error: "email_taken" };
    }

    const passwordHash = await hash(input.password);

    if (input.accountType === "individual") {
      const created = await prisma.customer.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          accountType: "individual",
          status: "active",
        },
        include: WITH_COMPANY,
      });

      const { token, expiresAt } = await issueSession(created.id);
      return { ok: true, user: toUser(created), token, expiresAt: expiresAt.toISOString() };
    }

    // ── Company ──
    const existing = await prisma.company.findUnique({
      where: { afm: input.afm },
      select: { id: true },
    });
    // One company per ΑΦΜ. A second registration is somebody's colleague, and
    // the answer is an invitation from their owner — not a parallel account
    // with its own price list.
    if (existing) return { ok: false, error: "afm_taken" };

    const created = await prisma.customer.create({
      data: {
        email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        accountType: "company",
        // Pending until a human approves. `partnerFactor` stays null, so the
        // storefront shows retail prices in the meantime.
        status: "pending",
        role: "owner",
        company: {
          create: {
            name: input.companyName,
            afm: input.afm,
            doy: input.doy,
            profession: input.profession,
            billAddress: input.billAddress,
            billCity: input.billCity,
            billPostcode: input.billPostcode,
            erpTrdr: input.trdr,
            phone: input.phone,
            status: "pending",
          },
        },
      },
      include: WITH_COMPANY,
    });

    return { ok: true, user: toUser(created), token: null, expiresAt: null, pendingApproval: true };
  },

  /** Resolves a session token, sliding its `lastSeenAt`. */
  async me(token: string): Promise<{ user: AccountUser } | { user: null }> {
    const session = await prisma.customerSession.findUnique({
      where: { token },
      include: { customer: { include: WITH_COMPANY } },
    });

    if (!session || session.expiresAt < new Date()) return { user: null };
    // Status is read on every request rather than baked into the token: an
    // account suspended this morning stops working on the next page load.
    if (session.customer.status !== "active") return { user: null };

    await prisma.customerSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    return { user: toUser(session.customer) };
  },

  async logout(token: string): Promise<{ ok: boolean }> {
    await prisma.customerSession.deleteMany({ where: { token } });
    return { ok: true };
  },

  async updateProfile(token: string, input: UpdateProfileRequest): Promise<{ user: AccountUser }> {
    const session = await prisma.customerSession.findUnique({
      where: { token },
      select: { customerId: true, expiresAt: true },
    });
    if (!session || session.expiresAt < new Date()) throw new Error("session_expired");

    const updated = await prisma.customer.update({
      where: { id: session.customerId },
      data: {
        ...(input.firstName ? { firstName: input.firstName } : {}),
        ...(input.lastName ? { lastName: input.lastName } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
      },
      include: WITH_COMPANY,
    });
    return { user: toUser(updated) };
  },

  async changePassword(
    token: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ ok: boolean; error?: "wrong_password" | "weak_password" }> {
    const session = await prisma.customerSession.findUnique({
      where: { token },
      include: { customer: { select: { id: true, passwordHash: true } } },
    });
    if (!session || session.expiresAt < new Date()) return { ok: false, error: "wrong_password" };

    let valid = false;
    try {
      valid = await verify(session.customer.passwordHash, input.currentPassword);
    } catch {
      valid = false;
    }
    if (!valid) return { ok: false, error: "wrong_password" };
    if (input.newPassword.length < 8) return { ok: false, error: "weak_password" };

    await prisma.$transaction([
      prisma.customer.update({
        where: { id: session.customer.id },
        data: { passwordHash: await hash(input.newPassword) },
      }),
      // Every other session dies. Changing a password is usually a reaction to
      // suspecting someone else has it.
      prisma.customerSession.deleteMany({
        where: { customerId: session.customer.id, NOT: { token } },
      }),
    ]);

    return { ok: true };
  },

  // ── Company members ───────────────────────────────────────────────────────

  async members(token: string): Promise<{ members: CompanyMember[] }> {
    const session = await prisma.customerSession.findUnique({
      where: { token },
      include: { customer: { select: { companyId: true } } },
    });
    const companyId = session?.customer.companyId;
    if (!companyId) return { members: [] };

    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const [people, invites, orders] = await Promise.all([
      prisma.customer.findMany({
        where: { companyId },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      }),
      prisma.customerInvite.findMany({ where: { companyId, acceptedAt: null } }),
      prisma.order.groupBy({
        by: ["customerId"],
        where: { customerId: { not: null }, createdAt: { gte: yearStart } },
        _count: { _all: true },
        _sum: { totalGross: true },
      }),
    ]);

    const stats = new Map(
      orders.map((o) => [
        o.customerId!,
        { count: o._count._all, spent: num(o._sum.totalGross) ?? 0 },
      ]),
    );

    return {
      members: [
        ...people.map((p) => ({
          id: p.id,
          email: p.email,
          firstName: p.firstName,
          lastName: p.lastName,
          role: p.role ?? "buyer",
          status: p.status,
          spendLimit: num(p.spendLimit),
          lastLoginAt: p.lastLoginAt?.toISOString() ?? null,
          ordersThisYear: stats.get(p.id)?.count ?? 0,
          spentThisYear: stats.get(p.id)?.spent ?? 0,
        })),
        // Outstanding invitations sit in the same list. An owner who invited
        // someone yesterday should see that, not an unchanged table.
        ...invites.map((i) => ({
          id: i.id,
          email: i.email,
          firstName: i.firstName,
          lastName: i.lastName,
          role: i.role,
          status: "invited" as const,
          spendLimit: num(i.spendLimit),
          lastLoginAt: null,
          ordersThisYear: 0,
          spentThisYear: 0,
        })),
      ],
    };
  },

  async inviteMember(
    token: string,
    input: InviteMemberRequest,
  ): Promise<{ ok: boolean; error?: "email_taken" | "not_allowed" }> {
    const actor = await requireOwner(token);
    if (!actor) return { ok: false, error: "not_allowed" };

    const email = input.email.trim().toLowerCase();
    if (await prisma.customer.findUnique({ where: { email }, select: { id: true } })) {
      return { ok: false, error: "email_taken" };
    }

    await prisma.customerInvite.upsert({
      where: { companyId_email: { companyId: actor.companyId, email } },
      update: {
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        spendLimit: input.spendLimit,
        token: newToken(),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
        invitedBy: actor.customerId,
      },
      create: {
        companyId: actor.companyId,
        email,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
        spendLimit: input.spendLimit,
        token: newToken(),
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
        invitedBy: actor.customerId,
      },
    });

    return { ok: true };
  },

  async updateMember(
    token: string,
    input: UpdateMemberRequest,
  ): Promise<{ ok: boolean; error?: "not_found" | "not_allowed" | "last_owner" }> {
    const actor = await requireOwner(token);
    if (!actor) return { ok: false, error: "not_allowed" };

    const member = await prisma.customer.findFirst({
      where: { id: input.memberId, companyId: actor.companyId },
    });
    if (!member) return { ok: false, error: "not_found" };

    // Demoting or suspending the last owner would lock the company out of its
    // own account with no way back except a phone call.
    const losingOwner =
      member.role === "owner" &&
      ((input.role && input.role !== "owner") || input.status === "suspended");
    if (losingOwner) {
      const owners = await prisma.customer.count({
        where: { companyId: actor.companyId, role: "owner", status: "active" },
      });
      if (owners <= 1) return { ok: false, error: "last_owner" };
    }

    await prisma.customer.update({
      where: { id: member.id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.spendLimit !== undefined ? { spendLimit: input.spendLimit } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });

    // A suspended member is signed out at once, not when their token expires.
    if (input.status === "suspended") {
      await prisma.customerSession.deleteMany({ where: { customerId: member.id } });
    }

    return { ok: true };
  },

  async removeMember(
    token: string,
    memberId: string,
  ): Promise<{ ok: boolean; error?: "not_found" | "not_allowed" | "last_owner" }> {
    const actor = await requireOwner(token);
    if (!actor) return { ok: false, error: "not_allowed" };

    // An id that is an outstanding invite rather than a person.
    const invite = await prisma.customerInvite.findFirst({
      where: { id: memberId, companyId: actor.companyId },
    });
    if (invite) {
      await prisma.customerInvite.delete({ where: { id: invite.id } });
      return { ok: true };
    }

    const member = await prisma.customer.findFirst({
      where: { id: memberId, companyId: actor.companyId },
    });
    if (!member) return { ok: false, error: "not_found" };

    if (member.role === "owner") {
      const owners = await prisma.customer.count({
        where: { companyId: actor.companyId, role: "owner", status: "active" },
      });
      if (owners <= 1) return { ok: false, error: "last_owner" };
    }

    /*
     * Detached, not deleted. Their past orders reference this id, and deleting
     * the row would orphan the company's own order history.
     */
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: member.id },
        data: { companyId: null, role: null, spendLimit: null, status: "suspended" },
      }),
      prisma.customerSession.deleteMany({ where: { customerId: member.id } }),
    ]);

    return { ok: true };
  },
};

/** Resolves a token to an owner of a company, or null. */
async function requireOwner(
  token: string,
): Promise<{ customerId: string; companyId: string } | null> {
  const session = await prisma.customerSession.findUnique({
    where: { token },
    include: { customer: { select: { id: true, companyId: true, role: true, status: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const { customer } = session;
  if (customer.status !== "active" || customer.role !== "owner" || !customer.companyId) {
    return null;
  }
  return { customerId: customer.id, companyId: customer.companyId };
}
