import type { AdminRole } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: AdminRole;
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
  }
}

export {};
