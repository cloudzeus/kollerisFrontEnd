import { beforeEach, describe, expect, it, vi } from "vitest";

type U = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "EDITOR" | "OPS";
  isActive: boolean;
  passwordHash: string | null;
  hdctoolUserId: string | null;
  lastLoginAt: Date | null;
};
const db = vi.hoisted(() => ({
  users: [] as unknown[],
  audits: [] as unknown[],
  updates: 0,
  failCreateOnce: false,
  raceWinnerUnbound: false,
  bindBeforeWrite: false,
  seq: 0,
}));

vi.mock("@/lib/prisma", () => {
  const users = () => db.users as U[];
  const tx = {
    adminUser: {
      findUnique: async ({ where }: { where: { id?: string; hdctoolUserId?: string; email?: string } }) =>
        users().find((u) =>
          where.id !== undefined
            ? u.id === where.id
            : where.hdctoolUserId !== undefined
              ? u.hdctoolUserId === where.hdctoolUserId
              : u.email === where.email,
        ) ?? null,
      create: async ({ data }: { data: Partial<U> }) => {
        if (db.failCreateOnce) {
          db.failCreateOnce = false;
          // simulate the concurrent request winning the race
          users().push({
            id: "raced", email: data.email!, name: null, role: "EDITOR", isActive: true,
            passwordHash: null, hdctoolUserId: db.raceWinnerUnbound ? null : "someone-else", lastLoginAt: null,
          });
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const u = { id: `new-${++db.seq}`, lastLoginAt: null, ...data } as U;
        users().push(u);
        return u;
      },
      updateMany: async ({ where, data }: { where: { id: string; hdctoolUserId: null }; data: Partial<U> }) => {
        const u = users().find((x) => x.id === where.id)!;
        if (db.bindBeforeWrite) u.hdctoolUserId = "h-other";
        if (u.hdctoolUserId !== null) return { count: 0 };
        db.updates++;
        Object.assign(u, data);
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<U> }) => {
        db.updates++;
        const u = users().find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: unknown }) => {
        db.audits.push(data);
        return data;
      },
    },
  };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { linkAdminUser } from "../link-user";
import type { SsoClaims } from "../verify";

const claims = (over: Partial<SsoClaims> = {}): SsoClaims => ({
  sub: "h-1", email: "maria@kolleris.gr", name: "Maria", role: "EDITOR", jti: "j", exp: 9_999_999_999, ...over,
});
const user = (over: Partial<U> = {}): U => ({
  id: "u1", email: "maria@kolleris.gr", name: "Old", role: "EDITOR", isActive: true,
  passwordHash: "hash", hdctoolUserId: null, lastLoginAt: null, ...over,
});

beforeEach(() => {
  db.users = [];
  db.audits = [];
  db.updates = 0;
  db.failCreateOnce = false;
  db.raceWinnerUnbound = false;
  db.bindBeforeWrite = false;
  db.seq = 0;
});

describe("linkAdminUser", () => {
  it("creates a passwordless user for a new identity", async () => {
    const r = await linkAdminUser(claims());
    expect(r).toEqual({ ok: true, user: { id: "new-1", email: "maria@kolleris.gr", name: "Maria", role: "EDITOR" } });
    expect(db.users[0]).toMatchObject({ passwordHash: null, hdctoolUserId: "h-1", isActive: true, role: "EDITOR" });
    expect(db.audits[0]).toMatchObject({
      userId: "new-1", action: "sso_login", entity: "AdminUser", entityId: "new-1",
      diff: { role: "EDITOR", linked: "created" },
    });
  });

  it("links an unbound row by email, keeping id and passwordHash", async () => {
    db.users = [user()];
    const r = await linkAdminUser(claims({ role: "OPS" }));
    expect(r).toMatchObject({ ok: true, user: { id: "u1", role: "OPS" } });
    expect(db.users[0]).toMatchObject({ id: "u1", hdctoolUserId: "h-1", passwordHash: "hash", role: "OPS" });
    expect((db.users[0] as U).lastLoginAt).toBeInstanceOf(Date);
    expect(db.audits[0]).toMatchObject({ diff: { role: "OPS", linked: "email" } });
  });

  it("matches by hdctoolUserId and updates a changed email", async () => {
    db.users = [user({ hdctoolUserId: "h-1", email: "old@kolleris.gr" })];
    const r = await linkAdminUser(claims());
    expect(r).toMatchObject({ ok: true, user: { id: "u1", email: "maria@kolleris.gr" } });
    expect((db.users[0] as U).email).toBe("maria@kolleris.gr");
    expect(db.audits[0]).toMatchObject({ diff: { linked: "id" } });
  });

  it("refuses an email change that collides with another row", async () => {
    db.users = [
      user({ id: "u1", hdctoolUserId: "h-1", email: "old@kolleris.gr" }),
      user({ id: "u2", hdctoolUserId: "h-2", email: "maria@kolleris.gr" }),
    ];
    const r = await linkAdminUser(claims());
    expect(r).toEqual({ ok: false, reason: "email_bound_to_other" });
    expect(db.updates).toBe(0);
    expect(db.audits).toHaveLength(0);
  });

  it("refuses an email row bound to a different hdctool user", async () => {
    db.users = [user({ hdctoolUserId: "h-other" })];
    expect(await linkAdminUser(claims())).toEqual({ ok: false, reason: "email_bound_to_other" });
    expect(db.updates).toBe(0);
  });

  it("never re-enables a locally disabled user (by email or by id)", async () => {
    db.users = [user({ isActive: false })];
    expect(await linkAdminUser(claims())).toEqual({ ok: false, reason: "disabled_locally" });
    db.users = [user({ isActive: false, hdctoolUserId: "h-1" })];
    expect(await linkAdminUser(claims())).toEqual({ ok: false, reason: "disabled_locally" });
    expect(db.updates).toBe(0);
    expect(db.audits).toHaveLength(0);
    expect((db.users[0] as U).isActive).toBe(false);
  });

  it("moves the role from EDITOR to OPS on login and keeps the name when claims.name is empty", async () => {
    db.users = [user({ hdctoolUserId: "h-1", name: "Kept" })];
    const r = await linkAdminUser(claims({ role: "OPS", name: "" }));
    expect(r).toMatchObject({ ok: true, user: { role: "OPS", name: "Kept" } });
  });

  it("retries once on a create race, then reports email_bound_to_other", async () => {
    db.failCreateOnce = true;
    const r = await linkAdminUser(claims());
    expect(r).toEqual({ ok: false, reason: "email_bound_to_other" });
  });

  it("retries once on a create race and links when the winner is unbound", async () => {
    db.failCreateOnce = true;
    db.raceWinnerUnbound = true;
    const r = await linkAdminUser(claims());
    expect(r).toMatchObject({ ok: true, user: { id: "raced" } });
  });

  it("refuses when the unbound row is bound to another sub between read and write", async () => {
    db.users = [user()];
    db.bindBeforeWrite = true;
    expect(await linkAdminUser(claims())).toEqual({ ok: false, reason: "email_bound_to_other" });
    expect((db.users[0] as U).hdctoolUserId).toBe("h-other");
    expect(db.audits).toHaveLength(0);
  });
});
