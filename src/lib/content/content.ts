import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { CONTENT, CONTENT_BY_KEY, type ContentView } from "@/lib/content/registry";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Reading and writing editable copy.
 *
 * Resolution order for one block: the row for this locale, then the row for the
 * default locale, then the copy compiled into the component. The middle step is
 * what makes a partly-translated site usable — a block filled in Greek shows in
 * Greek on the English page rather than reverting to whatever a developer typed
 * a year ago, which is at least the current text and at most the wrong one.
 *
 * All blocks load in one query per request. A page renders many of them, and a
 * query per block would put the homepage on a dozen round-trips.
 */

type Row = { key: string; locale: string; value: string; updatedBy: string | null; updatedAt: Date };

const loadRows = cache(async (): Promise<Map<string, Row>> => {
  const rows = await prisma.contentBlock.findMany();
  return new Map(rows.map((r) => [`${r.key}:${r.locale}`, r as Row]));
});

/** One block, resolved. Never throws and never returns empty for a known key. */
export async function getContent(key: string, locale: Locale): Promise<string> {
  const def = CONTENT_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown content key: ${key}`);

  const rows = await loadRows();
  const exact = rows.get(`${key}:${locale}`)?.value.trim();
  if (exact) return exact;

  const fallbackLocale = rows.get(`${key}:${routing.defaultLocale}`)?.value.trim();
  if (fallbackLocale) return fallbackLocale;

  return def.fallback;
}

/**
 * A whole section at once, keyed by the part after the dot.
 *
 * `copy("hero", locale)` then `copy.title` reads better at the call site than a
 * string key repeated five times, and keeps the keys in one place where a typo
 * is visible.
 */
export async function getSection(
  section: string,
  locale: Locale,
): Promise<Record<string, string>> {
  const defs = CONTENT.filter((c) => c.section === section);
  const entries = await Promise.all(
    defs.map(async (d) => [d.key.split(".").slice(1).join("."), await getContent(d.key, locale)] as const),
  );
  return Object.fromEntries(entries);
}

/** Everything the CMS screen shows, for one locale. */
export async function listForAdmin(locale: Locale): Promise<ContentView[]> {
  const rows = await loadRows();
  return CONTENT.map((def) => {
    const row = rows.get(`${def.key}:${locale}`);
    if (!row || !row.value.trim()) {
      return {
        key: def.key,
        value: def.fallback,
        isFallback: true,
        updatedBy: null,
        updatedAt: null,
      };
    }
    return {
      key: def.key,
      value: row.value,
      isFallback: false,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

/**
 * Write one block.
 *
 * Blank DELETES the row, restoring the compiled copy. That is the only way to
 * undo an edit, and it is safe here in a way it would not be for a secret: the
 * original is still in the code, so nothing is lost.
 *
 * A value identical to the fallback is also deleted rather than stored. Storing
 * it would leave a row that looks like an edit, so the admin would stop showing
 * "showing the original" and nobody could tell the two states apart.
 */
export async function setContent(
  key: string,
  locale: Locale,
  rawValue: string,
  actor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = CONTENT_BY_KEY.get(key);
  if (!def) return { ok: false, error: `Unknown content key: ${key}` };

  const value = rawValue.trim();

  if (value === "" || value === def.fallback.trim()) {
    await prisma.contentBlock.deleteMany({ where: { key, locale } });
    return { ok: true };
  }

  if (def.maxChars && value.length > def.maxChars * 2) {
    // Twice the guidance, not the guidance itself: the counter is advice, but a
    // value this far over will break the layout it sits in.
    return { ok: false, error: `${def.label}: πολύ μεγάλο (${value.length} χαρακτήρες)` };
  }

  const data = { value, updatedBy: actor.slice(0, 120) };
  await prisma.contentBlock.upsert({
    where: { key_locale: { key, locale } },
    create: { key, locale, ...data },
    update: data,
  });
  return { ok: true };
}
