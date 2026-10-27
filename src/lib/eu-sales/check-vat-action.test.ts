import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The checkout's «Έλεγχος» button (intra-EU sales design §3.2): a server
 * action that asks HDCtool, remembers the answer for the summary beside the
 * form, and is limited to 10 checks per 10 minutes per basket.
 */

const mocks = vi.hoisted(() => ({
  checkEuVat: vi.fn(),
  cookieSet: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  revalidatePath: vi.fn(),
  cartToken: vi.fn(),
  ip: { value: "203.0.113.7" as string | null },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet, get: mocks.cookieGet, delete: mocks.cookieDelete }),
  headers: async () => new Headers(mocks.ip.value ? { "x-real-ip": mocks.ip.value } : {}),
}));
vi.mock("@/lib/cart/cart", () => ({ getCartToken: mocks.cartToken }));
vi.mock("@/lib/eu-sales/hdctool-eu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/eu-sales/hdctool-eu")>()),
  checkEuVat: mocks.checkEuVat,
}));

const { checkVatAction, setCustomerTypeAction } = await import("@/lib/eu-sales/check-vat-action");
const { resetVatCheckLimit } = await import("@/lib/eu-sales/vat-check-limit");
const { EU_BUYER_COOKIE, parseEuBuyer } = await import("@/lib/eu-sales/buyer-cookie");

const valid = {
  status: "valid",
  name: "ACME GMBH",
  address: "BERLIN",
  consultationNumber: "WAPI1",
  checkedAt: "2026-10-27T09:00:00.000Z",
  message: "Ο ΑΦΜ είναι ενεργός στο VIES",
};

function storedBuyer() {
  const call = mocks.cookieSet.mock.calls.at(-1)!;
  expect(call[0]).toBe(EU_BUYER_COOKIE);
  return parseEuBuyer(call[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetVatCheckLimit();
  mocks.ip.value = "203.0.113.7";
  process.env.EU_SALES_ENABLED = "true";
  mocks.cartToken.mockResolvedValue("cart-1");
  mocks.checkEuVat.mockResolvedValue(valid);
});

describe("checkVatAction", () => {
  it("valid: the spec's line with the VIES name, and the answer is remembered for this country", async () => {
    const answer = await checkVatAction({ country: "DE", vat: "de 123 456 789", locale: "el" });
    expect(mocks.checkEuVat).toHaveBeenCalledWith("DE123456789", "DE");
    expect(answer).toEqual({
      status: "valid",
      vat: "DE123456789",
      name: "ACME GMBH",
      message: "Επιβεβαιώθηκε στο VIES: ACME GMBH",
    });
    expect(storedBuyer()).toEqual({
      customerType: "company",
      vies: { country: "DE", vat: "DE123456789", status: "valid", checkedAt: valid.checkedAt },
    });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("invalid: the spec's sentence", async () => {
    mocks.checkEuVat.mockResolvedValue({ ...valid, status: "invalid", name: null });
    const answer = await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(answer.message).toBe("Ο ΑΦΜ δεν είναι ενεργός στο VIES — η παραγγελία θα χρεωθεί με ΦΠΑ");
  });

  it("unavailable: the spec's sentence", async () => {
    mocks.checkEuVat.mockResolvedValue({ ...valid, status: "unavailable", name: null, checkedAt: null });
    const answer = await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(answer).toMatchObject({
      status: "unavailable",
      message: "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ",
    });
  });

  it("a prefix for another country: invalid_format, and VIES is not asked", async () => {
    const answer = await checkVatAction({ country: "DE", vat: "FR12345678901" });
    expect(answer.status).toBe("invalid_format");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
  });

  it("Greece is never sent to VIES", async () => {
    const answer = await checkVatAction({ country: "GR", vat: "EL099095556" });
    expect(answer.status).toBe("invalid_format");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
  });

  it("flag off: nothing is asked", async () => {
    process.env.EU_SALES_ENABLED = "";
    const answer = await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(answer.status).toBe("unavailable");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
  });

  it("10 checks per 10 minutes per basket; the 11th is not sent", async () => {
    for (let i = 0; i < 10; i++) await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(10);
    const answer = await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(answer.status).toBe("unavailable");
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(10);
    // Another basket has its own budget.
    mocks.cartToken.mockResolvedValue("cart-2");
    await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(11);
  });

  it("a fresh cart cookie per call does not buy unlimited checks: the IP is limited too (R11-I3)", async () => {
    for (let i = 0; i < 30; i++) {
      mocks.cartToken.mockResolvedValue(`rotated-${i}`);
      await checkVatAction({ country: "DE", vat: "DE123456789" });
    }
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(30);
    mocks.cartToken.mockResolvedValue("rotated-31");
    const answer = await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(answer.status).toBe("unavailable");
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(30);
    // Another address has its own budget.
    mocks.ip.value = "198.51.100.9";
    mocks.cartToken.mockResolvedValue("rotated-32");
    await checkVatAction({ country: "DE", vat: "DE123456789" });
    expect(mocks.checkEuVat).toHaveBeenCalledTimes(31);
  });

  it("no basket, no check", async () => {
    mocks.cartToken.mockResolvedValue(null);
    expect((await checkVatAction({ country: "DE", vat: "DE123456789" })).status).toBe("unavailable");
    expect(mocks.checkEuVat).not.toHaveBeenCalled();
  });
});

describe("setCustomerTypeAction", () => {
  it("«Ιδιώτης» forgets the VIES answer at once, so the summary charges VAT again (Review Focus 2)", async () => {
    mocks.cookieGet.mockReturnValue({
      value: JSON.stringify({
        customerType: "company",
        vies: { country: "DE", vat: "DE123456789", status: "valid", checkedAt: valid.checkedAt },
      }),
    });
    await setCustomerTypeAction({ customerType: "individual" });
    expect(storedBuyer()).toEqual({ customerType: "individual", vies: null });
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("«Εταιρεία» again (the VAT number was edited) also forgets the answer: no net for an unchecked number", async () => {
    mocks.cookieGet.mockReturnValue({
      value: JSON.stringify({
        customerType: "company",
        vies: { country: "DE", vat: "DE123456789", status: "valid", checkedAt: valid.checkedAt },
      }),
    });
    await setCustomerTypeAction({ customerType: "company" });
    expect(storedBuyer()).toEqual({ customerType: "company", vies: null });
  });
});
