# Eshop Content Manager Implementation Plan (Kolleris)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give operators a per-page admin screen to edit every covered page's text (rich text where the page is prose), with an OpenRouter "translate from Greek" helper, on top of the existing `ContentBlock` registry.

**Architecture:** Extend the existing registry (add a `page` dimension + a `rich` kind), keep `ContentBlock(key, locale, value)` storage and fallback-to-compiled-copy resolution. Rich text is TipTap in the admin, stored and rendered as sanitized HTML. Translation is a reviewed draft via an OpenRouter OpenAI-compatible client.

**Tech Stack:** Next 16.2.7, React 19.2.4, Prisma/MySQL, TipTap v3, `@radix-ui/react-accordion`, vitest 4, OpenRouter (chat completions).

**Spec:** `docs/superpowers/specs/2026-10-29-eshop-content-manager-design.md`

## Global Constraints

- Server components fetch data; no client-side fetching added for storefront copy.
- Font sizes: **no fixed `px`**. Use the fluid `--fs-*` clamp tokens already in `src/app/globals.css` (e.g. `text-[length:var(--fs-13)]`). Responsive 360→desktop; single column on phones, label|field from `md`; touch targets ≥ 44px; editable inputs/textarea `font-size: max(1rem,1em)` on phones.
- AI output is **never auto-applied**; it lands as an unsaved draft. `OPENROUTER_API_KEY` is server-only and never printed or returned to the client.
- Rich values are stored as **sanitized HTML**. An unfilled/cleared block renders its compiled `fallback` — no blank live text, any kind.
- Existing block keys and stored values are unchanged; only a `page` field is added to each existing def.
- Tests: `npm run test` (vitest run), node env, co-located `*.test.ts`, no network (mock `fetch`/prisma), `server-only` is stubbed by the vitest alias.
- Branch `feat/content-manager`; commit per task/page; **no PR**.

## Review Focus

- **Script/JS in a rich value** (`<script>`, `onerror=`, `href="javascript:…"`): must be stripped before storage and on render. → Task 3 (setContent sanitizes rich before compare/store) + Task 1 sanitizer tests.
- **OpenRouter returns fenced or tag-altered HTML** (```html … ```, added/removed tags): fences stripped, output re-sanitized, batch length-validated. → Task 4 tests.
- **Translate invoked on an empty/fallback-only Greek value**: no API call, returns empty. → Task 4 `translateText`/`translateValue` tests.
- **A rich value equal to the fallback** (after sanitizing both): row deleted so "showing original" stays truthful. → Task 3 test.
- **A registry block whose `page` is not in `PAGES`, or a duplicate `key`**: integrity test fails loudly (a block that renders nowhere / collides). → Task 2 test.

---

### Task 1: Port the HTML sanitizer

