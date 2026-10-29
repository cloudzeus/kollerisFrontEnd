# Eshop Content Manager — Design

**Date:** 2026-10-29
**Status:** Approved design, pre-implementation
**Repos:** `kollerisEshopFront` (first), then `hdc-front` (Milwaukee) — identical pattern
**Branch:** `feat/content-manager` in each repo. No PR (work stays on branches).

## 1. Context & goal

Both e-shops already have a small editable-copy system:

- A Prisma `ContentBlock(key, locale, value)` table, keyed `key:locale`.
- A registry (`src/lib/content/registry.ts`) of ~18–19 blocks, each with a
  compiled `fallback`. Resolution order: this locale → default locale → fallback.
- An admin editor at `/admin/(protected)/content` (gated by the `content` RBAC
  permission), grouped by *section* in plain boxes, per-locale, with a sticky
  save bar and "restore original" per field.

But that registry only covers the homepage hero/about/reviews and shipping
messages. **Almost every other page's text is hardcoded in its component**, so
the operator sees "only zones for components/banners" and the page text stays
static.

**Goal:** one admin page per shop that lists **every covered page as an
accordion**, and inside each accordion **all of that page's editable texts**.
Most texts are simple one-line/short fields (titles, buttons, labels). A few
pages are long prose (legal/FAQ) and get a **rich-text editor**. Each non-Greek
field can be filled by an **OpenRouter "translate from Greek" action** that the
operator reviews before saving.

## 2. Non-goals

- Not a DB-defined CMS: operators do not create/delete pages or blocks. Blocks
  are defined in code (keeps the fallback-safety property; no blank live text).
- Not for dynamic/per-item data. On `proion/[slug]`, `katalogos/[kathgoria]`,
  `blog/*`, only the **static template copy** (section headings, labels, empty
  states) is editable — never product/category/post data, which comes from the
  DB/PIM.
- No auto-apply of AI output. Translations are drafts the operator reviews.
- No migration of the existing homepage blocks' *keys* or stored values.

## 3. Data model

`ContentBlock` is **unchanged**. `rich` values are stored as **sanitized HTML**
in the same `value` TEXT column. No migration required.

The registry type gains one dimension and one kind:

```ts
export type ContentKind = "text" | "long" | "url" | "image" | "rich"; // + rich

export type ContentDef = {
  key: string;          // "etaireia.title" — section prefix kept
  page: string;         // NEW: PAGES[].id this block belongs to
  section: string;      // sub-group inside the page accordion
  label: string;
  where: string;
  kind: ContentKind;
  fallback: string;     // for rich: the current HTML/text compiled into the page
  maxChars?: number;    // ignored for rich
};

export type PageDef = {
  id: string;           // "etaireia"
  title: string;        // "Η εταιρεία" — accordion header
  path: string;         // "/etaireia" — "view on site" link + operator orientation
  order: number;        // accordion ordering
};
```

`key` stays globally unique and is still the storage key, so **existing
homepage blocks keep their keys and stored values**; we only add `page` to each
existing def: hero/about/reviews → page `home`, and the shipping messages →
page `home` as their own section ("Μηνύματα αποστολής"), since they are
cart/checkout strings not tied to another content page.

### Registry structure

The single `registry.ts` is split into per-page modules so it stays legible as
pages are added:

```
src/lib/content/registry/
  index.ts        // PAGES[], CONTENT = [...home, ...etaireia, ...], CONTENT_BY_KEY
  home.ts         // existing hero/about/reviews/shipping defs, each given page:"home"
  etaireia.ts
  epikoinonia.ts
  oroi-chrisis.ts
  aporrito.ts
  apostoli-paradosi.ts
  epistrofes.ts
  eggyiseis.ts
  syxnes-erotiseis.ts
  tropoi-pliromis.ts
  prosfores.ts
```

`src/lib/content/registry.ts` becomes a thin re-export of `registry/index.ts` so
existing imports (`@/lib/content/registry`) keep working. `CONTENT_SECTIONS` is
superseded by `PAGES` + per-block `section`; the admin groups by page then by
section within a page.

`src/lib/content/content.ts` is unchanged except that `setContent` runs a `rich`
value through `sanitizeHtml` before storing, and compares the sanitized form
against `fallback` for the "identical to original → delete row" rule.

## 4. Admin UI

