import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }));

beforeEach(() => {
  queryRaw.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("/api/health (liveness)", () => {
  it("answers 200 without touching the database, even when it hangs", async () => {
    queryRaw.mockReturnValue(new Promise(() => {}));
    const { GET } = await import("@/app/api/health/route");
    const response = GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.listingRenders).toMatchObject({ max: 8, active: 0 });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("/api/ready (database)", () => {
  it("is 200 when SELECT 1 answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const { GET } = await import("@/app/api/ready/route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, db: "up" });
  });

  it("is 503 after 1.5 s when the database does not answer", async () => {
    vi.useFakeTimers();
    queryRaw.mockReturnValue(new Promise(() => {}));
    const { GET } = await import("@/app/api/ready/route");
    const pending = GET();
    await vi.advanceTimersByTimeAsync(1_500);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, db: "timeout" });
  });

  it("is 503 without leaking the error message when the query fails", async () => {
    queryRaw.mockRejectedValue(new Error("password authentication failed for user secret_user"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { GET } = await import("@/app/api/ready/route");
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ ok: false, db: "down" });
    expect(JSON.stringify(body)).not.toContain("secret_user");
  });
});
