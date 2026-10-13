import { describe, expect, it } from "vitest";
import {
  SHIPPING_COPY,
  SHIPPING_COUNTRIES,
  checkDestination,
  destinationMessage,
  foreignCountryIn,
  validatePostcode,
} from "@/lib/shipping/destination";

/**
 * Order KOL-20261013-0002: an Italian address (37015 Sant'Ambrogio di
 * Valpolicella, Verona, "Italy") was accepted and charged the Greek-island
 * rate. These are the address-shape checks; the ACS "no station" refusal is in
 * `acs-live.test.ts`.
 */

describe("validatePostcode — Greece", () => {
  it.each([
    ["18545", "18545"], // Piraeus
    ["10431", "10431"], // Athens, the bottom of the range
    ["54622", "54622"], // Thessaloniki
    ["85100", "85100"], // Rhodes, the top of the range
    ["162 32", "16232"], // written with a space
    [" 71201 ", "71201"], // stray whitespace
  ])("accepts %j", (raw, clean) => {
    expect(validatePostcode(raw)).toEqual({ ok: true, postcode: clean, country: "GR" });
  });

  it("accepts 37015 — it looks Greek, so ACS has to be the one to refuse it", () => {
    expect(validatePostcode("37015")).toMatchObject({ ok: true, postcode: "37015" });
  });

  it.each(["01067", "09999", "00100"])("rejects %s — nothing Greek starts with 0", (raw) => {
    expect(validatePostcode(raw)).toEqual({ ok: false, reason: "range" });
  });

  it.each(["90210", "99084", "86000", "89999"])("rejects %s — nothing Greek is above 85xxx", (raw) => {
    expect(validatePostcode(raw)).toEqual({ ok: false, reason: "range" });
  });

  it.each(["", "1234", "123456", "1623 2", "16-232", "SW1A 1AA", "abcde", "16232a"])(
    "rejects %j by shape",
    (raw) => {
      expect(validatePostcode(raw)).toEqual({ ok: false, reason: "format" });
    },
  );

  it("treats null and undefined as missing", () => {
    expect(validatePostcode(null).ok).toBe(false);
    expect(validatePostcode(undefined).ok).toBe(false);
  });
});

describe("validatePostcode — Cyprus", () => {
  it("is not a destination yet", () => {
    expect(SHIPPING_COUNTRIES).toEqual(["GR"]);
    expect(validatePostcode("1010", "CY")).toEqual({ ok: false, reason: "country" });
  });

  it("is ready for when it is: four digits, 1000–9999", () => {
    const both = ["GR", "CY"] as const;
    expect(validatePostcode("1010", "CY", both)).toEqual({ ok: true, postcode: "1010", country: "CY" });
    expect(validatePostcode("8010", "CY", both)).toMatchObject({ ok: true });
    expect(validatePostcode("0100", "CY", both)).toEqual({ ok: false, reason: "range" });
    expect(validatePostcode("10100", "CY", both)).toEqual({ ok: false, reason: "format" });
  });

  it("a Cypriot postcode is not a Greek one", () => {
    expect(validatePostcode("1010")).toEqual({ ok: false, reason: "format" });
  });
});

describe("foreignCountryIn", () => {
  it.each([
    ["Italy", "italy"],
    ["ITALIA", "italia"],
    ["Verona, Italy", "italy"],
    ["München, Deutschland", "deutschland"],
    ["Wien, Österreich", "osterreich"],
    ["Paris France", "france"],
    ["London, United Kingdom", "united kingdom"],
    ["Ιταλία", "ιταλια"],
    ["ΓΕΡΜΑΝΙΑ", "γερμανια"],
    ["Σόφια, Βουλγαρία", "βουλγαρια"],
  ])("finds %j", (text, word) => {
    expect(foreignCountryIn(text)).toBe(word);
  });

  /*
   * Greek addresses name countries all the time — as streets, in the genitive.
   * None of these may be read as an address abroad.
   */
  it.each([
    "Ιταλίας 12",
    "Οδός Γαλλίας 5",
    "Λεωφ. Κύπρου 40",
    "Γερμανίας 3, Καλαμαριά",
    "Αγγλίας 8",
    "Βουλγαρίας 14",
    "Ελβετίας 2",
    "Αυστρίας 21",
    "Italias 12",
    "Κ. Μαυρομιχάλη 4",
    "Πειραιάς",
    "Αθήνα",
    "Θεσσαλονίκη",
    "Ηράκλειο Κρήτης",
    "Ηπείρου 10",
    "Αττική",
    "Πελοπόννησος",
    "Ανατολικής Μακεδονίας και Θράκης",
    "Τουρκοβούνια",
    "Νέα Σμύρνη",
    "Κωνσταντινουπόλεως 7",
    "Καισαρείας 1",
    "Μουσών 3",
    "Usaki",
    "",
  ])("does not flag %j", (text) => {
    expect(foreignCountryIn(text)).toBeNull();
  });
});

describe("checkDestination", () => {
  const greek = {
    shipLine1: "Κ. Μαυρομιχάλη 4",
    shipCity: "Πειραιάς",
    shipPostcode: "18545",
    shipRegion: "Αττικής",
    shipAdminRegion: "Αττική",
  };

  it("passes a Greek address", () => {
    expect(checkDestination(greek)).toEqual({ ok: true, postcode: "18545", country: "GR" });
  });

  it("flags the Verona order by its country word, on the field that holds it", () => {
    expect(
      checkDestination({
        shipLine1: "Via Roma 1, Terra",
        shipCity: "Sant'ambrogio di Valpolicella",
        shipPostcode: "37015",
        shipRegion: "Verona",
        shipAdminRegion: "Italy",
      }),
    ).toEqual({ ok: false, field: "shipAdminRegion", reason: "foreign_address" });
  });

  it("flags a postcode outside the Greek range on the postcode", () => {
    expect(checkDestination({ ...greek, shipPostcode: "90210" })).toEqual({
      ok: false,
      field: "shipPostcode",
      reason: "postcode_range",
    });
  });

  it("flags a malformed postcode on the postcode", () => {
    expect(checkDestination({ ...greek, shipPostcode: "1010" })).toEqual({
      ok: false,
      field: "shipPostcode",
      reason: "postcode_format",
    });
  });

  it("speaks Greek to Greek customers and English to the rest", () => {
    const failed = { ok: false, field: "shipPostcode", reason: "postcode_range" } as const;
    expect(destinationMessage(failed, "el")).toBe(SHIPPING_COPY.el.unserviceable);
    expect(destinationMessage(failed, "it")).toBe(SHIPPING_COPY.en.unserviceable);
    expect(
      destinationMessage({ ok: false, field: "shipCity", reason: "foreign_address" }, "en"),
    ).toBe(SHIPPING_COPY.en.foreign);
    expect(SHIPPING_COPY.el.unserviceable).toBe(
      "Ο ΤΚ δεν αντιστοιχεί σε περιοχή που εξυπηρετούμε. Αποστέλλουμε μόνο εντός Ελλάδας.",
    );
  });
});
