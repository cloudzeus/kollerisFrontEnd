import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(async () => ({})),
  count: vi.fn(async () => 1),
  groupBy: vi.fn(async () => []),
  auditCreate: vi.fn(async () => ({})),
  auditFindMany: vi.fn(async (): Promise<unknown[]> => []),
  deleteMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/auth", () => ({ MAX_ATTEMPTS: 5, LOCKOUT_MINUTES: 15 }));
vi.mock("@node-rs/argon2", () => ({ hash: vi.fn(async () => "hashed") }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique: h.findUnique, findMany: h.findMany, update: h.update, count: h.count },
    loginAttempt: { groupBy: h.groupBy, deleteMany: h.deleteMany },
    adminAuditLog: { create: h.auditCreate, findMany: h.auditFindMany },
  },
}));

import { listAdminUsers, recentUserAudit, resetAdminPassword, updateAdminUser } from "@/lib/admin/users";

const actor = { id: "actor", email: "a@x.gr" };
const managed = {
  id: "u1",
  email: "m@x.gr",
  name: "M",
  role: "EDITOR",
  isActive: true,
  hdctoolUserId: "h-1",
};

beforeEach(() => vi.clearAllMocks());

describe("users managed by HDCtool", () => {
  it("refuses a role change", async () => {
    h.findUnique.mockResolvedValue(managed);
    const r = await updateAdminUser("u1", { name: "M", role: "OPS" }, actor);
    expect(r).toEqual({ ok: false, error: "Ο ρόλος ορίζεται στο HDCtool" });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("still allows other edits (name)", async () => {
    h.findUnique.mockResolvedValue(managed);
    const r = await updateAdminUser("u1", { name: "New", role: "EDITOR" }, actor);
    expect(r.ok).toBe(true);
    expect(h.update).toHaveBeenCalled();
  });

  it("refuses a password reset", async () => {
    h.findUnique.mockResolvedValue(managed);
    const r = await resetAdminPassword("u1", "a-long-enough-password", actor);
    expect(r).toEqual({ ok: false, error: "Ο κωδικός δεν ισχύει για χρήστες του HDCtool" });
    expect(h.update).not.toHaveBeenCalled();
  });

  it("still allows role change for password users", async () => {
    h.findUnique.mockResolvedValue({ ...managed, hdctoolUserId: null });
    const r = await updateAdminUser("u1", { name: "M", role: "OPS" }, actor);
    expect(r.ok).toBe(true);
  });

  it("exposes managedByHdctool on the list", async () => {
    h.findMany.mockResolvedValue([
      { ...managed, lastLoginAt: null, createdAt: new Date() },
      { ...managed, id: "u2", email: "p@x.gr", hdctoolUserId: null, lastLoginAt: null, createdAt: new Date() },
    ]);
    const rows = await listAdminUsers("actor");
    expect(rows.map((r) => r.managedByHdctool)).toEqual([true, false]);
    expect(rows[0]).not.toHaveProperty("hdctoolUserId");
  });
});

describe("recentUserAudit and SSO audit rows", () => {
  it("leaves sso_login rows out of the users-screen panel", async () => {
    await recentUserAudit(25);
    const where = (h.auditFindMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toEqual({ entity: { in: ["AdminUser", "AdminRole"] }, action: { not: "sso_login" } });
  });

  it("labels sso_login and emergency_login in Greek", async () => {
    const at = new Date("2026-10-27T10:00:00Z");
    h.auditFindMany.mockResolvedValueOnce([
      { id: "1", createdAt: at, action: "sso_login", diff: {}, user: { email: "m@x.gr" } },
      { id: "2", createdAt: at, action: "emergency_login", diff: null, user: { email: "b@x.gr" } },
    ]);
    const rows = await recentUserAudit(25);
    expect(rows.map((r) => r.action)).toEqual(["Σύνδεση μέσω HDCtool", "Είσοδος έκτακτης ανάγκης"]);
  });
});
