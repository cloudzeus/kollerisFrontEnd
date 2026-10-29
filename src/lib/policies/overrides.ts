import "server-only";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import { loadMessageOverrides } from "@/lib/content/messages";
import { getPolicyContent } from "@/lib/policies/content";
import { policyBodyPath, policyContentToHtml } from "@/lib/policies/content-html";
import { POLICY_PAGES } from "@/lib/policies/pages-policy";
import type { PolicySlug } from "@/lib/policies/types";
import type { Locale } from "@/i18n/routing";

/**
 * The server side of the legal-page override.
 *
 * Reads the one rich body an operator may have set for a page, reusing the
 * per-request override cache that `src/i18n/request.ts` already warms on every
 * page — so a policy page costs no extra query. The value is sanitised again on
 * the way out: it was sanitised on write, but defence in depth is cheap and the
 * row is printed with `dangerouslySetInnerHTML`.
 *
 * A read failure (or a missing table) returns `null`, which is exactly "no
 * override" — the structured content then renders, as it did before this layer.
 */

/** The operator's rich body for a page, or `null` to fall back to structured content. */
export async function getPolicyBody(slug: PolicySlug, locale: Locale): Promise<string | null> {
  try {
    const rows = await loadMessageOverrides(locale);
    const row = rows.find((r) => r.path === policyBodyPath(slug));
    if (!row) return null;
    const html = sanitizeHtml(row.value);
    return html || null;
  } catch {
    return null;
  }
}

export type PolicyBodyView = {
  slug: PolicySlug;
  title: string;
  path: string;
  /** The saved override, or `null` when the page still shows structured content. */
  override: string | null;
  /** Today's structured content as HTML — what the editor opens with when unset. */
  current: string;
};

/** Every legal page with its override (if any) and its current content, for the admin. */
export async function listPolicyBodies(locale: Locale): Promise<PolicyBodyView[]> {
  const rows = await loadMessageOverrides(locale).catch(() => []);
  const byPath = new Map(rows.map((r) => [r.path, r.value]));
  return POLICY_PAGES.map((page) => {
    const raw = byPath.get(policyBodyPath(page.id));
    const override = raw ? sanitizeHtml(raw) || null : null;
    return {
      slug: page.id,
      title: page.title,
      path: page.path,
      override,
      current: policyContentToHtml(getPolicyContent(page.id, locale)),
    };
  });
}
