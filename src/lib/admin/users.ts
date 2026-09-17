import "server-only";
import { hash } from "@node-rs/argon2";
import { z } from "zod";
import { LOCKOUT_MINUTES, MAX_ATTEMPTS } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { AdminRole } from "@/generated/prisma/enums";
import { ROLE_META, ROLES } from "@/lib/rbac";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  type ActionResult,
  type AdminAuditRow,
  type AdminUserRow,
} from "@/lib/admin/users-types";

export * from "@/lib/admin/users-types";

/**
 * Admin user management.
 *
 * Three rules hold no matter which screen calls in, which is why they live
 * here and not in the actions:
 *
 *   - there is always at least one active ADMIN, or nobody could ever manage
 *     users again without a database shell;
 *   - nobody deactivates or demotes themselves — the usual way that first rule
 *     gets broken, and never what was meant;
 *   - passwords are argon2id and never reach the audit log, not even hashed.
 */

type Actor = { id: string; email: string };

const emailSchema = z.email("Μη έγκυρο email.").max(320);
const nameSchema = z.string().trim().max(120);
const roleSchema = z.enum(ROLES);
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Ο κωδικός θέλει τουλάχιστον ${PASSWORD_MIN} χαρακτήρες.`)
  .max(PASSWORD_MAX, "Ο κωδικός είναι πολύ μεγάλος.");

// Same parameters the seed script and the verifier in auth.ts expect.
function hashPassword(password: string) {
  return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 });
}

function lockoutSince() {
  return new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
}

function audit(actor: Actor, action: string, entityId: string, diff: Record<string, unknown>) {
  return prisma.adminAuditLog.create({
    data: { userId: actor.id, action, entity: "AdminUser", entityId, diff: diff as object },
  });
}

async function otherActiveAdmins(excludingId: string) {
  return prisma.adminUser.count({
    where: { role: "ADMIN", isActive: true, id: { not: excludingId } },
  });
}

export async function listAdminUsers(selfId: string): Promise<AdminUserRow[]> {
  const [users, failures] = await Promise.all([
    prisma.adminUser.findMany({
      orderBy: [{ isActive: "desc" }, { role: "asc" }, { email: "asc" }],
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    }),
    prisma.loginAttempt.groupBy({
      by: ["identifier"],
      where: { successful: false, attemptedAt: { gte: lockoutSince() } },
      _count: true,
    }),
  ]);
  const failuresBy = new Map(failures.map((f) => [f.identifier, f._count]));

  return users.map((u) => {
    const recentFailures = failuresBy.get(u.email) ?? 0;
    return { ...u, recentFailures, locked: recentFailures >= MAX_ATTEMPTS, isSelf: u.id === selfId };
  });
}

const ACTION_LABEL: Record<string, string> = {
  "user.create": "Νέος χρήστης",
  "user.update": "Αλλαγή στοιχείων",
  "user.activate": "Ενεργοποίηση",
  "user.deactivate": "Απενεργοποίηση",
  "user.password_reset": "Νέος κωδικός",
  "user.unlock": "Ξεκλείδωμα",
  "role.update": "Δικαιώματα ρόλου",
};

function roleLabel(role: unknown) {
  return typeof role === "string" && role in ROLE_META ? ROLE_META[role as AdminRole].label : String(role);
}

function summarise(action: string, diff: Record<string, unknown>): string {
  const target = typeof diff.email === "string" ? diff.email : "";
  switch (action) {
    case "user.create":
      return `${target} · ${roleLabel(diff.role)}`;
    case "user.update": {
      const parts: string[] = [];
      const role = diff.role as { from: unknown; to: unknown } | undefined;
      const name = diff.name as { from: unknown; to: unknown } | undefined;
      if (role) parts.push(`ρόλος ${roleLabel(role.from)} → ${roleLabel(role.to)}`);
      if (name) parts.push(`όνομα «${name.from ?? "—"}» → «${name.to ?? "—"}»`);
      return `${target}${parts.length ? ` · ${parts.join(", ")}` : ""}`;
    }
    case "user.unlock":
      return `${target} · ${diff.cleared ?? 0} αποτυχημένες προσπάθειες`;
    case "role.update": {
      const added = (diff.added as string[] | undefined) ?? [];
      const removed = (diff.removed as string[] | undefined) ?? [];
      const bits = [
        added.length ? `+${added.join(", +")}` : "",
        removed.length ? `−${removed.join(", −")}` : "",
      ].filter(Boolean);
      return `${roleLabel(diff.role)}${bits.length ? ` · ${bits.join(" ")}` : " · επαναφορά"}`;
    }
    default:
      return target;
  }
}

export async function recentUserAudit(limit = 25): Promise<AdminAuditRow[]> {
  const rows = await prisma.adminAuditLog.findMany({
    where: { entity: { in: ["AdminUser", "AdminRole"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, createdAt: true, action: true, diff: true, user: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    actor: r.user?.email ?? null,
    code: r.action,
    action: ACTION_LABEL[r.action] ?? r.action,
    summary: summarise(r.action, (r.diff ?? {}) as Record<string, unknown>),
  }));
}

export async function createAdminUser(
  input: { email: string; name: string; role: string; password: string },
  actor: Actor,
): Promise<ActionResult> {
  const parsed = z
    .object({ email: emailSchema, name: nameSchema, role: roleSchema, password: passwordSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };

  const email = parsed.data.email.toLowerCase();
  if (await prisma.adminUser.findUnique({ where: { email }, select: { id: true } })) {
    return { ok: false, error: "Υπάρχει ήδη χρήστης με αυτό το email." };
  }

  const user = await prisma.adminUser.create({
    data: {
      email,
      name: parsed.data.name || null,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
    select: { id: true },
  });
  await audit(actor, "user.create", user.id, { email, role: parsed.data.role });
  return { ok: true, message: `Ο χρήστης ${email} δημιουργήθηκε.` };
}

export async function updateAdminUser(
  id: string,
  input: { name: string; role: string },
  actor: Actor,
): Promise<ActionResult> {
  const parsed = z.object({ name: nameSchema, role: roleSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρα στοιχεία." };

  const user = await prisma.adminUser.findUnique({ where: { id } });
  if (!user) return { ok: false, error: "Ο χρήστης δεν βρέθηκε." };

  const name = parsed.data.name || null;
  const role = parsed.data.role;
  const diff: Record<string, unknown> = { email: user.email };
  if (name !== user.name) diff.name = { from: user.name, to: name };
  if (role !== user.role) {
    if (id === actor.id) return { ok: false, error: "Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο." };
    if (user.role === "ADMIN" && user.isActive && (await otherActiveAdmins(id)) === 0) {
      return { ok: false, error: "Είναι ο μόνος ενεργός διαχειριστής — ορίστε πρώτα άλλον." };
    }
    diff.role = { from: user.role, to: role };
  }
  if (!diff.name && !diff.role) return { ok: true, message: "Καμία αλλαγή." };

  await prisma.adminUser.update({ where: { id }, data: { name, role } });
  await audit(actor, "user.update", id, diff);
  return { ok: true, message: "Αποθηκεύτηκε." };
}

export async function setAdminUserActive(id: string, active: boolean, actor: Actor): Promise<ActionResult> {
  const user = await prisma.adminUser.findUnique({ where: { id } });
  if (!user) return { ok: false, error: "Ο χρήστης δεν βρέθηκε." };
  if (user.isActive === active) return { ok: true };

  if (!active) {
    if (id === actor.id) return { ok: false, error: "Δεν μπορείτε να απενεργοποιήσετε τον εαυτό σας." };
    if (user.role === "ADMIN" && (await otherActiveAdmins(id)) === 0) {
      return { ok: false, error: "Είναι ο μόνος ενεργός διαχειριστής." };
    }
  }

  await prisma.adminUser.update({ where: { id }, data: { isActive: active } });
  await audit(actor, active ? "user.activate" : "user.deactivate", id, { email: user.email });
  return {
    ok: true,
    message: active
      ? `Ο ${user.email} μπορεί ξανά να συνδεθεί.`
      : `Ο ${user.email} αποσυνδέθηκε και δεν μπορεί να συνδεθεί.`,
  };
}

/**
 * Sets a new password and ends every session opened before it. Resetting your
 * own password therefore signs you out too — the one way to be sure a session
 * on a lost laptop is gone.
 */
export async function resetAdminPassword(id: string, password: string, actor: Actor): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Μη έγκυρος κωδικός." };

  const user = await prisma.adminUser.findUnique({ where: { id }, select: { email: true } });
  if (!user) return { ok: false, error: "Ο χρήστης δεν βρέθηκε." };

  await prisma.adminUser.update({
    where: { id },
    data: { passwordHash: await hashPassword(parsed.data), sessionsValidFrom: new Date() },
  });
  // A new password is also the answer to a lockout.
  await prisma.loginAttempt.deleteMany({
    where: { identifier: user.email, successful: false, attemptedAt: { gte: lockoutSince() } },
  });
  await audit(actor, "user.password_reset", id, { email: user.email });
  return {
    ok: true,
    message:
      id === actor.id
        ? "Ο κωδικός άλλαξε. Συνδεθείτε ξανά με τον νέο."
        : `Ο κωδικός του ${user.email} άλλαξε και οι ανοιχτές συνεδρίες του έκλεισαν.`,
  };
}

export async function unlockAdminUser(id: string, actor: Actor): Promise<ActionResult> {
  const user = await prisma.adminUser.findUnique({ where: { id }, select: { email: true } });
  if (!user) return { ok: false, error: "Ο χρήστης δεν βρέθηκε." };

  const { count } = await prisma.loginAttempt.deleteMany({
    where: { identifier: user.email, successful: false, attemptedAt: { gte: lockoutSince() } },
  });
  await audit(actor, "user.unlock", id, { email: user.email, cleared: count });
  return { ok: true, message: `Ο ${user.email} μπορεί να δοκιμάσει ξανά.` };
}
