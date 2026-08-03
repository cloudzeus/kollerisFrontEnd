import { describe, expect, it } from "vitest";
import { openState } from "@/lib/contact/hours";

/**
 * Times are given as UTC and read back in Europe/Athens, which is the whole
 * point: the server may run anywhere, and Greece observes DST — a fixed +2
 * offset is wrong for half the year and nobody notices until October.
 */
const at = (iso: string) => openState(new Date(iso));

describe("openState", () => {
  it("is open mid-morning on a weekday", () => {
    // Fri 31 Jul 2026, 10:00 UTC = 13:00 Athens (summer, +3).
    const state = at("2026-07-31T10:00:00Z");
    expect(state.open).toBe(true);
    expect(state.now).toBe("13:00");
    // The decision, not the wording — the sentence is assembled on the page in
    // whichever of the three languages is being read.
    expect(state.label).toEqual({ state: "open", until: "16:30" });
  });

  it("is closed before opening, and says when it opens", () => {
    // Fri 06:00 Athens.
    const state = at("2026-07-31T03:00:00Z");
    expect(state.open).toBe(false);
    expect(state.label).toEqual({ state: "opens", when: "today", at: "08:00" });
  });

  it("is closed after 16:30 and points at the next day", () => {
    // Thu 17:00 Athens.
    const state = at("2026-07-30T14:00:00Z");
    expect(state.open).toBe(false);
    expect(state.label).toEqual({ state: "opens", when: "tomorrow", at: "08:00" });
  });

  it("skips the weekend from Friday evening", () => {
    // Fri 20:00 Athens → next opening is Monday.
    const state = at("2026-07-31T17:00:00Z");
    expect(state.open).toBe(false);
    // 1 = Monday, in `Date#getDay` numbering.
    expect(state.label).toEqual({ state: "opens", when: "day", day: 1, at: "08:00" });
  });

  it("is closed all Saturday and Sunday", () => {
    expect(at("2026-08-01T09:00:00Z").open).toBe(false); // Sat 12:00
    expect(at("2026-08-02T09:00:00Z").open).toBe(false); // Sun 12:00
  });

  it("handles winter time, when Athens is +2 not +3", () => {
    // Mon 12 Jan 2026, 07:00 UTC = 09:00 Athens — open.
    const winter = at("2026-01-12T07:00:00Z");
    expect(winter.now).toBe("09:00");
    expect(winter.open).toBe(true);
  });

  it("counts the minutes left so the page can nudge", () => {
    // Fri 16:00 Athens, half an hour before close.
    const state = at("2026-07-31T13:00:00Z");
    expect(state.open).toBe(true);
    expect(state.minutesUntilChange).toBe(30);
  });
});
