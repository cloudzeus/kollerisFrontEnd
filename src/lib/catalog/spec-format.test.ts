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

  it("drops the phrase in all three languages", () => {
    expect(isEmptySpec("Δεν ισχύει")).toBe(true);
    expect(isEmptySpec("Δεν Ισχύει")).toBe(true);
    expect(isEmptySpec("Not applicable")).toBe(true);
    expect(isEmptySpec("Non applicabile")).toBe(true);
  });

  it("drops a bare dash and an empty value", () => {
    expect(isEmptySpec("—")).toBe(true);
    expect(isEmptySpec("  ")).toBe(true);
    expect(isEmptySpec(null)).toBe(true);
    expect(isEmptySpec(undefined)).toBe(true);
  });

  // Matched whole, not as a prefix: these carry a real answer after the phrase,
  // and dropping them would delete information rather than noise.
  it("keeps a qualified value that still says something", () => {
    expect(isEmptySpec("Non applicabile (coppia: 25 Nm)")).toBe(false);
    expect(isEmptySpec("Δεν ισχύει (συνδεδεμένο στο δίκτυο)")).toBe(false);
  });

  it("keeps ordinary values, including ones containing the letters", () => {
    expect(isEmptySpec("Μηχανικό")).toBe(false);
    expect(isEmptySpec("-20°C έως 60°C")).toBe(false);
    expect(isEmptySpec("Nano coating")).toBe(false);
    expect(isEmptySpec("0")).toBe(false);
  });
});
