import { describe, test, expect, vi, beforeEach } from "vitest";

// overrides.ts reads through the message-override cache, which hits prisma.
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { messageOverride: { findMany, upsert: vi.fn(), deleteMany: vi.fn() } },
}));

import { getPolicyBody, listPolicyBodies } from "@/lib/policies/overrides";
import { policyContentToHtml } from "@/lib/policies/content-html";
import { getPolicyContent } from "@/lib/policies/content";

beforeEach(() => {
  findMany.mockReset();
});

describe("getPolicyBody", () => {
  test("returns the operator's body when a row exists", async () => {
    findMany.mockResolvedValue([{ path: "policies.aporrito.body", value: "<p>ΝΕΑ πολιτική</p>" }]);
    expect(await getPolicyBody("aporrito", "el")).toBe("<p>ΝΕΑ πολιτική</p>");
  });

  test("sanitises the stored value on the way out", async () => {
    findMany.mockResolvedValue([
      { path: "policies.aporrito.body", value: "<p>ok</p><script>steal()</script>" },
    ]);
    const html = await getPolicyBody("aporrito", "en");
    expect(html).toBe("<p>ok</p>");
    expect(html).not.toContain("script");
  });

  test("returns null when the page has no override (structured content stands)", async () => {
    findMany.mockResolvedValue([{ path: "policies.aporrito.body", value: "<p>x</p>" }]);
    expect(await getPolicyBody("oroi-chrisis", "it")).toBeNull();
  });

  test("returns null — never throws — when the override read fails", async () => {
    findMany.mockRejectedValue(new Error("table missing"));
    expect(await getPolicyBody("aporrito", "el")).toBeNull();
  });
});

describe("listPolicyBodies", () => {
  test("pairs each page's override with its current structured body", async () => {
    findMany.mockResolvedValue([{ path: "policies.eggyiseis.body", value: "<p>Νέα εγγύηση</p>" }]);
    const views = await listPolicyBodies("el");

    expect(views).toHaveLength(6);
    const warranty = views.find((v) => v.slug === "eggyiseis")!;
    expect(warranty.override).toBe("<p>Νέα εγγύηση</p>");
    expect(warranty.current).toBe(policyContentToHtml(getPolicyContent("eggyiseis", "el")));

    const terms = views.find((v) => v.slug === "oroi-chrisis")!;
    expect(terms.override).toBeNull();
    expect(terms.current).toBe(policyContentToHtml(getPolicyContent("oroi-chrisis", "el")));
  });
});
