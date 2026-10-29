import { describe, expect, it } from "vitest";
import { policyContentToHtml, policyBodyPath } from "@/lib/policies/content-html";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import type { PolicyContent } from "@/lib/policies/types";

const SAMPLE: PolicyContent = {
  title: "Όροι χρήσης",
  updated: "01/2026",
  intro: "Καλώς ήρθατε & διαβάστε.",
  sections: [
    {
      heading: "Γενικά",
      paragraphs: ["Πρώτη παράγραφος.", "Δεύτερη < παράγραφος."],
    },
    {
      heading: "Υποχρεώσεις",
      list: ["Στοιχείο ένα", "Στοιχείο δύο"],
    },
    {
      paragraphs: ["Ενότητα χωρίς τίτλο."],
    },
  ],
};

describe("policyBodyPath", () => {
  it("builds the override path for a slug", () => {
    expect(policyBodyPath("aporrito")).toBe("policies.aporrito.body");
  });
});

describe("policyContentToHtml", () => {
  it("serialises intro, headings, paragraphs and lists to HTML", () => {
    const html = policyContentToHtml(SAMPLE);
    // intro first, as a paragraph
    expect(html).toContain("<p>Καλώς ήρθατε &amp; διαβάστε.</p>");
    // headings render as h2 (the page owns h1)
    expect(html).toContain("<h2>Γενικά</h2>");
    expect(html).toContain("<h2>Υποχρεώσεις</h2>");
    // paragraphs in order
    expect(html).toContain("<p>Πρώτη παράγραφος.</p>");
    // special characters are escaped, not emitted as markup
    expect(html).toContain("<p>Δεύτερη &lt; παράγραφος.</p>");
    expect(html).not.toContain("Δεύτερη < παράγραφος");
    // a list becomes a ul of li
    expect(html).toContain("<ul><li>Στοιχείο ένα</li><li>Στοιχείο δύο</li></ul>");
    // a section with no heading still emits its paragraphs
    expect(html).toContain("<p>Ενότητα χωρίς τίτλο.</p>");
    // the title is NOT part of the body (the layout renders it as h1)
    expect(html).not.toContain("Όροι χρήσης");
  });

  it("produces HTML that survives the sanitizer unchanged (already clean)", () => {
    const html = policyContentToHtml(SAMPLE);
    expect(sanitizeHtml(html)).toBe(html);
  });

  it("omits an absent intro", () => {
    const html = policyContentToHtml({ title: "X", updated: "y", sections: [] });
    expect(html).toBe("");
  });
});
