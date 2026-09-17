import type { AdminRole } from "@/generated/prisma/enums";

/** What the users screen needs about one operator. Never the password hash. */
export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  /** Failed sign-ins inside the lockout window. */
  recentFailures: number;
  locked: boolean;
  isSelf: boolean;
};

export type AdminAuditRow = {
  id: string;
  createdAt: Date;
  actor: string | null;
  /** Raw audit action, e.g. "user.create". */
  code: string;
  /** Greek label for `code`. */
  action: string;
  summary: string;
};

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;
