import { describe, expect, it } from "vitest";
import { internationalCopy } from "@/lib/shipping/international-copy";

describe("internationalCopy and Cyprus", () => {
  it("promises Cyprus only when Cyprus is offered", () => {
    for (const locale of ["el", "en"]) {
      const withCy = internationalCopy(locale, { cyprus: true });
      const without = internationalCopy(locale, { cyprus: false });
      for (const key of ["zone", "foreign", "country"] as const) {
        expect(withCy[key]).toMatch(/Κύπρο|Cyprus/);
        expect(without[key]).not.toMatch(/Κύπρο|Cyprus/);
      }
    }
  });
  it("defaults to today's wording (Cyprus offered)", () => {
    expect(internationalCopy("el").country).toContain("Κύπρο");
  });
});
