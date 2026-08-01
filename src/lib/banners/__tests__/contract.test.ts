import { describe, expect, it } from "vitest";
import {
  bannerState,
  cellStyle,
  emptyComposition,
  newLayer,
  offerStatus,
  validateGrid,
  type BannerContent,
  type GridCell,
} from "../contract";

/**
 * The two rules a banner cannot get wrong quietly.
 *
 * `validateGrid` is what lets the builder be freehand at all — without it an
 * overlap or a hole reaches the storefront looking like a rendering bug rather
 * than a drawing mistake. `bannerState` decides whether an editor is told their
 * live banner has unpublished edits, which is the single most misread state in
 * the whole feature.
 */

const cell = (id: string, x: number, y: number, w: number, h: number): GridCell => ({
  id,
  name: id,
  x,
  y,
  w,
  h,
});

describe("validateGrid", () => {
  it("accepts the layout from the client's own sketch", () => {
    // A full-height left cell beside two stacked right cells, on 12×6.
    const cells = [cell("zone1", 0, 0, 9, 6), cell("zone2", 9, 0, 3, 3), cell("zone3", 9, 3, 3, 3)];
    expect(validateGrid(cells, 12, 6)).toEqual({ ok: true });
  });

  it("names both cells when two overlap", () => {
    const cells = [cell("a", 0, 0, 6, 6), cell("b", 5, 0, 7, 6)];
    const result = validateGrid(cells, 12, 6);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Both names, because "cells overlap" sends somebody hunting.
      expect(result.error).toContain("a");
      expect(result.error).toContain("b");
    }
  });

  it("counts the empty squares when the grid has holes", () => {
    const cells = [cell("a", 0, 0, 6, 6)];
    const result = validateGrid(cells, 12, 6);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("36");
  });

  it("rejects a cell that runs off the grid", () => {
    const result = validateGrid([cell("a", 10, 0, 4, 6)], 12, 6);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("εκτός");
  });

  it("rejects duplicate cell ids", () => {
    // Two cells sharing an id means one widget map entry for two cells — the
    // second would silently render the first's content.
    const cells = [cell("a", 0, 0, 6, 6), { ...cell("a", 6, 0, 6, 6) }];
    const result = validateGrid(cells, 12, 6);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Διπλό");
  });

  it("rejects a zero-sized cell", () => {
    const result = validateGrid([cell("a", 0, 0, 0, 6)], 12, 6);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty grid", () => {
    expect(validateGrid([], 12, 6).ok).toBe(false);
  });
});

describe("bannerState", () => {
  const content = (title: string): BannerContent => ({
    cells: { zone1: { ...emptyComposition(), href: title } },
  });

  it("is empty before anything is written", () => {
    expect(bannerState(null, null)).toBe("empty");
  });

  it("is draft while nothing has ever been published", () => {
    expect(bannerState(content("a"), null)).toBe("draft");
  });

  it("is published when the draft matches what is live", () => {
    expect(bannerState(content("a"), content("a"))).toBe("published");
  });

  it("is modified when a live banner has unpublished edits", () => {
    // The state that matters: the storefront still shows the old version, and
    // somebody is about to assume otherwise.
    expect(bannerState(content("b"), content("a"))).toBe("modified");
  });

  it("ignores key order", () => {
    // Both sides live in a jsonb column, which reorders keys, and the editor
    // compares an object built in the browser against one that came back
    // through the database. Comparing raw JSON reported every published banner
    // as modified — the badge lying in the reassuring direction.
    const written = { cells: { z1: { href: "/a", binding: { source: "none" }, layers: [] } } };
    const returned = { cells: { z1: { layers: [], binding: { source: "none" }, href: "/a" } } };
    expect(JSON.stringify(written)).not.toBe(JSON.stringify(returned));
    expect(bannerState(written as never, returned as never)).toBe("published");
  });

  it("treats an absent key and an undefined one as the same content", () => {
    const a = { cells: { z1: { href: "/a", name: undefined } } };
    const b = { cells: { z1: { href: "/a" } } };
    expect(bannerState(a as never, b as never)).toBe("published");
  });

  it("does not ignore a real difference nested deep in a widget", () => {
    const a = { cells: { z1: { background: { color: "ink", overlay: "medium" } } } };
    const b = { cells: { z1: { background: { overlay: "medium", color: "white" } } } };
    expect(bannerState(a as never, b as never)).toBe("modified");
  });
});

describe("offerStatus", () => {
  const now = new Date("2026-08-01T12:00:00Z");
  const march = new Date("2026-03-01T00:00:00Z");
  const april = new Date("2026-04-01T00:00:00Z");
  const september = new Date("2026-09-01T00:00:00Z");

  it("is live when switched on and inside its dates", () => {
    expect(offerStatus({ isActive: true, startsAt: march, endsAt: september }, now)).toBe("live");
  });

  it("is live when switched on with no dates at all", () => {
    expect(offerStatus({ isActive: true, startsAt: null, endsAt: null }, now)).toBe("live");
  });

  it("is expired once the end date passes, whatever the switch says", () => {
    // The case the column exists for: still `isActive` in the database, and
    // invisible on the site since April.
    expect(offerStatus({ isActive: true, startsAt: march, endsAt: april }, now)).toBe("expired");
  });

  it("is scheduled before the start date", () => {
    expect(offerStatus({ isActive: true, startsAt: september, endsAt: null }, now)).toBe("scheduled");
  });

  it("is off when the switch vetoes, even inside its dates", () => {
    expect(offerStatus({ isActive: false, startsAt: march, endsAt: september }, now)).toBe("off");
  });

  it("treats the end instant as already over", () => {
    expect(offerStatus({ isActive: true, startsAt: march, endsAt: now }, now)).toBe("expired");
  });
});

describe("cellStyle", () => {
  it("converts grid units to 1-based CSS grid lines", () => {
    expect(cellStyle(cell("a", 9, 3, 3, 3))).toEqual({
      gridColumn: "10 / span 3",
      gridRow: "4 / span 3",
    });
  });
});

describe("newLayer", () => {
  it("places a new layer somewhere visible", () => {
    // A layer dropped at 0,0 with no size means the first thing anybody does is
    // fight it into view.
    for (const kind of ["text", "badge", "button", "image", "shape"] as const) {
      const layer = newLayer(kind);
      expect(layer.frame.w).toBeGreaterThan(0);
      expect(layer.frame.h).toBeGreaterThan(0);
      expect(layer.frame.x).toBeLessThan(100);
      expect(layer.frame.y).toBeLessThan(100);
    }
  });

  it("gives every layer a unique id", () => {
    const ids = new Set(Array.from({ length: 40 }, () => newLayer("text").id));
    expect(ids.size).toBe(40);
  });

  it("starts every layer unanimated", () => {
    // An entrance nobody asked for is the default that makes a page feel cheap.
    expect(newLayer("text").anim.preset).toBe("none");
  });
});
