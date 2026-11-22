import { describe, expect, it } from "vitest";
import { articleJsonLd } from "@/lib/seo/structured-data";

describe("articleJsonLd", () => {
  it("names the author, his role and both dates", () => {
    const ld = articleJsonLd(
      { title: "Δυναμοκατσάβιδο", path: "/blog/dynamokatsavido", publishedAt: "2026-11-09T08:00:00Z", updatedAt: "2026-11-20T10:00:00Z" },
      "el",
    );
    expect(ld["@type"]).toBe("BlogPosting");
    expect(ld.author).toMatchObject({ "@type": "Person", name: "Δημήτρης Κολλέρης", jobTitle: "Ιδιοκτήτης" });
    expect(ld.datePublished).toBe("2026-11-09");
    expect(ld.dateModified).toBe("2026-11-20");
  });
  it("falls back to the publish date when there is no update", () => {
    const ld = articleJsonLd({ title: "x", path: "/blog/x", publishedAt: "2026-11-09T08:00:00Z", updatedAt: null }, "en");
    expect(ld.dateModified).toBe("2026-11-09");
    expect(ld.author.name).toBe("Dimitris Kolleris");
  });
});
