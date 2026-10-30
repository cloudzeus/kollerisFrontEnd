import "server-only";
import { cache } from "react";
import { parse } from "@formatjs/icu-messageformat-parser";
import { prisma } from "@/lib/prisma";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import type { Locale } from "@/i18n/routing";

/**
 * The editable layer over the next-intl message catalogue.
 *
 * Storefront pages render their copy through next-intl (`t("…")`), whose text
 * lives in `src/messages/<locale>.json`. This module lets the admin shadow any
 * of those strings per locale without touching the catalogue or the pages: the
 * override rows are merged over the compiled messages once, in
 * `src/i18n/request.ts`, so every `t()` in the app sees the edit.
 *
 * The safety property mirrors `ContentBlock`: absence is the default. No row
 * means the catalogue value stands, and an edit cleared or set back to the
 * catalogue deletes its row, so "showing the original" stays truthful.
 *
 * Server-only: the override read hits the database and the catalogue is
 * imported lazily. The pure helpers (flatten / merge / resolve) carry the logic
 * and are unit-tested; the IO wrappers are thin glue.
 */

type Messages = Record<string, unknown>;

/** Flatten a messages tree to `{ "a.b.c": "leaf string" }`, skipping non-strings. */
export function flattenMessageStrings(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else if (v && typeof v === "object") Object.assign(out, flattenMessageStrings(v, key));
  }
  return out;
}

/** Read one leaf by dotted path, or `undefined` if the path is absent. */
export function getMessagePath(obj: unknown, path: string): string | undefined {
  const node = path.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
  return typeof node === "string" ? node : undefined;
}

/** Set a leaf by dotted path, creating intermediate objects. Mutates `target`. */
function setMessagePath(target: Messages, path: string, value: string): void {
  const parts = path.split(".");
  let node: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (!node[k] || typeof node[k] !== "object") node[k] = {};
    node = node[k] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]!] = value;
}

/** Deep-clone `base` and overlay each override at its path. Never mutates `base`. */
export function mergeOverrides(base: Messages, overrides: ReadonlyArray<{ path: string; value: string }>): Messages {
  const clone = structuredClone(base);
  for (const o of overrides) setMessagePath(clone, o.path, o.value);
  return clone;
}

/**
 * Decide what a write does, given the catalogue value and the raw input.
 *
 * Pure so the "delete when blank or equal to the original" rule — the thing
 * that keeps the admin honest — is tested without a database. Rich values are
 * sanitized on both sides before the comparison and before storage.
 */
export function resolveOverride(
  baseValue: string | undefined,
  raw: string,
  rich: boolean,
): { action: "delete" } | { action: "upsert"; value: string } {
  const norm = rich ? sanitizeHtml(raw).trim() : raw.trim();
  const baseNorm = rich ? sanitizeHtml(baseValue ?? "").trim() : (baseValue ?? "").trim();
  if (norm === "" || norm === baseNorm) return { action: "delete" };
  return { action: "upsert", value: norm };
}

/**
 * The ICU argument names a message string refers to — the simple `{inStock}`
 * and the leading name of a complex `{count, plural, …}` form alike.
 */
