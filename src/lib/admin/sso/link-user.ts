import { prisma } from "@/lib/prisma";
import type { AdminRole } from "@/generated/prisma/enums";
import type { SsoClaims } from "./verify";

export type LinkedAdmin = { id: string; email: string; name: string | null; role: AdminRole };
export type LinkResult =
  | { ok: true; user: LinkedAdmin }
  | { ok: false; reason: "email_bound_to_other" | "disabled_locally" };

type Linked = "id" | "email" | "created";

class CreateRace extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

async function attempt(claims: SsoClaims): Promise<LinkResult> {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    let user = await tx.adminUser.findUnique({ where: { hdctoolUserId: claims.sub } });
    let linked: Linked;
    let newEmail: string | undefined;

    if (user) {
      // Rule 1
      linked = "id";
      if (user.email !== claims.email) {
        const taken = await tx.adminUser.findUnique({ where: { email: claims.email } });
        if (taken && taken.id !== user.id) return { ok: false, reason: "email_bound_to_other" } as const;
        newEmail = claims.email;
      }
    } else {
      const byEmail = await tx.adminUser.findUnique({ where: { email: claims.email } });
      if (byEmail) {
        // Rule 3
        if (byEmail.hdctoolUserId !== null) return { ok: false, reason: "email_bound_to_other" } as const;
        // Rule 2
        user = byEmail;
        linked = "email";
      } else {
        // Rule 4
        try {
          user = await tx.adminUser.create({
            data: {
              email: claims.email,
              name: claims.name || null,
              role: claims.role,
              hdctoolUserId: claims.sub,
              passwordHash: null,
              isActive: true,
              lastLoginAt: now,
            },
          });
        } catch (error) {
          if (isUniqueViolation(error)) throw new CreateRace();
          throw error;
        }
        await audit(tx, user.id, claims.role, "created");
        return { ok: true, user: toLinked(user) } as const;
      }
    }

    if (!user.isActive) return { ok: false, reason: "disabled_locally" } as const;

    const data = {
      role: claims.role,
      name: claims.name || user.name,
      lastLoginAt: now,
      ...(linked === "email" ? { hdctoolUserId: claims.sub } : {}),
      ...(newEmail ? { email: newEmail } : {}),
    };
    let updated;
    if (linked === "email") {
      // Conditional write: a concurrent login may have bound this row to another identity.
      const { count } = await tx.adminUser.updateMany({ where: { id: user.id, hdctoolUserId: null }, data });
      if (count === 0) return { ok: false, reason: "email_bound_to_other" } as const;
      updated = await tx.adminUser.findUnique({ where: { id: user.id } });
      if (!updated) return { ok: false, reason: "email_bound_to_other" } as const;
    } else {
      updated = await tx.adminUser.update({ where: { id: user.id }, data });
    }
    await audit(tx, updated.id, claims.role, linked);
    return { ok: true, user: toLinked(updated) } as const;
  });
}

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function audit(tx: Tx, userId: string, role: AdminRole, linked: Linked) {
  await tx.adminAuditLog.create({
    data: { userId, action: "sso_login", entity: "AdminUser", entityId: userId, diff: { role, linked } },
  });
}

function toLinked(u: { id: string; email: string; name: string | null; role: AdminRole }): LinkedAdmin {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

/** Spec §4.2: finds, links or creates the AdminUser for a verified SSO identity. */
export async function linkAdminUser(claims: SsoClaims): Promise<LinkResult> {
  try {
    return await attempt(claims);
  } catch (error) {
    if (!(error instanceof CreateRace)) throw error;
  }
  try {
    return await attempt(claims);
  } catch (error) {
    if (error instanceof CreateRace) return { ok: false, reason: "email_bound_to_other" };
    throw error;
  }
}
