import { describe, expect, it } from "vitest";
import { htmlToText, safeHref, sanitizeHtml } from "@/lib/content/sanitize-html";

describe("sanitizeHtml", () => {
  it("keeps the structure a policy needs", () => {
    expect(sanitizeHtml("<h2>Όροι</h2><p>Κείμενο <strong>έντονο</strong></p><ul><li>ένα</li></ul>")).toBe(
      "<h2>Όροι</h2><p>Κείμενο <strong>έντονο</strong></p><ul><li>ένα</li></ul>",
    );
  });

  it("drops scripts with their content, and every attribute", () => {
    expect(sanitizeHtml('<p onclick="x()">a<script>alert(1)</script>b</p>')).toBe("<p>ab</p>");
    expect(sanitizeHtml('<img src=x onerror="alert(1)"><p style="color:red">t</p>')).toBe("<p>t</p>");
    expect(sanitizeHtml("<style>p{}</style><iframe src=x>in</iframe>ok")).toBe("ok");
  });

  it("keeps only safe links", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="jav&#x61;script:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="https://kolleris.com" title="t">x</a>')).toBe(
      '<a href="https://kolleris.com" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeHtml('<a href="mailto:info@kolleris.com">m</a>')).toBe('<a href="mailto:info@kolleris.com">m</a>');
    expect(safeHref("/epikoinonia")).toBe("/epikoinonia");
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("data:text/html,x")).toBeNull();
  });

  it("unwraps unknown tags but keeps their text, and maps h1 to h2", () => {
    expect(sanitizeHtml('<div class="x"><span>κείμενο</span></div><h1>T</h1>')).toBe("κείμενο<h2>T</h2>");
  });

  it("balances the markup so it cannot close the page's own", () => {
    expect(sanitizeHtml("</ul></div><p>a<strong>b")).toBe("<p>a<strong>b</strong></p>");
    expect(sanitizeHtml("<ul><li>a</ul>")).toBe("<ul><li>a</li></ul>");
  });

  it("escapes text and keeps entities", () => {
    expect(sanitizeHtml("<p>μύτες < 5mm & 1/2\" &amp; &nbsp;</p>")).toBe(
      "<p>μύτες &lt; 5mm &amp; 1/2&quot; &amp; &nbsp;</p>",
    );
  });

  it("turns plain text into paragraphs", () => {
    expect(sanitizeHtml("Πρώτη\nγραμμή\n\nΔεύτερη")).toBe("<p>Πρώτη<br>γραμμή</p><p>Δεύτερη</p>");
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null)).toBe("");
  });

  it("strips comments", () => {
    expect(sanitizeHtml("<p>a<!-- <script>x</script> -->b</p>")).toBe("<p>ab</p>");
  });
});

describe("htmlToText", () => {
  it("gives readable text for JSON-LD", () => {
    expect(htmlToText("<p>Ναι,&nbsp;<strong>βεβαίως</strong></p><ul><li>a</li><li>b</li></ul>")).toBe(
      "Ναι, βεβαίως a b",
    );
  });
});
