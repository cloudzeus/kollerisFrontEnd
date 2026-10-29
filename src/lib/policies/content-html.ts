import { sanitizeHtml } from "@/lib/content/sanitize-html";
import type { PolicyContent, PolicySlug } from "@/lib/policies/types";

/**
 * Serialising the structured legal content to the one HTML body the admin edits.
 *
 * The six legal pages are stored as structured data (`content.ts`), but an
 * editor wants one block of prose, not a tree of headings/paragraphs/lists. So
 * the admin edits a single rich-HTML override per page: when present it replaces
 * the structured body; when absent the structured content still renders, so the
 * pages work with no override at all.
 *
 * This function produces the HTML the editor OPENS with — today's content, so
 * editing starts from what ships rather than a blank box. It runs the result
 * through the same `sanitizeHtml` the storefront prints, which both escapes the
 * prose (`&`, `<`) and guarantees the seed is already in the canonical, balanced
 * form the override will be stored in — so a round-trip is a no-op.
 *
 * Pure and client-safe (types + the pure sanitizer only): the admin imports it
 * to seed the editor, and the server to back-fill a missing override.
 */

/** The MessageOverride path a legal page's rich body is stored under. */
export function policyBodyPath(slug: PolicySlug): string {
  return `policies.${slug}.body`;
}

/** Today's structured content as one sanitised HTML body (empty when there is none). */
export function policyContentToHtml(content: PolicyContent): string {
  const parts: string[] = [];
  if (content.intro?.trim()) parts.push(`<p>${content.intro}</p>`);

  for (const section of content.sections) {
    if (section.heading?.trim()) parts.push(`<h2>${section.heading}</h2>`);
    for (const paragraph of section.paragraphs ?? []) parts.push(`<p>${paragraph}</p>`);
    if (section.list?.length) {
      parts.push(`<ul>${section.list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
    }
  }

  return sanitizeHtml(parts.join(""));
}
