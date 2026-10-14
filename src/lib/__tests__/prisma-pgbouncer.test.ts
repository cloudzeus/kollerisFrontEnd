import { describe, expect, it, vi } from "vitest";

vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class {} }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));

import { behindPgBouncer } from "../prisma";

describe("behindPgBouncer", () => {
  it("detects port 6432, ?pgbouncer=true and DATABASE_POOLER", () => {
    expect(behindPgBouncer("postgresql://u:p@100.70.50.43:6432/kolshop")).toBe(true);
    expect(behindPgBouncer("postgresql://u:p@db:5432/kolshop?pgbouncer=true")).toBe(true);
    expect(behindPgBouncer("postgresql://u:p@db:5432/kolshop", "pgbouncer")).toBe(true);
  });
  it("a direct Postgres URL is not PgBouncer (statement_timeout stays on)", () => {
    expect(behindPgBouncer("postgresql://u:p@100.70.50.43:5432/kolshop")).toBe(false);
    expect(behindPgBouncer(undefined)).toBe(false);
    expect(behindPgBouncer("not a url")).toBe(false);
  });
});
