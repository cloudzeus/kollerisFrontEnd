import { describe, expect, it } from "vitest";
import {
  formatSpecValue,
  isEmptySpec,
  longRestatesShort,
  stripRestatement,
} from "@/lib/catalog/spec-format";

/** Every case below is a real pair from `product_specs`. */
describe("formatSpecValue", () => {
  it("does not repeat a unit the value already carries", () => {
    expect(formatSpecValue("220V", "V")).toBe("220V");
    expect(formatSpecValue("1100W", "W")).toBe("1100W");
    expect(formatSpecValue("50 Nm", "Nm")).toBe("50 Nm");
    expect(formatSpecValue("0,16 mm", "mm")).toBe("0,16 mm");
  });

  it("ignores case when comparing — the two disagree constantly", () => {
    expect(formatSpecValue("1200 RPM", "rpm")).toBe("1200 RPM");
  });

  it("appends when the unit really is missing", () => {
    expect(formatSpecValue("50", "Nm")).toBe("50 Nm");
    expect(formatSpecValue("1200", "rpm")).toBe("1200 rpm");
  });

  it("passes plain values through", () => {
    expect(formatSpecValue("Χάλυβας εργαλείων", null)).toBe("Χάλυβας εργαλείων");
    expect(formatSpecValue("Μαύρο", "")).toBe("Μαύρο");
  });
});

describe("stripRestatement", () => {
  const short = "Κατάλληλο για τρύπημα σε ινοσανίδες, κόντρα πλακέ και σε φυσικό ξύλο.";

  it("detects the long copy opening with the short one", () => {
    expect(longRestatesShort(`${short} Κατασκευάζεται σύμφωνα με το DIN 7487.`, short)).toBe(true);
    expect(longRestatesShort("Εντελώς άλλο κείμενο για το προϊόν αυτό.", short)).toBe(false);
  });

  it("drops the restatement when enough text survives", () => {
    const tail =
      "Κατασκευάζεται σύμφωνα με το DIN 7487 E στη Γερμανία, με σκληρυμένη ακίδα και " +
      "επίστρωση κατά της τριβής για μεγαλύτερη διάρκεια ζωής.";
    expect(stripRestatement(`${short} ${tail}`, short)).toBe(tail);
  });

  it("keeps the text when trimming would leave almost nothing", () => {
    const long = `${short} Και τίποτα άλλο.`;
    expect(stripRestatement(long, short)).toBe(long);
  });

  it("is a no-op without a short description", () => {
    expect(stripRestatement("Κάτι", null)).toBe("Κάτι");
  });
});

/**
 * Every value below is a real one from `product_specs`, with its row count.
 * "N/A" alone is 164,000 rows — more than any real answer in the catalogue.
 */
describe("isEmptySpec", () => {
  it.each(["N/A", "n/a", "N.A.", "NA"])("drops %s", (value) => {
    expect(isEmptySpec(value)).toBe(true);
  });

  // The projection says this a dozen different ways. Every string below is a
  // real value from `product_specs`; catching only four of them was the first
  // pass, and a safety boot still listed a voltage and a battery life.
  it.each([
    "Δεν ισχύει", "Δεν Ισχύει", "Μη εφαρμόσιμο", "Μη εφαρμόζεται",
    "Δεν εφαρμόζεται", "Μη εφαρμοστέο", "Μη απαιτούμενο", "Μη απαιτούμενη",
    "Δεν καθορίζεται", "Μη διαθέσιμο", "Χωρίς εφαρμογή",
    "Not applicable", "Not specified", "Not required",
    "Non applicabile", "Non richiesto", "Non specificato",
  ])("drops %s", (value) => {
    expect(isEmptySpec(value)).toBe(true);
  });

  // The bracket explains WHY the field does not apply, which is not something a
  // customer needs from a spec table.
  it.each([
    "N/A (utensile manuale)",
    "Δεν ισχύει (συνδεδεμένο στο δίκτυο)",
    "Not applicable (manual tool)",
    "Μη απαιτούμενο (χειροκίνητο)",
  ])("drops %s, parenthesis and all", (value) => {
    expect(isEmptySpec(value)).toBe(true);
  });

  it("drops a bare dash and an empty value", () => {
    expect(isEmptySpec("—")).toBe(true);
    expect(isEmptySpec("  ")).toBe(true);
    expect(isEmptySpec(null)).toBe(true);
    expect(isEmptySpec(undefined)).toBe(true);
  });

  /*
   * The match is on the whole string, never a prefix. Each of these starts with
   * the same word as something that IS dropped, and each is a real answer to
   * the question its field asks — a prefix rule would delete all of them.
   */
  it.each([
    "Μη ηλεκτρικό",
    "Μη ηλεκτρικό (χειροκίνητο)",
    "Χωρίς ηλεκτρικό θόρυβο",
    "Χωρίς θόρυβο",
    "Non elettrico",
  ])("keeps %s", (value) => {
    expect(isEmptySpec(value)).toBe(false);
  });

  it("keeps ordinary values, including ones containing the letters", () => {
    expect(isEmptySpec("Μηχανικό")).toBe(false);
    expect(isEmptySpec("-20°C έως 60°C")).toBe(false);
    expect(isEmptySpec("Nano coating")).toBe(false);
    expect(isEmptySpec("0")).toBe(false);
  });
});
