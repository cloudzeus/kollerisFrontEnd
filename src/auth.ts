import { verify } from "@node-rs/argon2";
import NextAuth, { type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { refreshRoleCapabilities } from "@/lib/admin/roles";

/** 5 failed attempts inside the window → locked out for the window. Spec §19. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

const credentialsSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(256),
});

async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60_000);
  const failures = await prisma.loginAttempt.count({
    where: { identifier: email, successful: false, attemptedAt: { gte: since } },
  });
  return failures >= MAX_ATTEMPTS;
}

const nextAuth = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const identifier = email.toLowerCase();

        // Lockout is checked before any hashing work, so a locked account
        // cannot be used as a timing oracle either.
        if (await isLockedOut(identifier)) return null;

        const user = await prisma.adminUser.findUnique({
          where: { email: identifier },
          select: { id: true, email: true, name: true, role: true, isActive: true, passwordHash: true },
        });

        // Verify even when the user is missing or inactive, against a dummy
        // hash, so response time does not reveal which accounts exist.
        const hash = user?.passwordHash ?? DUMMY_HASH;
        let valid = false;
        try {
          valid = await verify(hash, password);
        } catch {
          valid = false;
        }

        const authorised = valid && !!user && user.isActive;

        await prisma.loginAttempt.create({
          data: { identifier, successful: authorised },
        });

        if (!authorised || !user) return null;

        await prisma.adminUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
});

export const { handlers, signIn, signOut } = nextAuth;

export type AdminSessionState = "valid" | "none" | "revoked";

/**
 * The JWT alone is not enough to trust.
 *
 * It carries the role the user had at sign-in and stays valid for eight hours,
 * so without this a deactivated operator keeps working until the token expires
 * and a demoted one keeps their old sections. One primary-key read per admin
 * request makes both take effect on the next click.
 */
async function resolveSession(): Promise<{ state: AdminSessionState; session: Session | null }> {
  const session = await nextAuth.auth();
  if (!session?.user?.id) return { state: "none", session: null };

  const [user] = await Promise.all([loadSessionUser(session.user.id), refreshRoleCapabilities()]);

  const signedInAt = session.user.signedInAt ?? 0;
  if (
    !user ||
    !user.isActive ||
    (user.sessionsValidFrom && signedInAt < user.sessionsValidFrom.getTime())
  ) {
    return { state: "revoked", session: null };
  }

  session.user.role = user.role;
  session.user.email = user.email;
  session.user.name = user.name;
  return { state: "valid", session };
}

async function loadSessionUser(id: string) {
  const select = { email: true, name: true, role: true, isActive: true } as const;
  try {
    return await prisma.adminUser.findUnique({ where: { id }, select: { ...select, sessionsValidFrom: true } });
  } catch (err) {
    // The code can reach production before its migration does (migrations are
    // applied by hand). Without the column, password resets cannot revoke
    // sessions yet — but /admin keeps working instead of throwing on every page.
    console.error("[auth] sessionsValidFrom unavailable:", (err as Error).message);
    const user = await prisma.adminUser.findUnique({ where: { id }, select });
    return user && { ...user, sessionsValidFrom: null };
  }
}

export async function auth(): Promise<Session | null> {
  return (await resolveSession()).session;
}

/** For the layout: tells a missing session apart from one that was revoked. */
export async function authState(): Promise<AdminSessionState> {
  return (await resolveSession()).state;
}

/** argon2id hash of a value nobody knows — used only to equalise timing. */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$3o8kZ5H0y8mQmXk9J7nQ8Q0z1v2w3x4y5z6A7B8C9D0";
