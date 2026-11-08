import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { findUnique, upsert, revalidatePath } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { seoPageOverride: { findUnique, upsert } } }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { signPayload } from "@/lib/webhooks/hdc-signature";
import { POST } from "@/app/api/webhooks/hdctool/seo-override/route";

const SECRET = "test-secret";
const now = () => Math.floor(Date.now() / 1000);

function signed(body: unknown, opts: { secret?: string; timestamp?: number; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.timestamp ?? now();
  return new Request("https://kolleris.test/api/webhooks/hdctool/seo-override", {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-hdc-signature": signPayload(raw, opts.secret ?? SECRET, ts),
      "x-hdc-timestamp": String(ts),
    },
  }) as unknown as NextRequest;
}

const apply = { op: "apply", path: "/", fields: { seoTitle: "new" }, updatedBy: "u@x" };
const undo = { op: "undo", path: "/", restore: { seoTitle: "old" }, expected: { seoTitle: "new" }, updatedBy: "u@x" };

beforeEach(() => {
  vi.stubEnv("HDCTOOL_WEBHOOK_SECRET", SECRET);
  findUnique.mockReset().mockResolvedValue({ seoTitle: "new", metaDescription: null, faq: null });
  upsert.mockReset();
  revalidatePath.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/webhooks/hdctool/seo-override", () => {
  it("503 χωρίς HDCTOOL_WEBHOOK_SECRET", async () => {
    vi.stubEnv("HDCTOOL_WEBHOOK_SECRET", "");
    expect((await POST(signed(apply))).status).toBe(503);
  });

  it("401 σε λάθος υπογραφή", async () => {
    expect((await POST(signed(apply, { secret: "nope" }))).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("401 σε timestamp 301s πίσω", async () => {
    expect((await POST(signed(apply, { timestamp: now() - 301 }))).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("400 σε άκυρο JSON με σωστή υπογραφή", async () => {
    expect((await POST(signed(null, { raw: "{nope" }))).status).toBe(400);
  });

  it("revalidatePath('/', 'layout') μετά από apply και undo", async () => {
    expect((await POST(signed(apply))).status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    revalidatePath.mockClear();
    expect((await POST(signed(undo))).status).toBe(200);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("κανένα revalidatePath σε read και σε 422/409", async () => {
    const read = await POST(signed({ op: "read", path: "/" }));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ ok: true, supported: true });
    expect((await POST(signed({ ...apply, path: "/etaireia" }))).status).toBe(422);
    findUnique.mockResolvedValue({ seoTitle: "changed", metaDescription: null, faq: null });
    expect((await POST(signed(undo))).status).toBe(409);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