export function icuArgNames(value: string): Set<string> {
  const names = new Set<string>();
  const re = /\{\s*(\w+)\s*(?:,|\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) names.add(m[1]!);
  return names;
}

/**
 * Whether an override is safe to serve for a message that next-intl renders
 * with runtime arguments (the FAQ's `{inStock}` / `{products}` counts).
 *
 * Two ways an edit can break a page, both forbidden here:
 *   - an unbalanced brace — a parse error next-intl throws on;
 *   - a NEW argument the catalogue never passes — next-intl throws
 *     "variable not provided" at render.
 *
 * Dropping a placeholder is allowed: the number just stops showing, which is a
 * content choice, not a crash. Plain-text edits of plain-text copy are always
 * safe.
 *
 * The final check parses the value with the same ICU grammar next-intl renders
 * with, so a structurally broken form (a plural missing its `other` clause, a
 * bad argument type) is rejected here rather than degrading to a raw key on the
 * page. A value the parser rejects can only be more exotic ICU than shop copy
 * uses, so erring strict costs at most a save error, never a broken page.
 */
export function isPlaceholderSafe(base: string, value: string): boolean {
  const opens = (value.match(/\{/g) ?? []).length;
  const closes = (value.match(/\}/g) ?? []).length;
  if (opens !== closes) return false;
  const allowed = icuArgNames(base);
  for (const name of icuArgNames(value)) if (!allowed.has(name)) return false;
  try {
    parse(value, { requiresOtherClause: true });
  } catch {
    return false;
  }
  return true;
}

/** Thrown by `setMessageOverride` when an edit would introduce a bad placeholder. */
export class PlaceholderError extends Error {
  constructor() {
    super("placeholder");
    this.name = "PlaceholderError";
  }
}

// ── IO glue ──────────────────────────────────────────────────────────────────

/** Overrides for one locale, deduped per request. */
export const loadMessageOverrides = cache(
  async (locale: string): Promise<Array<{ path: string; value: string }>> =>
    prisma.messageOverride.findMany({ where: { locale }, select: { path: true, value: true } }),
);

/** The compiled catalogue for a locale. */
export const loadBaseMessages = cache(async (locale: Locale): Promise<Messages> => {
  return (await import(`../../messages/${locale}.json`)).default as Messages;
});

/** Catalogue + overrides — what next-intl should actually serve. */
export async function getMergedMessages(locale: Locale): Promise<Messages> {
  const base = await loadBaseMessages(locale);
  try {
    const overrides = await loadMessageOverrides(locale);
    return overrides.length ? mergeOverrides(base, overrides) : base;
  } catch {
    // A failed override read must never blank the site's copy: serve the
    // compiled catalogue, exactly what rendered before this layer existed.
    return base;
  }
}

export type EditableMessage = { path: string; base: string; value: string; overridden: boolean };

/**
 * Every editable leaf under a namespace, with the catalogue value, the current
 * (possibly overridden) value, and whether it is overridden. `namespace` is a
 * dotted path into the catalogue (`"etaireia"` or `"etaireia.page"`).
 */
export async function listEditableMessages(namespace: string, locale: Locale): Promise<EditableMessage[]> {
  const base = await loadBaseMessages(locale);
  const subtree = namespace.split(".").reduce<unknown>(
    (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
    base,
  );
  const flat = flattenMessageStrings(subtree, namespace);
  // A failed override read should show the catalogue, not 500 the admin screen.
  const rows = await loadMessageOverrides(locale).catch(() => []);
  const overrides = new Map(rows.map((o) => [o.path, o.value]));
  return Object.entries(flat).map(([path, baseVal]) => {
    const ov = overrides.get(path);
    return { path, base: baseVal, value: ov ?? baseVal, overridden: ov !== undefined };
  });
}

/** Write (or clear) one override. Clearing/equal-to-catalogue deletes the row. */
export async function setMessageOverride(args: {
  path: string;
  locale: Locale;
  value: string;
  rich?: boolean;
  updatedBy?: string | null;
}): Promise<void> {
  const { path, locale, value, rich = false, updatedBy = null } = args;
  const base = getMessagePath(await loadBaseMessages(locale), path);
  const decision = resolveOverride(base, value, rich);
  if (decision.action === "delete") {
    await prisma.messageOverride.deleteMany({ where: { locale, path } });
    return;
  }
  // Plain messages are rendered with runtime args; a bad placeholder would 500
  // the page. Rich bodies (policy prose) are printed as-is, so the brace rule
  // does not apply to them.
  if (!rich && !isPlaceholderSafe(base ?? "", decision.value)) {
    throw new PlaceholderError();
  }
  await prisma.messageOverride.upsert({
    where: { locale_path: { locale, path } },
    create: { locale, path, value: decision.value, updatedBy },
    update: { value: decision.value, updatedBy },
  });
}
