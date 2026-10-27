import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { jti: string; userId: string | null; expiresAt: Date };
const db = vi.hoisted(() => ({ rows: new Map<string, { jti: string; userId: string | null; expiresAt: Date }>() }));
const calls = vi.hoisted(() => ({ n: 0 }));

vi.mock("@/lib/prisma", () => {
  const p2002 = () => Object.assign(new Error("unique"), { code: "P2002" });
  const tx = {
    adminSsoJti: {
      create: async ({ data }: { data: Row }) => {
        calls.n++;
        if (db.rows.has(data.jti)) throw p2002();
        db.rows.set(data.jti, { jti: data.jti, userId: data.userId ?? null, expiresAt: data.expiresAt });
        return data;
      },
      findUnique: async ({ where }: { where: { jti: string } }) => {
        calls.n++;
        return db.rows.get(where.jti) ?? null;
      },
      deleteMany: async ({ where }: { where: { jti?: string; expiresAt?: { gt?: Date; lt?: Date } } }) => {
        calls.n++;
        let count = 0;
        for (const [k, r] of db.rows) {
          if (where.jti !== undefined && k !== where.jti) continue;
          if (where.expiresAt?.gt && !(r.expiresAt > where.expiresAt.gt)) continue;
          if (where.expiresAt?.lt && !(r.expiresAt < where.expiresAt.lt)) continue;
          db.rows.delete(k);
          count++;
        }
        return { count };
      },
    },
  };
  return { prisma: { ...tx, $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } };
});

import { consumeJti, issueTicket, purgeExpired, redeemTicket } from "../once";

const future = () => new Date(Date.now() + 60_000);

beforeEach(() => {
  db.rows.clear();
  calls.n = 0;
  vi.useRealTimers();
});

describe("consumeJti", () => {
  it("accepts a jti once, then rejects the replay", async () => {
    expect(await consumeJti("abc", future())).toBe(true);
    expect(await consumeJti("abc", future())).toBe(false);
  });
  it("rejects an over-long jti without a DB call", async () => {
    expect(await consumeJti("x".repeat(192), future())).toBe(false);
    expect(calls.n).toBe(0);
  });
  it("rethrows non-unique errors", async () => {
    const { prisma } = await import("@/lib/prisma");
    const spy = vi.spyOn(prisma.adminSsoJti, "create").mockRejectedValueOnce(new Error("db down"));
    await expect(consumeJti("zzz", future())).rejects.toThrow("db down");
    spy.mockRestore();
  });
});

describe("tickets", () => {
  it("issues a url-safe ticket and redeems it exactly once", async () => {
    const t = await issueTicket("user-1");
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(t.startsWith("t:")).toBe(false);
    expect(db.rows.has(`t:${t}`)).toBe(true);
    expect(await redeemTicket(t)).toBe("user-1");
    expect(await redeemTicket(t)).toBeNull();
  });
  it("expires after 30 seconds and deletes the expired row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T10:00:00Z"));
    const t = await issueTicket("user-1");
    expect(db.rows.get(`t:${t}`)!.expiresAt.getTime()).toBe(Date.now() + 30_000);
    vi.setSystemTime(new Date("2026-10-27T10:00:31Z"));
    expect(await redeemTicket(t)).toBeNull();
    expect(db.rows.has(`t:${t}`)).toBe(false);
  });
  it("returns null for unknown tickets", async () => {
    expect(await redeemTicket("A".repeat(43))).toBeNull();
  });
  it("rejects bad characters or over-long tickets without a DB call", async () => {
    expect(await redeemTicket("bad ticket!")).toBeNull();
    expect(await redeemTicket("a+b/c=")).toBeNull();
    expect(await redeemTicket("")).toBeNull();
    expect(await redeemTicket("A".repeat(65))).toBeNull();
    expect(calls.n).toBe(0);
  });
});

describe("purgeExpired", () => {
  it("removes only expired rows", async () => {
    db.rows.set("old", { jti: "old", userId: null, expiresAt: new Date(Date.now() - 1000) });
    db.rows.set("new", { jti: "new", userId: null, expiresAt: future() });
    await purgeExpired();
    expect([...db.rows.keys()]).toEqual(["new"]);
  });
});