`/admin/(protected)/content` keeps its server page (`listForAdmin(locale)`), its
locale tabs, dirty-tracking and sticky save bar. `ContentEditor` changes from a
flat section list to **one `<details>`/accordion per page** (ordered by
`PAGES[].order`), each showing the page title, its on-site path (view link), and
a count of changed/untouched blocks. Inside, blocks are grouped by `section` as
today, each rendered by kind:

- `text`, `url`, `image` → `<Input>` (as today).
- `long` → `<textarea>` (as today).
- `rich` → **`RichTextEditor`** (new): a TipTap editor with a small toolbar —
  bold, italic, underline, H2/H3, bullet/numbered list, link, clear formatting.
  Its value is HTML; on change it updates the same `draft[key]` string the save
  bar already tracks.

Accordions are collapsed by default; the first page (`home`) open. Only pages
with ≥1 registered block appear.

### UI approach (ui-ux-pro-max + fluid, responsive)

The admin screen is built following the **ui-ux-pro-max** skill (invoked at
implementation time) and must be **compact, rem-based, adaptive and responsive**:

- **Fluid rem typography (global rule):** no fixed `px` font sizes. Use the
  project's existing `--fs-*` clamp tokens (already in
  `src/app/globals.css`) via `text-[length:var(--fs-13)]` etc. The rebuild
  **replaces** the ~10 fixed `text-[13px]` / `text-[12.5px]` usages in the
  current `ContentEditor` with the matching `--fs-*` tokens.
- **Compact & dense:** tight vertical rhythm, labels and "where" hints kept
  small; a page accordion summarises its block count without expanding.
- **Responsive 360 → desktop:** single column on phones (field under its label),
  two columns (label | field) from `md`; the rich-text toolbar wraps; accordions
  and the sticky save bar are usable on narrow screens. Touch targets ≥ 44px.
