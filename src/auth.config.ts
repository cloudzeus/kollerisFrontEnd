import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe half of the Auth.js config.
 *
 * Middleware runs on the edge runtime, where neither Prisma nor argon2 (both
 * native modules) can load. So the callbacks that only read the JWT live here
 * and are imported by middleware; the Credentials provider — which must hit the
 * database — lives in auth.ts and is only used in the Node runtime.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8h staff session
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  providers: [], // populated in auth.ts
  callbacks: {
    // Persist role and active flag into the token at sign-in.
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.userId = user.id;
        // Compared with AdminUser.sessionsValidFrom: a password reset ends
        // every session that signed in before it.
        token.signedInAt = Date.now();
      }
      return token;
    },
    // Surface them on the session so server components can authorise cheaply.
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as typeof session.user.role;
        session.user.signedInAt = (token.signedInAt as number | undefined) ?? 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
