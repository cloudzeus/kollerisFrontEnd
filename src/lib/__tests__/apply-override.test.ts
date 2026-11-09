import { describe, expect, it } from "vitest";
import { resolveSeoText } from "@/lib/seo/apply-override";

const auto = { title: "A", description: "B" };

describe("resolveSeoText", () => {
  it("χωρίς override: το auto, metaTitle απλό κείμενο", () =>
    expect(resolveSeoText(auto, null)).toEqual({ title: "A", description: "B", metaTitle: "A" }));

  it("με override: metaTitle absolute", () =>
    expect(resolveSeoText(auto, { seoTitle: "T | Kolleris", metaDescription: null, faq: null, h1: null, intro: null, ogDescription: null }).metaTitle).toEqual({ absolute: "T | Kolleris" }));

  it("μόνο description: ο τίτλος μένει auto", () =>
    expect(resolveSeoText(auto, { seoTitle: null, metaDescription: "D", faq: null, h1: null, intro: null, ogDescription: null })).toEqual({ title: "A", description: "D", metaTitle: "A" }));
});