**Files:**
- Create: `src/lib/content/sanitize-html.ts` (verbatim copy of `hdc-front/src/lib/content/sanitize-html.ts`)
- Test: `src/lib/content/__tests__/sanitize-html.test.ts` (verbatim copy of hdc-front's)

**Interfaces:**
- Produces: `sanitizeHtml(input: string|null|undefined): string`, `htmlToText(html: string): string`, `hasText(html): boolean`, `safeHref(raw: string): string|null`.

- [ ] **Step 1: Copy the sanitizer and its test** from the hdc-front paths above into the Kolleris paths, unchanged.
- [ ] **Step 2: Run the ported test** — `npm run test -- sanitize-html` — Expected: PASS (covers script-dropping, `javascript:` href rejection, tag balancing, plain-text→paragraphs).
- [ ] **Step 3: Commit** — `git add src/lib/content/sanitize-html.ts src/lib/content/__tests__/sanitize-html.test.ts && git commit -m "feat(content): port HTML sanitizer for rich text"`

### Task 2: Registry — page dimension, rich kind, module split

**Files:**
- Create: `src/lib/content/registry/index.ts`, `src/lib/content/registry/home.ts`
- Modify: `src/lib/content/registry.ts` → thin re-export of `./registry/index`
- Test: `src/lib/content/__tests__/registry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ContentKind = "text" | "long" | "url" | "image" | "rich"`
  - `type ContentDef = { key; page: string; section: string; label; where; kind: ContentKind; fallback: string; maxChars?: number }`
  - `type PageDef = { id: string; title: string; path: string; order: number }`
  - `const PAGES: readonly PageDef[]`
  - `const CONTENT: readonly ContentDef[]`, `const CONTENT_BY_KEY: Map<string, ContentDef>`
  - `type ContentView` (unchanged), `const CONTENT_SECTIONS` (kept exported so the current `ContentEditor` keeps compiling until Task 7).

- [ ] **Step 1: Write the failing integrity test** in `registry.test.ts`:

```ts
test("every key is unique")                 // new Set(keys).size === keys.length
test("every block.page exists in PAGES")    // CONTENT.every(c => PAGES.some(p => p.id === c.page))
test("PAGES ids are unique")
test("rich blocks carry no maxChars")       // kind==="rich" ⇒ maxChars===undefined
test("home still holds the existing hero/about/reviews/shipping keys")
```

- [ ] **Step 2: Run it** — `npm run test -- registry` — Expected: FAIL (module/exports missing).
- [ ] **Step 3: Build the registry.** Move the existing defs into `registry/home.ts`, each given `page: "home"` (shipping blocks keep their keys, `section: "shipping"`, under page `home`). Add `"rich"` to `ContentKind`, add `PageDef`/`PAGES` (`[{ id:"home", title:"Αρχική", path:"/", order:0 }]`). `registry/index.ts` aggregates `CONTENT = [...home]`, builds `CONTENT_BY_KEY`, and re-exports `ContentView` + a `CONTENT_SECTIONS` derived from `PAGES`/sections. `registry.ts` becomes `export * from "./registry/index"`.
- [ ] **Step 4: Run it** — `npm run test -- registry` — Expected: PASS.
- [ ] **Step 5: Typecheck** — `npm run build` (or `npx tsc --noEmit`) — Expected: no errors (existing imports of `@/lib/content/registry` still resolve).
- [ ] **Step 6: Commit** — `git commit -am "feat(content): add page dimension and rich kind to the registry"`

### Task 3: Sanitize rich values on write

**Files:**
- Modify: `src/lib/content/content.ts` (`setContent`)
- Test: `src/lib/content/__tests__/content-set.test.ts`

**Interfaces:**
- Consumes: `sanitizeHtml` (Task 1), `CONTENT_BY_KEY` with `kind` (Task 2).
- Produces: `setContent` unchanged signature; for a `rich` def it stores `sanitizeHtml(rawValue)` and compares the sanitized value against `sanitizeHtml(def.fallback)` for the delete-on-equal rule; `maxChars` is not applied to `rich`.

- [ ] **Step 1: Write the failing test** (mock `@/lib/prisma` with `contentBlock.upsert`/`deleteMany` as `vi.fn()`):

```ts
test("rich value is stored sanitized")        // raw '<p onclick=x>Α<script>bad</script></p>' ⇒ upsert value === '<p>Α</p>'
test("rich value equal to fallback deletes")  // sanitized(raw)===sanitized(fallback) ⇒ deleteMany called, upsert not
test("plain text path is unchanged")          // kind:"text" still stores raw trimmed
```

- [ ] **Step 2: Run it** — `npm run test -- content-set` — Expected: FAIL.
- [ ] **Step 3: Implement** the `rich` branch in `setContent`: when `def.kind === "rich"`, set `value = sanitizeHtml(rawValue).trim()` and use `sanitizeHtml(def.fallback).trim()` in the empty/equal check; skip the `maxChars` guard for `rich`.
- [ ] **Step 4: Run it** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(content): sanitize rich values before storing"`

### Task 4: OpenRouter translation client

**Files:**
- Create: `src/lib/ai/openrouter.ts`
- Test: `src/lib/ai/__tests__/openrouter.test.ts`

**Interfaces:**
- Consumes: `sanitizeHtml` (Task 1); env `OPENROUTER_API_KEY`, `OPENROUTER_API_URL` (default `https://openrouter.ai/api/v1/chat/completions`), `OPENROUTER_MODEL` (default: a capable multilingual instruct model id — set in `.env`, see Step 3).
- Produces:
  - `class OpenRouterError extends Error`
  - `chat(system: string, user: string, maxTokens?: number): Promise<string>`
  - `translateText(args: { text: string; from: string; to: string; maxChars?: number }): Promise<string>`
  - `translateHtml(args: { html: string; from: string; to: string }): Promise<string>`
  - `translateBatch(args: { texts: string[]; from: string; to: string }): Promise<string[]>`
  - `translateValue(args: { kind: ContentKind; text: string; from: string; to: string; maxChars?: number }): Promise<string>` — dispatches to `translateHtml`+`sanitizeHtml` for `kind:"rich"`, else `translateText`; returns `""` for empty input.

- [ ] **Step 1: Write the failing tests** (set `OPENROUTER_API_KEY` via `vi.stubEnv`, mock global `fetch`):

```ts
test("chat throws OpenRouterError when key missing")   // unstub key ⇒ rejects OpenRouterError
test("chat returns the message content on 200")
test("chat throws OpenRouterError on non-ok")          // 500 ⇒ rejects
test("translateText returns '' for blank input, no fetch")
test("translateHtml strips ```html fences and re-sanitizes")  // fetch returns '```html\n<p onclick=x>Ciao</p>\n```' ⇒ '<p>Ciao</p>'
test("translateBatch rejects a length mismatch")       // 2 in, 1 out ⇒ rejects
test("translateValue routes rich to html, text to text")
```

- [ ] **Step 2: Run them** — `npm run test -- openrouter` — Expected: FAIL.
- [ ] **Step 3: Implement** `openrouter.ts` mirroring `src/lib/ai/deepseek.ts` (OpenAI-compatible body `{ model, messages, temperature, max_tokens }`, `Authorization: Bearer`, `AbortSignal.timeout`). Reuse deepseek's translation prompts (shop voice; keep brand names/codes/units/`{tokens}`; for HTML: "return the same HTML, translate only the visible text, add or remove no tags"). Strip ` ```json `/` ```html ` fences before parsing/returning. Add the three `OPENROUTER_*` keys to `.env` (open `.env` in the editor for the user to paste the key — do not print it); pick the default model id and record it in the spec's §6.
- [ ] **Step 4: Run them** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(content): OpenRouter translation client"`

### Task 5: Translate server actions

**Files:**
- Modify: `src/app/admin/(protected)/content/actions.ts`

**Interfaces:**
- Consumes: `translateValue` (Task 4), `getContent` (content.ts), `CONTENT_BY_KEY`, `assertCan`, `routing`.
- Produces:
  - `translateField(key: string, toLocale: string): Promise<{ ok: true; value: string } | { ok: false; error: string }>` — authorises `content`; reads the Greek source via `getContent(key, routing.defaultLocale)`; dispatches by `CONTENT_BY_KEY.get(key)!.kind`.
  - `translatePage(pageId: string, toLocale: string): Promise<{ ok: true; values: Record<string,string> } | { ok: false; error: string }>` — translates the page's blocks whose current `toLocale` value is still fallback.

- [ ] **Step 1: Implement** both actions (thin glue; `assertCan` first; catch `OpenRouterError`→`{ok:false,error}`; never include the key in any message).
- [ ] **Step 2: Typecheck** — `npm run build` — Expected: no errors.
- [ ] **Step 3: Commit** — `git commit -am "feat(content): translate-from-Greek server actions"`

### Task 6: Rich-text editor + accordion primitive

**Files:**
- Create: `src/components/ui/accordion.tsx` (shadcn pattern over `@radix-ui/react-accordion`)
- Create: `src/components/content-admin/RichTextEditor.tsx` (client)
- Modify: `package.json` (deps)

**Interfaces:**
- Produces: `<RichTextEditor value={string} onChange={(html: string) => void} id={string} />` (TipTap, outputs HTML); `Accordion`/`AccordionItem`/`AccordionTrigger`/`AccordionContent`.

- [ ] **Step 1: Install deps** — `npm i @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-underline @tiptap/pm @radix-ui/react-accordion`
- [ ] **Step 2: Invoke the `ui-ux-pro-max` skill** before building the UI in this and the next task — the admin must be compact, rem-based (fluid `--fs-*`), adaptive and responsive. Then add `accordion.tsx` following the project's existing shadcn component style (compare an existing `src/components/ui/*.tsx`), using the fluid tokens, not px.
- [ ] **Step 3: Build `RichTextEditor`** — StarterKit + Link + Underline; toolbar (lucide icons + shadcn `Button`): bold, italic, underline, H2, H3, bullet list, ordered list, link (prompt), clear formatting; `onUpdate` → `onChange(editor.getHTML())`; container styled compact/rem/responsive.
- [ ] **Step 4: Typecheck** — `npm run build` — Expected: no errors.
- [ ] **Step 5: Commit** — `git commit -am "feat(content): rich-text editor and accordion primitive"`

### Task 7: ContentEditor rewrite — accordions, kinds, translate, fluid UI

**Files:**
- Modify: `src/app/admin/(protected)/content/ContentEditor.tsx`

**Interfaces:**
- Consumes: `PAGES`, `CONTENT` (Task 2), `RichTextEditor`, `Accordion*` (Task 6), `translateField`/`translatePage` (Task 5), existing `saveContent`.

- [ ] **Step 1: Rewrite** the editor: group blocks by `PAGES` (ordered), one accordion per page (first page open), blocks grouped by `section` inside; render each block by `kind` (`rich`→`RichTextEditor`, `long`→textarea, else `Input`); keep the dirty-draft map, sticky save bar, "restore original", char counter (non-rich). On `en`/`it` tabs show a per-field "Μετάφραση από Ελληνικά" button (`translateField`, disabled when Greek empty) and a per-page "Συμπλήρωση μεταφράσεων" button (`translatePage`); results write into the draft, unsaved. Replace every `text-[13px]`/`text-[12.5px]`/etc. with a fluid token such as `text-[length:var(--fs-13)]` (the --fs family); single column on phones, label|field from `md`.
- [ ] **Step 2: Verify in preview** — `preview_start {name}`, open `/admin/content`: accordions expand/collapse; edit a plain field and a rich field; switch to `en`, translate one field, confirm it fills the draft; Save; reload and confirm persistence. Check phone width (375px) has no horizontal scroll and inputs don't trigger iOS zoom.
- [ ] **Step 3: Commit** — `git commit -am "feat(content): per-page accordion editor with rich text and translation"`

### Task 8: Wire the simple-text pages

For each page: read its component, lift every human-visible **static** string into a `registry/<page>.ts` block (`fallback` = the exact current string), add a `PageDef` to `PAGES`, and replace the string in the component with `await getContent(key, locale)` (or `getSection`). The Task-2 integrity test guards the new defs. Commit per page.

Pages: `etaireia`, `epikoinonia`, `apostoli-paradosi`, `tropoi-pliromis`, `prosfores`.

- [ ] **Step 1 (per page):** add `registry/<page>.ts` defs + `PAGES` entry; wire the component to `getContent`/`getSection`.
- [ ] **Step 2 (per page):** `npm run test -- registry` passes; `preview` the page and confirm it renders **identically** with all blocks still empty (fallbacks).
- [ ] **Step 3 (per page):** `git commit -am "feat(content): make <page> text editable"`

### Task 9: Wire the rich-text pages

Same loop as Task 8, but each page's prose becomes one (or a few) `rich` block(s); `fallback` = the page's current HTML/prose; render via `dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}`. Pages: `oroi-chrisis`, `aporrito`, `epistrofes`, `eggyiseis`, `syxnes-erotiseis`.

- [ ] **Step 1 (per page):** add the `rich` def(s) + `PAGES` entry; wire the component to render the sanitized value.
- [ ] **Step 2 (per page):** `preview` confirms identical render with the block empty; editing it in the admin updates the page.
- [ ] **Step 3 (per page):** `git commit -am "feat(content): make <page> editable as rich text"`

### Task 10: Final verification

- [ ] **Step 1:** `npm run test` — Expected: all PASS.
- [ ] **Step 2:** `npm run build` — Expected: clean.
- [ ] **Step 3:** Preview walkthrough: each wired page's accordion edits a field, a rich field saves and renders, one `en` translation round-trips, and every wired storefront page renders unchanged with its blocks empty.
- [ ] **Step 4:** `git commit -am "chore(content): final verification"` (only if fixups were needed).

---

## Milwaukee (hdc-front) port

Out of scope for this plan. After Kolleris is verified, the identical pattern is applied to `hdc-front` under its own `feat/content-manager` branch and its own short plan (it already has `sanitize-html.ts`; the registry/editor/openrouter changes and the equivalent page wiring are ported).
