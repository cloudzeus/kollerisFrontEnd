import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/prisma", async () => (await import("./request-fakes")).mockModules.prisma());
vi.mock("@/lib/payment/viva", async () => (await import("./request-fakes")).mockModules.viva());

import { outside, resetFakes, seedRequest } from "./request-fakes";
import { GET } from "@/app/api/payment/pay/[orderNumber]/route";
import { requestSweepConfig } from "@/lib/requests/request-sweep-schedule";

beforeEach(() => {
  resetFakes();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the never-expiring payment link refuses a request that was not accepted", () => {
  it.each(["REQUESTED", "OFFERED", "DECLINED", "EXPIRED", "REJECTED"])("%s → no Viva order", async (status) => {
    seedRequest({ requestStatus: status, guestToken: "g" });
    const req = new Request("https://kolleris.test/api/payment/pay/KOL-20261013-0002?t=g");
    const res = await GET(Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest, {
      params: Promise.resolve({ orderNumber: "KOL-20261013-0002" }),
    });
    expect(res.status).toBe(303);
    expect(outside.createPaymentOrder).not.toHaveBeenCalled();
  });

  it("an ACCEPTED, unpaid request can be paid from the link", async () => {
    seedRequest({ requestStatus: "ACCEPTED", guestToken: "g" });
    const req = new Request("https://kolleris.test/api/payment/pay/KOL-20261013-0002?t=g");
    await GET(Object.assign(req, { nextUrl: new URL(req.url) }) as unknown as NextRequest, {
      params: Promise.resolve({ orderNumber: "KOL-20261013-0002" }),
    });
    expect(outside.createPaymentOrder).toHaveBeenCalledTimes(1);
  });

});

describe("request sweep schedule config", () => {
  it("is off outside production unless asked for, and clamps the interval", () => {
    expect(requestSweepConfig({ NODE_ENV: "development" })).toMatchObject({ enabled: false });
    expect(requestSweepConfig({ NODE_ENV: "development", REQUEST_SWEEP_ENABLED: "on" })).toEqual({ enabled: true, intervalMin: 15 });
    expect(requestSweepConfig({ NODE_ENV: "production" })).toEqual({ enabled: true, intervalMin: 15 });
    expect(requestSweepConfig({ NODE_ENV: "production", REQUEST_SWEEP_ENABLED: "off" })).toMatchObject({ enabled: false });
    expect(requestSweepConfig({ NODE_ENV: "production", REQUEST_SWEEP_INTERVAL_MIN: "1" })).toEqual({ enabled: true, intervalMin: 5 });
  });
});
