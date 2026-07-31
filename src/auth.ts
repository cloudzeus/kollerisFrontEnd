import { verify } from "@node-rs/argon2";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

/** 5 failed attempts inside the window → locked out for the window. Spec §19. */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

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

export const { handlers, auth, signIn, signOut } = NextAuth({
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

/** argon2id hash of a value nobody knows — used only to equalise timing. */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$3o8kZ5H0y8mQmXk9J7nQ8Q0z1v2w3x4y5z6A7B8C9D0";
