import { describe, expect, it } from "vitest";
import { localHour } from "@/lib/sync/reconcile-schedule";

/**
 * The clock the nightly reconcile runs on.
 *
 * Small surface, but the whole schedule hangs off it: an hour that is wrong by
 * one puts a full catalogue comparison either at a time nobody expects it or,
 * if it drifts past the target hour entirely, never. Greece changes offset
 * twice a year, so both halves of the year are pinned here.
 */
describe("localHour", () => {
  it("reads summer time as UTC+3", () => {
    // 4 August, 01:00 UTC → 04:00 in Athens (EEST).
    expect(localHour(new Date("2026-08-04T01:00:00Z"))).toBe(4);
  });

  it("reads winter time as UTC+2", () => {
    // 4 January, 02:00 UTC → 04:00 in Athens (EET). An offset hardcoded to +3
    // would answer 5 here, and the reconcile would run an hour late all winter.
    expect(localHour(new Date("2026-01-04T02:00:00Z"))).toBe(4);
  });

  it("returns 0 rather than 24 at midnight", () => {
    // `en-GB` without `hourCycle: "h23"` formats midnight as "24", which never
    // equals any target hour and would silently disable a schedule set to 0.
    expect(localHour(new Date("2026-08-03T21:00:00Z"))).toBe(0);
  });

  it("is a whole hour between 0 and 23 across the day", () => {
    for (let h = 0; h < 24; h++) {
      const value = localHour(new Date(Date.UTC(2026, 7, 4, h)));
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(23);
    }
  });
});
