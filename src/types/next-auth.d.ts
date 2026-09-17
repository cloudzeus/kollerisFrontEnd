import type { AdminRole } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AdminRole;
      /** Epoch ms of sign-in; 0 for tokens issued before it was recorded. */
      signedInAt: number;
    } & DefaultSession["user"];
  }

  interface User {
    role: AdminRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: AdminRole;
    signedInAt?: number;
  }
}

export {};
