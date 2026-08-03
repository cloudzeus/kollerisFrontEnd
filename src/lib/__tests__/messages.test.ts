import { describe, expect, it } from "vitest";
import { findHookMisuse, findProblems, findUntranslated } from "../../../scripts/i18n/verify";

/**
 * The message files, checked against the code that reads them.
 *
 * A missing key throws at render time and nowhere earlier: not in `tsc`, not in
 * the build, not in any other test. Sixteen of them shipped to a live product
 * page before anyone noticed, so the check runs on every commit rather than
 * when somebody remembers the script exists.
 */
describe("messages", () => {
  it("has every key the storefront asks for", () => {
    const problems = findProblems();
    expect(
      problems.map((p) => `${p.detail}   (${p.file})`),
      "λείπουν κλειδιά από το src/messages/el.json",
    ).toEqual([]);
  });

  // Not a message problem, but the same shape of failure: invisible to tsc,
  // visible only as a red overlay when somebody opens the page.
  it("calls next-intl hooks only where they are hooks", () => {
    expect(
      findHookMisuse().map((p) => `${p.detail}   (${p.file})`),
      "async server components must await getTranslations/getLocale",
    ).toEqual([]);
  });

  // Missing here does not throw — next-intl falls back to Greek, so an English
  // visitor silently reads Greek. Quiet failures need a loud test.
  it.each(["en", "it"] as const)("is fully translated into %s", (locale) => {
    expect(findUntranslated(locale), `τρέξτε: LOC=${locale} npx tsx --env-file=.env --conditions=react-server scripts/i18n/translate.mts`).toEqual([]);
  });
});
