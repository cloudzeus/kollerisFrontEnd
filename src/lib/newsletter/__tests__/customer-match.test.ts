import { describe, expect, it } from "vitest";
import { buildCustomerMatchCsv, toE164 } from "../customer-match";

describe("toE164", () => {
  it("adds +30 to Greek mobiles and landlines", () => {
    expect(toE164("694 123 4567")).toBe("+306941234567");
    expect(toE164("210-1234567")).toBe("+302101234567");
  });
  it("keeps international numbers and turns 00 into +", () => {
    expect(toE164("+49 151 23456789")).toBe("+4915123456789");
    expect(toE164("0030 6941234567")).toBe("+306941234567");
  });
  it("drops numbers it cannot read", () => {
    expect(toE164("12345")).toBe("");
    expect(toE164(null)).toBe("");
    expect(toE164("6941234567", "DE")).toBe("");
  });
});

describe("buildCustomerMatchCsv", () => {
  it("writes Google's header and one normalised row per person", () => {
    const csv = buildCustomerMatchCsv([
      { email: " Nikos@Example.GR ", phone: "6941234567", firstName: "Νίκος", lastName: "Παπάς, Jr", zip: "104 31" },
    ]);
    expect(csv).toBe(
      'Email,Phone,First Name,Last Name,Country,Zip\r\nnikos@example.gr,+306941234567,Νίκος,"Παπάς, Jr",GR,10431\r\n',
    );
  });
});
