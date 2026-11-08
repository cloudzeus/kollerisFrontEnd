import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { priceLabel } from "../google-merchant";

describe("priceLabel", () => {
  it("labels a product selling above 150 EUR with VAT", () => {
    expect(priceLabel(150.01)).toBe("over_150");
  });

  it("leaves a product at exactly 150 EUR unlabelled", () => {
    expect(priceLabel(150)).toBeNull();
  });

  it("leaves a cheap product unlabelled", () => {
    expect(priceLabel(5.56)).toBeNull();
  });
});
