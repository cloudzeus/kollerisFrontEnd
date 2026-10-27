import { beforeEach, describe, expect, it, vi } from "vitest";

type Provider = { id?: string; authorize: (raw: Record<string, unknown>) => Promise<unknown> };

const captured = vi.hoisted(() => ({ providers: [] as Provider[] }));
const h = vi.hoisted(() => ({
  users: new Map<string, Record<string, unknown>>(),
  attempts: [] as { identifier: string; successful: boolean }[],
  audits: [] as Record<string, unknown>[],
  verify: vi.fn(),
  redeemTicket: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: { providers: Provider[] }) => {
    captured.providers = config.providers;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: (c: Provider) => c }));
vi.mock("@node-rs/argon2", () => ({ verify: h.verify }));
vi.mock("@/lib/admin/roles", () => ({ refreshRoleCapabilities: vi.fn() }));
vi.mock("@/lib/admin/sso/once", () => ({ redeemTicket: h.redeemTicket }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    loginAttempt: {
      count: vi.fn(async () => 0),
      create: vi.fn(async ({ data }: { data: { identifier: string; successful: boolean } }) => {
        h.attempts.push(data);
        return data;
      }),
    },
    adminUser: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
        for (const u of h.users.values()) {
          if ((where.id && u.id === where.id) || (where.email && u.email === where.email)) return u;
        }
        return null;
      }),
      update: vi.fn(async () => ({})),
    },
    adminAuditLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        h.audits.push(data);
        return data;
      }),
    },
  },
}));

await import("@/auth");
const password = () => captured.providers.find((p) => !p.id || p.id === "credentials")!;
const sso = () => captured.providers.find((p) => p.id === "hdctool-sso")!;

function addUser(u: Partial<Record<string, unknown>> & { id: string; email: string }) {
  h.users.set(u.id, { name: "N", role: "ADMIN", isActive: true, passwordHash: "$argon2id$real", ...u });
}

beforeEach(() => {
  h.users.clear();
  h.attempts.length = 0;
  h.audits.length = 0;
  h.verify.mockReset();
  h.redeemTicket.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("ADMIN_SSO", "off");
  vi.stubEnv("ADMIN_EMERGENCY_EMAILS", "");
});

describe("hdctool-sso provider", () => {
  it("returns the user for a redeemed ticket, then null for the same ticket again", async () => {
    addUser({ id: "u1", email: "a@kolleris.com" });
    const tickets = new Map([["tk", "u1"]]);
    h.redeemTicket.mockImplementation(async (t: string) => {
      const id = tickets.get(t) ?? null;
      tickets.delete(t);
      return id;
    });
    expect(await sso().authorize({ ticket: "tk" })).toEqual({
      id: "u1",
      email: "a@kolleris.com",
      name: "N",
      role: "ADMIN",
    });
    expect(await sso().authorize({ ticket: "tk" })).toBeNull();
  });

  it("returns null for an inactive or missing user, and for a missing ticket", async () => {
    addUser({ id: "u2", email: "b@kolleris.com", isActive: false });
    h.redeemTicket.mockResolvedValueOnce("u2").mockResolvedValueOnce("ghost");
    expect(await sso().authorize({ ticket: "x" })).toBeNull();
    expect(await sso().authorize({ ticket: "y" })).toBeNull();
    expect(await sso().authorize({})).toBeNull();
    expect(h.redeemTicket).toHaveBeenCalledTimes(2);
  });
});

describe("password provider gating", () => {
  it("ADMIN_SSO=only: an unlisted email with the right password → null, verify still runs", async () => {
    vi.stubEnv("ADMIN_SSO", "only");
    vi.stubEnv("ADMIN_EMERGENCY_EMAILS", "boss@kolleris.com");
    addUser({ id: "u1", email: "a@kolleris.com" });
    h.verify.mockResolvedValue(true);
    expect(await password().authorize({ email: "a@kolleris.com", password: "pw" })).toBeNull();
    expect(h.verify).toHaveBeenCalledTimes(1);
    expect(h.attempts).toEqual([{ identifier: "a@kolleris.com", successful: false }]);
  });

  it("ADMIN_SSO=only: a listed email → user, with an emergency_login audit", async () => {
    vi.stubEnv("ADMIN_SSO", "only");
    vi.stubEnv("ADMIN_EMERGENCY_EMAILS", "Boss@kolleris.com");
    addUser({ id: "u9", email: "boss@kolleris.com" });
    h.verify.mockResolvedValue(true);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await password().authorize({ email: "boss@kolleris.com", password: "pw" })).toMatchObject({ id: "u9" });
    expect(h.audits).toEqual([
      { userId: "u9", action: "emergency_login", entity: "AdminUser", entityId: "u9" },
    ]);
    expect(info).toHaveBeenCalledWith("admin_emergency_login user=u9");
    info.mockRestore();
  });

  it("ADMIN_SSO=both: a listed email logs an emergency_login too; an unlisted one logs nothing", async () => {
    vi.stubEnv("ADMIN_SSO", "both");
    vi.stubEnv("ADMIN_EMERGENCY_EMAILS", "boss@kolleris.com");
    addUser({ id: "u9", email: "boss@kolleris.com" });
    addUser({ id: "u1", email: "a@kolleris.com" });
    h.verify.mockResolvedValue(true);
    vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await password().authorize({ email: "a@kolleris.com", password: "pw" })).toMatchObject({ id: "u1" });
    expect(h.audits).toEqual([]);
    expect(await password().authorize({ email: "boss@kolleris.com", password: "pw" })).toMatchObject({ id: "u9" });
    expect(h.audits).toHaveLength(1);
  });

  it("ADMIN_SSO=off: a listed email writes no emergency audit", async () => {
    vi.stubEnv("ADMIN_EMERGENCY_EMAILS", "boss@kolleris.com");
    addUser({ id: "u9", email: "boss@kolleris.com" });
    h.verify.mockResolvedValue(true);
    expect(await password().authorize({ email: "boss@kolleris.com", password: "pw" })).toMatchObject({ id: "u9" });
    expect(h.audits).toEqual([]);
  });

  it("a user with passwordHash null → null even if verify passes", async () => {
    addUser({ id: "u3", email: "c@kolleris.com", passwordHash: null });
    h.verify.mockResolvedValue(true);
    expect(await password().authorize({ email: "c@kolleris.com", password: "pw" })).toBeNull();
    expect(h.verify).toHaveBeenCalledTimes(1);
  });
});
