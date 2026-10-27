import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const MAX_JTI_LENGTH = 191; // AdminSsoJti.jti is VarChar(191)
const TICKET_TTL_MS = 30_000;
const TICKET_PREFIX = "t:";
const MAX_TICKET_LENGTH = 64;
const TICKET_SHAPE = /^[A-Za-z0-9_-]+$/;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

/** Marks a token jti as used. False when it was already used (replay) or is malformed. */
export async function consumeJti(jti: string, expiresAt: Date): Promise<boolean> {
  if (jti === "" || jti.length > MAX_JTI_LENGTH) return false;
  try {
    await prisma.adminSsoJti.create({ data: { jti, expiresAt } });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/** One-time internal ticket handed to next-auth after a verified SSO token. */
export async function issueTicket(userId: string): Promise<string> {
  const ticket = randomBytes(32).toString("base64url");
  await prisma.adminSsoJti.create({
    data: { jti: `${TICKET_PREFIX}${ticket}`, userId, expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
  });
  return ticket;
}

/**
 * Spends a ticket. The userId comes back only when this call deleted a live
 * row, so two concurrent redemptions cannot both succeed.
 */
export async function redeemTicket(ticket: string): Promise<string | null> {
  if (ticket.length === 0 || ticket.length > MAX_TICKET_LENGTH || !TICKET_SHAPE.test(ticket)) return null;
  const jti = `${TICKET_PREFIX}${ticket}`;
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const row = await tx.adminSsoJti.findUnique({ where: { jti } });
    if (!row) return null;
    const { count } = await tx.adminSsoJti.deleteMany({ where: { jti, expiresAt: { gt: now } } });
    if (count === 1) return row.userId;
    // Expired: remove it so it cannot linger.
    await tx.adminSsoJti.deleteMany({ where: { jti } }).catch(() => undefined);
    return null;
  });
}

export async function purgeExpired(): Promise<void> {
  await prisma.adminSsoJti.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
