import { describe, expect, it } from "vitest";
import {
  changedChildTables,
  CHILD_TABLES,
  pickFreeSlug,
  slugCandidates,
  tableFingerprint,
  type ChildRows,
} from "@/lib/sync/product-children";

/**
 * The skip that saves ten statements per product.
 *
 * A false "unchanged" is the failure that matters — the storefront keeps old
 * images or specs with nothing to say so — so most of these pin that a real
 * difference is always seen, and the rest that noise from the database round
 * trip is not mistaken for one.
 */

function rows(): ChildRows {
  return {
    images: [
      { url: "https://cdn/a.jpg", isFeature: true, order: 0 },
      { url: "https://cdn/b.jpg", isFeature: false, order: 1 },
    ],
    translations: [
      {
        locale: "el",
        name: "Δράπανο",
        shortDescription: null,
        longDescription: "<p>Περιγραφή</p>",
        searchKey: "δραπανο",
      },
    ],
    specs: [
      {
        locale: "el",
        fieldKey: "voltage",
        fieldGroup: "technical",
        label: "Τάση",
        value: "18 V",
        valueNumeric: 18,
        unit: "V",
        order: 8,
      },
    ],
    colors: [{ externalId: "c1", name: "Κόκκινο", order: 0 }],
    sizes: [{ externalId: "s1", label: "M", family: "Ρούχα", order: 0 }],
  };
}

/** What Prisma hands back for a `Decimal` column. */
const decimal = (s: string) => ({ toString: () => s });

describe("changedChildTables", () => {
  it("rewrites everything when nothing is stored", () => {
    expect(changedChildTables(rows(), undefined)).toEqual([...CHILD_TABLES]);
  });

  it("skips every table when the stored rows match", () => {
    expect(changedChildTables(rows(), rows())).toEqual([]);
  });

  it("ignores the order rows come back from the database in", () => {
    const stored = rows();
    stored.images.reverse();
    expect(changedChildTables(rows(), stored)).toEqual([]);
  });

  it("treats a Decimal read back at four places as the number that was written", () => {
    const desired = rows();
    desired.specs[0].valueNumeric = 1.23456;
    const stored = rows();
    stored.specs[0].valueNumeric = decimal("1.2346");
    expect(changedChildTables(desired, stored)).toEqual([]);
  });

  it("treats undefined and null as the same stored value", () => {
    const desired = rows();
    (desired.translations[0] as { shortDescription: unknown }).shortDescription = undefined;
    expect(changedChildTables(desired, rows())).toEqual([]);
  });

  it("names only the table that changed", () => {
    const desired = rows();
    desired.specs[0].value = "20 V";
    desired.specs[0].valueNumeric = 20;
    expect(changedChildTables(desired, rows())).toEqual(["specs"]);
  });

  it("sees a change in any single field", () => {
    const mutations: Array<(r: ChildRows) => void> = [
      (r) => (r.images[0].url = "https://cdn/c.jpg"),
      (r) => (r.images[1].isFeature = true),
      (r) => (r.images[1].order = 5),
      (r) => (r.translations[0].longDescription = "<p>Άλλη</p>"),
      (r) => (r.translations[0].shortDescription = ""),
      (r) => (r.translations[0].name = "Κατσαβίδι"),
      (r) => (r.specs[0].label = null),
      (r) => (r.specs[0].unit = "W"),
      (r) => (r.specs[0].valueNumeric = null),
      (r) => (r.colors[0].name = "Μπλε"),
      (r) => (r.sizes[0].family = null),
      (r) => (r.sizes[0].label = "L"),
    ];
    for (const mutate of mutations) {
      const desired = rows();
      mutate(desired);
      expect(changedChildTables(desired, rows())).toHaveLength(1);
    }
  });

  it("sees a row added or removed", () => {
    const more = rows();
    more.colors.push({ externalId: "c2", name: "Μπλε", order: 1 });
    expect(changedChildTables(more, rows())).toEqual(["colors"]);

    const fewer = rows();
    fewer.images = [];
    expect(changedChildTables(fewer, rows())).toEqual(["images"]);
  });

  it("does not let values run together across fields", () => {
    // "a" + "bc" and "ab" + "c" must not hash alike.
    const a = [{ externalId: "a", name: "bc", order: 0 }];
    const b = [{ externalId: "ab", name: "c", order: 0 }];
    expect(tableFingerprint("colors", a)).not.toBe(tableFingerprint("colors", b));
  });
});

describe("slug allocation", () => {
  it("numbers candidates the way uniqueSlug always has", () => {
    expect(slugCandidates("drapano", 1, 3)).toEqual(["drapano", "drapano-2", "drapano-3"]);
    expect(slugCandidates("drapano", 26, 27)).toEqual(["drapano-26", "drapano-27"]);
  });

  it("takes the bare root when it is free", () => {
    expect(pickFreeSlug("drapano", new Set(), 25)).toBe("drapano");
  });

  it("skips taken candidates", () => {
    expect(pickFreeSlug("drapano", new Set(["drapano", "drapano-2"]), 25)).toBe("drapano-3");
  });

  it("returns null rather than guessing past the range it was asked about", () => {
    const taken = new Set(slugCandidates("drapano", 1, 25));
    expect(pickFreeSlug("drapano", taken, 25)).toBeNull();
  });
});
