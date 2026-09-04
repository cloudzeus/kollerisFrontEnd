import { describe, expect, it } from "vitest";
import { sanitizeInline } from "@/lib/newsletter/rich-text";

/**
 * Ο καθαριστής φυλάει δύο πράγματα ταυτόχρονα: ότι δεν φεύγει επικίνδυνο HTML
 * με την υπογραφή μας, και ότι δεν καταστρέφεται νόμιμο ελληνικό κείμενο.
 */
describe("sanitizeInline", () => {
  it("κρατά έμφαση και κανονικοποιεί b/i", () => {
    expect(sanitizeInline("<strong>α</strong>")).toBe("<strong>α</strong>");
    expect(sanitizeInline("<b>α</b>")).toBe("<strong>α</strong>");
    expect(sanitizeInline("<i>α</i>")).toBe("<em>α</em>");
  });

  it("πετά ετικέτες διάταξης αλλά κρατά το κείμενό τους", () => {
    expect(sanitizeInline("<div>κείμενο</div>")).toBe("κείμενο");
    expect(sanitizeInline("<script>alert(1)</script>")).toBe("alert(1)");
    expect(sanitizeInline('<img src=x onerror="alert(1)">')).toBe("");
  });

  it("επιτρέπει μόνο http, https και mailto σε συνδέσμους", () => {
    expect(sanitizeInline('<a href="https://web.kolleris.com">ok</a>')).toBe(
      '<a href="https://web.kolleris.com" target="_blank" rel="noopener noreferrer">ok</a>',
    );
    expect(sanitizeInline('<a href="javascript:alert(1)">κακό</a>')).toBe("<a>κακό</a>");
    expect(sanitizeInline('<a href="data:text/html,x">κακό</a>')).toBe("<a>κακό</a>");
  });

  /**
   * Το «<» δεν σημαίνει πάντα ετικέτα. Ο πρώτος parser κατάπινε ολόκληρο το
   * «μύτες < 5mm και 8 >» — φυσιολογικότατο κείμενο σε κατάστημα εργαλείων.
   */
  it("δεν καταπίνει κείμενο με σύμβολα σύγκρισης", () => {
    expect(sanitizeInline("5 < 7 & 8 > 6")).toBe("5 &lt; 7 &amp; 8 &gt; 6");
    expect(sanitizeInline('μύτες < 5mm και 1/2" > 3/8"')).toBe(
      "μύτες &lt; 5mm και 1/2&quot; &gt; 3/8&quot;",
    );
    expect(sanitizeInline("<strong>Knipex</strong> < 250mm")).toBe(
      "<strong>Knipex</strong> &lt; 250mm",
    );
  });
});