- **iOS zoom guard:** editable inputs/textarea use `font-size: max(1rem, 1em)` on
  phones (already the global rule's `input/select/textarea` convention).
- **Accordion primitive:** add a small shadcn-style `accordion.tsx`
  (Radix `@radix-ui/react-accordion`) under `src/components/ui/`, or use native
  `<details>` styled to match — decided at build time via ui-ux-pro-max. The
  rich-text toolbar and buttons reuse existing shadcn `Button`/`Input`.

**Translation controls** (shown on the `en`/`it` tabs only):

- Per field: a **"Μετάφραση από Ελληνικά"** button that calls a server action
  with the Greek (`el`) value for that key and writes the result into
  `draft[key]` (unsaved). Disabled when the Greek value is empty.
- Per page: a **"Συμπλήρωση μεταφράσεων"** button that translates every block on
  that page whose current-locale value is empty/fallback, from `el`, in one
  batched call, into the drafts.

Nothing is persisted until the operator presses **Αποθήκευση** (existing flow).

## 5. Rich text — editor + sanitizer

- **Editor:** TipTap v3 (`@tiptap/react`, `@tiptap/starter-kit`,
  `@tiptap/extension-link`, `@tiptap/extension-underline`). Headless, React 19
  compatible, outputs HTML. The toolbar is plain shadcn buttons. Client component.
- **Sanitizer:** port `hdc-front/src/lib/content/sanitize-html.ts` verbatim into
  `kollerisEshopFront/src/lib/content/sanitize-html.ts` (dependency-free
  allowlist; its allowed tags already match TipTap output: p, strong, em, u, s,
  ul, ol, li, h2–h4, a, blockquote, table…). hdc-front already has it.
- **Boundary:** sanitize on **save** (in `setContent`) *and* on **render**
  (defence in depth — the stored value is already sanitized, but rendering
  re-sanitizes so a value written another way can't inject). Rich blocks render
  via `dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}`.

## 6. Translation — OpenRouter client

New `src/lib/ai/openrouter.ts`, `"server-only"`, mirroring the shape of the
existing `src/lib/ai/deepseek.ts` (OpenAI-compatible chat completions — the same
request/response format OpenRouter uses):

```ts
export class OpenRouterError extends Error {}

// config(): OPENROUTER_API_KEY (required),
//           OPENROUTER_API_URL  (default https://openrouter.ai/api/v1/chat/completions),
//           OPENROUTER_MODEL    (default "openai/gpt-4o-mini" — overridable)

async function chat(system: string, user: string, maxTokens?: number): Promise<string>

// Plain text: keeps brand names, product codes, units, and {tokens} verbatim.
export async function translateText(args: {
  text: string; from: string; to: string; maxChars?: number;
}): Promise<string>

// Rich HTML: translates only text nodes, keeps the tag structure intact and
// unchanged; output re-sanitized by the caller before use.
export async function translateHtml(args: {
  html: string; from: string; to: string;
}): Promise<string>

// Optional batch for "fill page translations" (positional JSON in/out, length-checked).
export async function translateBatch(args: {
  texts: string[]; from: string; to: string;
}): Promise<string[]>
```

Prompts reuse the proven instructions from `deepseek.ts` (professional-tools
shop voice; keep brands/codes/units/`{tokens}`; for HTML: "return the same HTML,
translate only the visible text, do not add or remove tags"). JSON batch results
are length-validated and rejected on mismatch (same guard as `translateBatch`).

Server actions in the content admin
(`src/app/admin/(protected)/content/actions.ts`):

- `translateField(key, toLocale)` → reads the stored/fallback `el` value for
  `key`, routes to `translateText` or `translateHtml` by the def's kind, returns
  the string. Gated by the `content` permission. Key never leaves the server.
- `translatePage(pageId, toLocale)` → batch for the page's empty blocks.

`.env` additions documented (key opened to the user, never printed):
`OPENROUTER_API_KEY`, `OPENROUTER_API_URL`, `OPENROUTER_MODEL`.

## 7. Rendering / safety

- Unfilled or cleared block → the compiled `fallback` renders. No blank live text
  is ever possible, for any kind.
- Clearing a field deletes the row (existing behaviour), restoring the fallback.
- A value equal to the (sanitized) fallback is not stored (existing behaviour),
  so "showing the original" stays accurate for rich too.
- Wiring a page = add its block defs to its registry module + replace each
  hardcoded string in the component with `await getContent(key, locale)` (or
  `getSection`). Server components already fetch; no client fetching added.

## 8. First page batch (Kolleris)

Simple text pages (mostly `text`/`long` fields — titles, intro lines, labels,
CTAs): `home` (extend existing), `etaireia`, `epikoinonia`, `apostoli-paradosi`,
`tropoi-pliromis`, `prosfores`.

Rich-text pages (one or a few `rich` blocks of prose): `oroi-chrisis`,
`aporrito`, `epistrofes`, `eggyiseis`, `syxnes-erotiseis`.

Each page's exact block list is enumerated during implementation by reading its
component and lifting every human-visible static string. The fallback for each
block is the string exactly as it renders today, preserving current output.

## 9. Testing (vitest, matching existing patterns)

- **Registry integrity:** every `key` unique; every block's `page` exists in
  `PAGES`; `maxChars` only on non-rich; `PAGES` ids unique.
- **Sanitizer:** reuse hdc-front's existing `sanitize-html.test.ts` in Kolleris
  (ported with the file).
- **OpenRouter client:** mock `fetch` — success parse, non-OK → `OpenRouterError`,
  missing key → throws, batch length-mismatch → throws, HTML prompt path builds
  correct messages. No network in tests.
- **Fallback resolution:** `getContent` returns locale → default → fallback;
  `setContent` of a `rich` value stores sanitized HTML and deletes on
  blank/equal-to-fallback.

## 10. Rollout

1. Kolleris: sanitizer port → registry refactor (`page` + modules, home moved
   over, output unchanged) → `rich` kind + `setContent` sanitize → TipTap
   `RichTextEditor` → accordion `ContentEditor` → OpenRouter client + translate
   actions/buttons → wire the first page batch → tests. Verify in the running
   app (preview) that pages render identically with blocks unfilled.
2. hdc-front (Milwaukee): same steps; it already has `sanitize-html.ts`. Port
   the registry/editor/openrouter changes and wire the equivalent pages.

Each repo on its own `feat/content-manager` branch, committed incrementally. No
PR.

## 11. Decisions settled during brainstorming

- Approach: extend the existing registry (not a DB-defined CMS, not MDX).
- Scope: framework + key pages first, then extend page-by-page.
- Sequence: Kolleris first, then Milwaukee.
- Rich text only where prose actually is (legal/FAQ); everything else stays
  plain fields.
- OpenRouter is a per-field/per-page translate helper, reviewed before save.
- Admin UI built with ui-ux-pro-max: compact, rem-based fluid (`--fs-*`),
  responsive 360→desktop; replaces the current fixed-px styling.
