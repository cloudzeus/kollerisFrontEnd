import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The shop's two calls into HDCtool for EU sales: the VIES check and the DHL
 * quote. Fetch is mocked; the shared HDCtool client does auth and status
 * handling, so these tests cover the real HTTP paths.
 */

const UNAVAILABLE_COPY =
  "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("HDCTOOL_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const { checkEuVat, quoteDhl } = await import("./hdctool-eu");

describe("checkEuVat", () => {
  it("posts { vat, country } to the public VAT check with the shop's bearer", async () => {
    fetchMock.mockResolvedValue(
      json(200, { status: "valid", name: "ACME GMBH", address: "X", consultationNumber: "WAPIAAAA", checkedAt: "2026-10-27T08:00:00Z", message: "ok" }),
    );
    await checkEuVat("DE123456789", "DE");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/public\/vat\/check$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ vat: "DE123456789", country: "DE" });
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("maps a valid answer through", async () => {
    fetchMock.mockResolvedValue(
      json(200, { status: "valid", name: "ACME GMBH", address: "X", consultationNumber: "WAPIAAAA", checkedAt: "2026-10-27T08:00:00Z", message: "ok" }),
    );
    expect(await checkEuVat("DE123456789", "DE")).toEqual({
      status: "valid",
      name: "ACME GMBH",
      address: "X",
      consultationNumber: "WAPIAAAA",
      checkedAt: "2026-10-27T08:00:00Z",
      message: "ok",
    });
  });

  it("«---» from VIES is no value", async () => {
    fetchMock.mockResolvedValue(
      json(200, { status: "valid", name: "---", address: "---", consultationNumber: "WAPIAAAA", checkedAt: "2026-10-27T08:00:00Z", message: "ok" }),
    );
    expect(await checkEuVat("DE123456789", "DE")).toMatchObject({ name: null, address: null });
  });

  it.each(["invalid", "invalid_format"] as const)("maps %s through", async (status) => {
    fetchMock.mockResolvedValue(
      json(200, { status, name: null, address: null, consultationNumber: null, checkedAt: null, message: "m" }),
    );
    const r = await checkEuVat("DE1", "DE");
    expect(r).toMatchObject({ status, name: null, consultationNumber: null, message: "m" });
  });

  it("passes through unavailable from the server", async () => {
    fetchMock.mockResolvedValue(json(200, { status: "unavailable", message: "VIES down" }));
    expect(await checkEuVat("DE123456789", "DE")).toMatchObject({ status: "unavailable", message: "VIES down", name: null });
  });

  it("429 is unavailable, with the server's message", async () => {
    fetchMock.mockResolvedValue(json(429, { status: "unavailable", message: "Πολλά αιτήματα" }));
    expect(await checkEuVat("DE123456789", "DE")).toMatchObject({ status: "unavailable", message: "Πολλά αιτήματα" });
  });

  it("5xx is unavailable, with the fallback copy", async () => {
    fetchMock.mockResolvedValue(json(502, { error: "bad gateway" }));
    expect(await checkEuVat("DE123456789", "DE")).toEqual({
      status: "unavailable",
      name: null,
      address: null,
      consultationNumber: null,
      checkedAt: null,
      message: UNAVAILABLE_COPY,
    });
  });

  it("a network error is unavailable, never a throw", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await checkEuVat("DE123456789", "DE")).toMatchObject({ status: "unavailable", message: UNAVAILABLE_COPY });
  });

  it("an unknown status or a garbled body is unavailable, never valid", async () => {
    fetchMock.mockResolvedValue(json(200, { status: "maybe" }));
    expect(await checkEuVat("DE123456789", "DE")).toMatchObject({ status: "unavailable" });
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));
    expect(await checkEuVat("DE123456789", "DE")).toMatchObject({ status: "unavailable" });
  });
});

describe("quoteDhl", () => {
  const input = { country: "DE", postcode: "10115", city: "Berlin", weightKg: 2.4 };
  const ok = {
    success: true,
    carrier: "DHL",
    productCode: "U",
    productName: "EXPRESS WORLDWIDE EU",
    netAmount: 31.4,
    vatRate: 24,
    grossAmount: 38.94,
    currency: "EUR",
    estimatedDeliveryDate: "2026-10-30",
    transitDays: 3,
  };

  it("posts the parcel to the public quote endpoint", async () => {
    fetchMock.mockResolvedValue(json(200, ok));
    await quoteDhl(input);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/public\/courier\/quote$/);
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("maps a quote and stamps quotedAt with the time of the call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T09:30:00.000Z"));
    try {
      fetchMock.mockResolvedValue(json(200, ok));
      expect(await quoteDhl(input)).toEqual({
        ok: true,
        productCode: "U",
        productName: "EXPRESS WORLDWIDE EU",
        netAmount: 31.4,
        vatRate: 24,
        grossAmount: 38.94,
        quotedAt: "2026-10-27T09:30:00.000Z",
        estimatedDeliveryDate: "2026-10-30",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("omits estimatedDeliveryDate when DHL gave none", async () => {
    fetchMock.mockResolvedValue(json(200, { ...ok, estimatedDeliveryDate: undefined }));
    const r = await quoteDhl(input);
    expect(r).toMatchObject({ ok: true });
    expect(r).not.toHaveProperty("estimatedDeliveryDate");
  });

  it.each(["unsupported_country", "invalid_postcode", "unserviceable_postcode"] as const)(
    "422 %s is a refusal about the place",
    async (error) => {
      fetchMock.mockResolvedValue(json(422, { success: false, error }));
      expect(await quoteDhl(input)).toEqual({ ok: false, reason: error });
    },
  );

  it.each([502, 504, 500])("%s is unavailable", async (status) => {
    fetchMock.mockResolvedValue(json(status, { success: false, error: "upstream" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a network error is unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("an unknown 422 code is unavailable, not a guess", async () => {
    fetchMock.mockResolvedValue(json(422, { success: false, error: "weird" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a 200 without a usable price is unavailable", async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, carrier: "DHL" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "unavailable" });
    fetchMock.mockResolvedValue(json(200, { success: false, error: "invalid_postcode" }));
    expect(await quoteDhl(input)).toEqual({ ok: false, reason: "invalid_postcode" });
  });
});
