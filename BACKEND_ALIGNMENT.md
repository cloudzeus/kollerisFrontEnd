# Kolleris E-shop Front — Backend Alignment & CMS Plan

Backend audited: `/Volumes/EXTERNALSSD/hdckolleris/hdckolleris` (HDCtool)
Front spec: `kolleris_front_DEVELOPMENT_SPEC.md` + `KOLLERIS_FRONT_COMPONENT_LIST.md`
Date: 2026-07-26

**Decision taken:** the CMS and all eshop management live in **this** application under `/admin`. HDCtool stays a PIM/ERP integration back office and is *not* extended with eshop features.

---

## 1. What HDCtool is (and isn't)

HDCtool is a **PIM + ERP-integration back office**, not an e-shop backend.

- Next.js (App Router) + Prisma + MySQL at `hdctool.wwa.gr`
- **93 Prisma models**, ~400 API routes
- Source of truth is **SoftOne ERP** (company 1001); `MTRL` is the product mirror
- Existing outbound channels: Magento, Skroutz, Milwaukee XML, `/sup` supplier portal
- Owns credentials & sessions for **SoftOne, ACS Courier, Viva Wallet, Mailgun, BunnyCDN, OpenAI/DeepSeek**

It already contains working commerce primitives — SALDOC order posting, Viva payment orders, ACS vouchers and tracking, customer-ensure-in-SoftOne, AFM lookup — but all wired to Magento/Skroutz/sup, never to a storefront.

**Catalogue data is ~80% usable today. Cart, checkout, accounts, B2B and the entire CMS layer do not exist anywhere.**

---

## 2. Target architecture — two applications, one boundary

```
┌──────────────────────────────┐        ┌──────────────────────────────────────┐
│  HDCtool  (hdctool.wwa.gr)   │        │  kollerisEshopFront                  │
│                              │        │  Next.js 16.2.7                      │
│  PIM · ERP integration       │        │                                      │
│  SoftOne · ACS · Viva ·      │        │  /[locale]/*   → storefront (22 rts) │
│  Mailgun · BunnyCDN          │        │  /admin/*      → CMS + eshop ops     │
│                              │        │  /api/*        → own API             │
│  ── owns ──                  │        │                                      │
│  MTRL, translations, specs,  │        │  ── owns (own PostgreSQL 16 DB) ──   │
│  images, brands, categories, │        │  Product projection (read model)     │
│  pricing rules, VAT          │◄───────┤  CMS · Cart · Orders · Customers ·   │
│                              │  delta │  Wishlist · Reviews · Coupons        │
│  ── exposes (7 methods) ──   │  sync  │                                      │
│  catalog delta, stock/price, │───────►│  Facets · search index · curation    │
│  ERP order push, customer,   │        │                                      │
│  ACS courier                 │        │  (B2B deferred → HDCtool, later)     │
└──────────────────────────────┘        └──────────────────────────────────────┘
```

### The key call: a local product read-model

The front app **syncs eshop-eligible products into its own `Product` projection table** rather than calling HDCtool live on every page.

Why this is the right call, not an optimisation:

1. **Facets are impossible otherwise.** The PLP needs per-filter-group counts over brand, price band, availability, length, grip material, sale/new/VDE flags. That is an aggregation over the catalogue — it cannot be assembled from HDCtool's four id-filters, and building it *in* HDCtool would mean putting eshop logic back where we just decided not to put it.
2. **Search needs its own index.** Exact-SKU boost, `searchKey()`-normalised matching, and content/brand tabs need an index built at write time. HDCtool's `@@fulltext(NAME)` can't express it.
3. **CMS joins.** "Featured product tile in the mega-menu", "products in this bundle", "deal of the day stock" — every one of these joins CMS rows to product rows. Cross-database joins in application code at request time will not hold up.
4. **Latency & blast radius.** A PIM cron run must not slow down or take down the storefront.
5. **The delta infrastructure already exists.** HDCtool has `MtrlSyncChange`, `SyncCursor`, `mtrl-delta-sync-cron`, `MTRL.UPDDATE`/`updatedAt` and `eshopListed`/`eligibleForEshop` denormalised flags. A delta feed is a thin wrapper over machinery that's already running.

**Freshness policy:**
- Product master (name, specs, images, category, brand) → delta sync every 15 min, full reconcile nightly
- **Price & stock → never cached in the projection for a purchase decision.** Read live from HDCtool at PDP render, cart render and *always* at order placement. The projection stores a display price only, refreshed every 5 min, and is treated as indicative.

---

## 3. What HDCtool must expose (7 methods — everything else moves here)

Two fixes and five new methods. This is the entire HDCtool workload.

### Fixes to existing methods

| # | Change | Why |
|---|---|---|
| H0a | **Replace admin-session auth on `/api/public/*` with API-key auth** | `POST /api/public/auth` currently takes an **admin `User` email+password** and returns a better-auth session token accepted as Bearer by every public route. The front would have to hold staff credentials. An unused `ApiKey` model already exists (`key`, `isActive`, `expiresAt`, `lastUsedAt`). |
| H0b | **Gate `GET /api/public/product/[mtrl]` and strip `PRICEW`/`PRICER`** | It has **no auth at all** today and returns the wholesale price. Public cost-basis leak. |

### New methods

| # | Method | Purpose | Built on (already exists) |
|---|---|---|---|
| H1 | `POST /api/public/catalog/delta` | Products changed since a cursor: full row for created/updated, ids for removed. Scoped to `eshopListed = true`. | `MtrlSyncChange`, `SyncCursor`, `MTRL.updatedAt`, `removedFromErpAt`, `buildPublicEshopWhere()` |
| H2 | `POST /api/public/catalog/snapshot` | Paged full export for initial load + nightly reconcile | `fetchPublicEshopProductsPage()` keyset pagination |
| H3 | `POST /api/public/pricing` | **Live** price + stock for `mtrl[]`, with `priceTier` applied server-side | `resolvePublicEshopChannelPrices()`, `getPublicEshopVatMap()`, `EshopPricingRule`, `MTRL.QTY` |
| H4 | `POST /api/public/erp/order` | Push a placed eshop order to SoftOne (customer ensure → SALDOC + ITELINES), returns `FINDOC` | `send-magento-order-to-softone.ts`, `invoice-customer-ensure-softone.ts`, `softone-api-queue`, `ErpLog` |
| H5 | `POST /api/public/erp/customer` | AFM → company details; create/ensure TRDR | `customer-vat-lookup.ts`, `/api/customers/ensure-invoice-customer` |
| H6 | `POST /api/public/courier/voucher` · `POST /api/public/courier/tracking` | Create ACS voucher, fetch tracking events | `acs-courier.ts` |
| ~~H7~~ | ~~`erp/credit` · `erp/invoices`~~ | B2B credit and invoices — **deferred; the whole B2B feature will be built in HDCtool later**, so this is not a boundary method at all. | — |

**Why H4–H6 stay in HDCtool rather than moving here:** HDCtool owns the SoftOne session cache, the win1253 decoding, the API queue, the retry/resubmit logic and the `ErpLog` audit trail. Reimplementing that in the front app would be a second, worse copy. The front app calls these as services.

Everything the earlier draft proposed for HDCtool (catalogue facets, search, CMS, offers, blog, FAQ, cart, accounts) **moves into this application.**

---

## 4. Page-by-page alignment

Legend: ✅ data available from HDCtool today · ⚠️ available but needs work here · ❌ nothing exists anywhere

| # | Route | Status | Notes |
|---|---|---|---|
| 1 | `/` Homepage | ⚠️ | Best sellers ✅ (`bestProducts`/`most-sold`/`PopularProduct`), brand wall ✅. Hero video, promo tiles, stats, Google reviews, About-split, newsletter → **CMS here**. |
| 2 | `/katalogos` Catalogue | ✅ | Tree ✅, real SKU counts ✅ (`categories-with-products`), category art ✅ (`SuperProductCategory.iconImage/heroImage`). Cheapest page to ship. |
| 3 | `/katalogos/[kathgoria]` PLP | ⚠️ | Products ✅. **All faceting, counts, sorting, price ranges → built here** over the projection. |
| 4 | `/proion/[slug]` PDP | ⚠️ | Product ✅, specs ✅, related ✅, gallery ✅. Slug, reviews, cross-sell, category-manager block, stock cutoff, partner price → here. |
| 5 | `/kalathi` Cart | ❌ | Entirely here. |
| 6 | `/checkout` | ❌ | Here, calling H3 (re-price), H4 (SALDOC), H5 (customer), H6 (voucher), Viva. |
| 7 | `/checkout/epibebaiosi/[orderId]` | ❌ | Here; tracking timeline from H6. |
| 8 | `/logariasmos/*` (8 sub-routes) | ❌ | **No customer auth exists anywhere.** `User` is HDCtool staff; `Customer` is a TRDR mirror with no credentials. All here. `entopismos` is the one sub-route buildable early (H6 tracking, works unauthenticated). |
| 9 | `/b2b/*` (6 sub-routes) | ❌ | Here, except credit/invoices which need H7. |
| 10 | `/sygrisi` Compare | ⚠️ | Spec matrix built here over the projection + `CategorySpecField` whitelist. |
| 11 | `/anazitisi` Search | ❌→here | Own index. |
| 12 | `/brands` Brands | ⚠️ | `brands` ✅; in-stock filtering, counts, specialty groupings, "new representation" → here. |
| 13 | `/prosfores` Offers | ⚠️ | `Offer` model exists **in HDCtool** — see §7 for the migration call. |
| 14 | `/nees-afixeis` New arrivals | ⚠️ | Bucketing over `INSDATE` here; coming-soon + notify-me here. |
| 15 | `/etaireia` About | ❌ | CMS here. |
| 16 | `/epikoinonia` Contact | ❌ | CMS + form here. |
| 17 | `/blog` | ⚠️ | `Post` exists in HDCtool — see §7. |
| 18 | `/syxnes-erotiseis` FAQ | ⚠️ | `EshopQandA` exists in HDCtool — see §7. |
| 19 | `/eisodos` Login/Register/Reset | ❌ | Here. |
| 20 | `not-found` | ⚠️ | Category grid ✅; broken-link report here. |

### Data facts the front must respect

- **Eligibility** is `MTRL.eshopListed` (= `BOOL01` **and** ≥1 image **and** Greek MTRAN name). Never filter on `BOOL01`.
- **Prices**: `PRICEW` (wholesale base) → `PRICER02` (**eshop web price**) via `EshopPricingRule.markupPercentage`. `PRICER` is legacy retail. Only `resolvePublicEshopChannelPrices()` is correct — hence H3.
- **Hierarchy** is 3 levels: `MTRCATEGORY` → `MTRGROUP` → `CCCSUBGROUP2`.
- **Languages** are `el | en | it` throughout HDCtool. The spec assumes EL/EN — **IT comes free, keep the switcher extensible**.
- **Specs** are a fixed wide table (`ProductSpecifications`) + per-category whitelist (`CategorySpecField`). PLP's `?len=&grip=` must map onto those columns.
- **Partner ×0.88 has no model anywhere.** It exists only as `SupPortalSetting.retailDiscountFactor` (supplier portal) and the Milwaukee-1364 rule. Needs a real `PriceTier` here, resolved through H3.

---

## 5. This application — module map

```
kollerisEshopFront/
  app/
    [locale]/…              22 storefront routes (per the spec)
    admin/                  CMS + eshop operations
      content/              homepage zones, pages, menu, blocks
      catalogue/            curation, featured, badges, slug overrides
      merchandising/        offers, deal-of-day, bundles, coupons
      editorial/            blog, guides, FAQ, terms
      orders/               eshop orders, ERP push status, vouchers
      customers/            customers, B2B approvals, price tiers
      service/              returns/RMA, service requests, warranties
      engagement/           newsletter, alerts, contact inbox, reviews
      settings/             site config, shipping, payment, redirects
      sync/                 HDCtool delta status, reconcile, failures
    api/…                   own API + server actions
  prisma/schema.prisma      own MySQL database
  lib/hdctool/              typed client for the 8 HDCtool methods
```

`/admin` gets its own roles: `ADMIN` (all), `EDITOR` (content + editorial + merchandising), `OPS` (orders, service, customers). Same Auth.js instance as the storefront, separated by role — not a second auth system.

---

## 6. Prisma models to create here (≈35)

**Catalogue projection (6)** ✅ **built in Phase 0** — synced from HDCtool, never edited by hand
`Product` · `ProductImage` · `ProductTranslation` · `ProductSpec` · `SyncState` · `SyncRun`

**Catalogue curation (4)** — editable here, joined to the projection
✅ `ProductOverride` (slug override, badges, featured flag, editorial copy) · ✅ `Redirect` · `CategoryContent` (hero, copy, manager) · `BrandContent` (authorised-dealer, specialty group, "new representation") · `FeaturedSet` (homepage carousel, mega-menu tile, related overrides)

**RBAC (3)** ✅ **built in Phase 0**
`AdminUser` · `AdminAuditLog` · `LoginAttempt`

**Commerce (11)**
`Cart` · `CartLine` · `Order` · `OrderLine` · `OrderStatusHistory` (incl. ERP push state + `FINDOC`) · `Coupon` · `CouponRedemption` · `ShippingMethod` · `ShippingZone` · `PaymentMethod` · `Bundle` + `BundleItem`

**Identity (5)**
`Customer` (credentials; links to SoftOne `trdr`) · `CustomerAddress` · `PriceTier` · `ConsentRecord` · ~~`LoginAttempt`~~ ✅ *built in Phase 0*
*(`B2BAccount` / `B2BUser` deferred — B2B is being built in HDCtool later. `PriceTier` still ships so partner pricing has a seam to plug into.)*

**Service (5)**
`Wishlist` + `WishlistItem` · `WarrantyRecord` · `ServiceRequest` · `ReturnRequest` + `ReturnLine` · `ShoppingList` + `ShoppingListItem`

**Content (10)**
`CmsPage` · `CmsBlock` · `CmsZone` · `CmsMenu` · `SiteSetting` · `SiteReview` · `ProductReview` · `Guide` · `ComingSoonItem` · `CategoryManager`

**Engagement (5)**
`NewsletterSubscriber` · `ProductAlert` · `ContactSubmission` · `FaqVote` · `BrokenLinkReport`

---

## 7. Content already modelled in HDCtool — migrate or federate?

Four things exist there and are needed here:

| Model | Contents | Recommendation |
|---|---|---|
| `Offer` + `OfferTranslation` + `OfferProduct/Category/Brand` | Rich: scheduling, PERCENTAGE/FIXED, hero 1920×500 + square 600×600 images, el/en/it, product/category/brand scoping | **Migrate here.** Offers are pure merchandising; nothing in HDCtool consumes them. |
| `Post` + `PostTranslation` + `PostImage` | Blog with slug, translations, ordered images | **Migrate here** — *except* `MagentoCmsPageMapping`, which keeps pointing at HDCtool. Check with the client whether Magento blog pages are still live before cutting. |
| `EshopQandA` | 24-ish Q&A, el/en/it, ordered, `availableFor: HDC \| MAIN \| BOTH` | **Migrate the `MAIN`/`BOTH` rows here**, leave `HDC` rows there. Add `topic`, `bullets`, `ctaUrl` (the spec needs them and they don't exist). |
| `EshopTerms` | Terms/privacy, el/en/it, slug, `hdc` flag | **Migrate the non-`hdc` rows here.** |

One-time migration scripts, then delete the corresponding `/admin` screens from HDCtool so there's no ambiguity about where content is edited. This is the single largest source of "which system owns this?" confusion in the plan — worth resolving before phase 3.

---

## 8. CMS / admin screens to build here (20)

Ordered by how much of the storefront is blocked.

| # | Screen | Unblocks |
|---|---|---|
| 1 | **Homepage builder** — hero video/poster, 2 promo tiles, 4 stats, About-split copy, zone ordering | Homepage (100% hardcoded otherwise) |
| 2 | **Site settings** — free-shipping threshold (150€), business hours, phones, socials, default VAT display | every page |
| 3 | **Menu builder** — mega-menu curation, featured product tile, brand grid | MainNav, sitewide |
| 4 | **Page builder** — About, Contact, generic block pages | About, Contact |
| 5 | **Sync monitor** — HDCtool delta status, reconcile, failed rows | all catalogue pages |
| 6 | **Catalogue curation** — slugs, badges, featured sets, related overrides | PLP, PDP, homepage |
| 7 | **Offers** (migrated) + deal-of-day + bundle composer | Offers page |
| 8 | **FAQ** (migrated) + topics, bullets, CTA, helpful-vote report | FAQ, Contact mini-FAQ |
| 9 | **Blog** (migrated) + categories with counts | Blog |
| 10 | **Terms** (migrated) | Footer, checkout |
| 11 | **Guides library** — PDF/XLSX, ungated downloads | Blog |
| 12 | **Category managers** — name, phone, photo, category assignment | PDP callout, Contact |
| 13 | **Brand content** — authorised-dealer, specialty grouping, new representation | Brands, PDP |
| 14 | **Coming-soon** — ETA month + notify-me subscriber list | New arrivals |
| 15 | **Site reviews** — Google excerpts, cached daily | Homepage |
| 16 | **Product reviews moderation** | PDP, JSON-LD |
| 17 | **Coupons** | Cart, checkout |
| 18 | **Shipping & payment config** — methods, zones, COD fee, instalments | Cart, checkout |
| 19 | **Orders** — list, status, ERP push state, retry, ACS voucher, refunds | Ops |
| 20 | **Customers & B2B approvals** — 2-business-day activation queue, price tiers · **Returns/RMA & service requests** · **Contact inbox** · **Broken-link report** | Accounts, B2B, Contact, 404 |

Screens **1–5 block everything**. Nothing beyond the catalogue browser can ship without them.

---

## 9. Build order

| Phase | This app | HDCtool |
|---|---|---|
| **0 — Foundations** | Next.js 16.2.7 scaffold, Prisma + own DB, Tailwind theme, `formatPrice`/`upGreek`/`searchKey` **+ tests first**, chrome (header/nav/footer), Auth.js with roles, `lib/hdctool` client | **H0a** API-key auth, **H0b** lock down `product/[mtrl]` |
| **1 — Catalogue sync** | `Product` projection, delta worker, reconcile job, admin screen 5 | **H1** delta, **H2** snapshot |
| **2 — Catalogue pages** | Facet engine, search index, slugs — Catalogue, PLP, PDP, Compare, Search, Brands + admin 6 | **H3** live price/stock |
| **3 — Content** | CMS core + admin 1–4 — Homepage, About, Contact, 404 | — |
| **4 — Merchandising** | Migrate Offers/Blog/FAQ/Terms (§7) + admin 7–16 — Offers, New arrivals, Blog, FAQ | — |
| **5 — Commerce** | Cart, Checkout, Confirmation, Orders + admin 17–19 | **H4** SALDOC push, **H5** customer ensure, **H6** ACS |
| **6 — Accounts** | Customer auth, 8 account sub-routes, Login/Register + admin 20 | — |
| **7 — Engagement** | newsletter, alerts, contact, votes, reviews | — |
| ~~B2B~~ | **Deferred — to be implemented in HDCtool later.** `/b2b/*` routes and Group E are out of scope for this app. | ~~H7~~ |

Phases 0–2 carry little risk — additive reads over data that already exists. Phase 5 is the real new backend. **Phase 0 is complete — see §11.**

---

## 10. Decisions taken

| Decision | Resolution |
|---|---|
| CMS location | **This application, `/admin`.** HDCtool is not extended with eshop features. |
| Slugs | **Generated here** — `slugify()` in `src/lib/greek.ts`, stored on `Product.slug`, human overrides in `ProductOverride.slugOverride`, renames preserved via the `Redirect` table. |
| Database | **PostgreSQL 16.14** at `100.70.50.43:5432/kolshop`, separate from HDCtool's MySQL. `unaccent` + `pg_trgm` enabled for Greek search. |
| `/admin` RBAC | **Auth.js v5, JWT session strategy.** Roles `ADMIN` / `EDITOR` / `OPS` → capability matrix in `src/lib/rbac.ts`. |
| Locales | **el / en / it, `el` default** — identical to HDCtool. `localePrefix: "as-needed"`, `localeDetection: false` (see §11). |
| Translations | **DeepSeek API**, same provider HDCtool already uses for `OfferTranslation` / `MTRAN`. |
| B2B | **Deferred — will be implemented in HDCtool later.** Group E and Phase 7 are out of scope here. `PriceTier` still ships so partner pricing has somewhere to plug in. |

### Still open

1. **Blog migration** — is the Magento blog (`MagentoCmsPageMapping`) still live? If yes, `Post` stays federated rather than migrating.
2. **Partner discount shape** — flat ×0.88, or per-customer/per-brand? Decides whether `PriceTier` is one row or a matrix. Blocks nothing until B2B lands in HDCtool.
3. **Payment provider** — reuse Viva Wallet (already integrated) or a new one? Hosted fields either way. Needed by Phase 5.

---

## 11. Phase 0 — built and verified (2026-07-26)

**Stack:** Next.js 16.2.7 (Turbopack) · React 19.2.4 · Tailwind 4.1 · Prisma 7.9 + `@prisma/adapter-pg` · Auth.js v5 · next-intl 4.13 · Vitest 4.

**Live figures pulled from HDCtool** — the catalogue is far smaller than the spec assumed, which makes the projection sync cheap (a full snapshot is ~27 pages at `limit=200`):

| | Count |
|---|---|
| Eshop-listed products (`eshopListed = true`) | **5,305** |
| Brands | **152** |
| Category nodes (category + group + subgroup) | **714** |

Keyset pagination (`nextCursor`) confirmed working — the sync must use it, not offset paging.

**Shipped:**
- `src/lib/greek.ts` — `upGreek` (drops tonos, keeps dialytika), `searchKey` (drops both, folds final sigma), `slugify` (Greek→ASCII with digraphs). **17 tests.**
- `src/lib/format.ts` — `formatPrice` / `resolveAmount` / `savingsOf` / `formatMoney`. **12 tests.**
- Postgres schema + first migration: RBAC (`AdminUser`, `AdminAuditLog`, `LoginAttempt`), catalogue projection (`Product`, `ProductImage`, `ProductTranslation`, `ProductSpec`, `ProductOverride`, `Redirect`), sync bookkeeping (`SyncState`, `SyncRun`). 12 tables live.
- Auth.js JWT RBAC with edge-safe config split, argon2id hashing, 5-attempt/15-minute lockout, timing-equalised failures.
- `/admin` shell with capability-filtered navigation; `/admin/login`. Verified end-to-end in the browser.
- i18n: `/` → el, `/en` → en, `/it` → it. Verified.
- `src/lib/hdctool/client.ts` — `server-only` typed client with token caching and 401 re-auth. Response types verified against the live API.

**Typeface substitution — IBM Plex Mono → Noto Sans Mono (needs sign-off):**

The handoff sets every technical label in IBM Plex Mono, and nearly all of them are Greek uppercase ("ΠΑΡΑΔΟΣΗ 24-48Ω", "ΟΛΕΣ ΟΙ 23 ΚΑΤΗΓΟΡΙΕΣ", "ΚΩΔΙΚΟΙ ΣΕ ΑΜΕΣΗ ΔΙΑΘΕΣΙΜΟΤΗΤΑ").

**IBM Plex Mono has no Greek glyphs.** Verified two ways: Google Fonts serves only latin / latin-ext / cyrillic / cyrillic-ext / vietnamese for it, and the full IBM release (`@ibm/plex-mono` 2.5.0, decompressed and inspected) carries 1,207 glyphs with nothing in U+0370–03FF. The handoff's own font link requests `subset=greek,latin` and silently never receives it — so the mockup has the same defect.

The visible symptom: each label rendered in **two faces at once** — digits in Plex Mono, Greek letters in the system monospace fallback — which is what made the sizes look inconsistent.

Replaced with **Noto Sans Mono** (latin + greek, humanist monospace, closest match to Plex Mono's proportions). Alternatives that also carry Greek, if the brand prefers a different feel: **JetBrains Mono**, **Roboto Mono**. IBM Plex *Sans* does have Greek and stays as the body face.

**Deviations from the spec, deliberate:**

1. **No VAT toggle — every storefront price is VAT-inclusive.** Client decision: the `VatToggle` component and the net/gross switch in the spec are dropped. The VAT *rate* still matters, so `formatPrice(net, { vatRate })` applies the product's real rate (HDCtool's `VatRate` maps SoftOne codes to 24 / 13 / 6 + reduced island rates; a hardcoded 1.24 would misprice every reduced-rate item). Net amounts survive only where they are genuinely required — ERP order payloads (SoftOne `ITELINES` carry net line prices) and `/admin` — via an explicit `formatNet`, so net can never leak into the storefront by forgetting a flag.
2. **Tailwind tokens live in `globals.css` `@theme`, not `tailwind.config.ts`.** Tailwind 4.1 is CSS-first — the config file shown in the spec no longer exists. Same values.
3. **`localeDetection: false`.** With an unprefixed default locale, `Accept-Language` negotiation would serve Greek to one visitor and English to another *at the same URL* — breaking CDN caching and giving crawlers an unstable canonical.
4. **`src/proxy.ts`, not `src/middleware.ts`.** Next 16 deprecated the `middleware` convention.
5. **`searchKey` folds final sigma (ς → σ).** The spec's version does not, so `ΟΔΟΣ` would not have matched `οδός`.

### Phase 1 — catalogue projection (2026-07-26)

Full sync run against HDCtool. **5,305 products · 27,584 images · 714 categories · 152 brands** now live in Postgres.

Two things the real data revealed, both worth a decision:

1. **Only 15 distinct MTRMARK appear across all 5,305 eshop-listed products — 14 map to a super brand.** The design and the utility bar both claim "151 BRANDS". That 151 is the master brand list; the *listed* subset is 14 (Facom 1,619 · Milwaukee 1,090 · GEDORE 698 · WERA 545 · KNIPEX 327 · KARNASCH 274 · KOKEN 248 · BAHCO 186 · FESTOOL 120 · Virax 64 · BESSEY 41 · PROXXON 37 · BOSCH 8 · NITECORE 2). The gap is a PIM-completeness issue in HDCtool — `eshopListed` requires BOOL01 + an image + a Greek MTRAN name, and most brands fail one of those. The storefront now shows the real figure everywhere rather than a claim the brand wall contradicts.
2. **23 root categories carry products** (of 26 in the ERP tree) — which matches the design's "23 βασικές κατηγορίες" exactly. The three empty ones (ΑΝΥΨΩΤΙΚΑ - ΤΡΑΒΗΧΤΙΚΑ among them) are filtered out rather than rendered as "0 ΚΩΔ." tiles.

Sync notes:
- The first implementation was serial and latency-bound at ~1 product/sec over the VPN. Now batched at 8 concurrent writes.
- `recomputeCounts` originally issued 714 `category.update` calls inside one `$transaction` and blew Prisma's 5s interactive-transaction limit. Rewritten as three set-based SQL statements.
- ~~Next: HDCtool webhook~~ — **built, both sides.** See "Change feed" below.

### Change feed (replaces the scheduled full walk)

Measured before building, from the `SyncRun` history: a full walk was **5.305 products, 8,5–11,5 minutes, 5.301 UPDATE statements** — and in the seven days before the change, **zero** products had a newer `erpUpdatedAt`. Every one of those writes expressed nothing. The ERP touches ~1.339 products a month; a push feed sends ~45 a day.

HDCtool is the only side that knows what changed, because it is the side doing the writing.

| | |
|---|---|
| **Detection** | `MTRL`, `MTRLFile`, `MTRAN`, `ProductSpecifications` scanned on `updatedAt`. Not per-cron instrumentation — Prisma's `@updatedAt` moves on every write through the client, so a cron added later cannot forget to announce itself. Four new indexes make each scan a range read that usually returns nothing. |
| **Queue** | `eshop_change_outbox`. The eshop being down for an hour must not lose an hour of changes. |
| **Delivery** | `POST /api/webhooks/hdctool`, HMAC-SHA256 over `${timestamp}.${rawBody}`, raw bytes. Ids only — never product data. |
| **Gap detection** | Each delivery carries `seq` + `prevSeq`; the eshop stores the last seq it applied. A mismatch means a delivery was lost, and it pulls **H1 delta** rather than diverging in silence. |
| **Reconcile** | `npm run reconcile:catalog`, nightly. Compares **id lists** (~5.300 integers, one query) and fetches only the differences — seconds, not nine minutes. Catches de-listings, which produce no event because the collector scans listed products only. |

**Deploy order matters: HDCtool first.** The eshop asks `/api/public/products` for specific ids; an older build ignores the unknown `mtrl` filter and returns the first page instead, which would make every requested id look de-listed. `syncProductsByMtrl` detects that (a product it did not ask for in the response) and refuses to de-list, so the wrong order fails loudly instead of emptying the storefront — but it does fail until HDCtool ships.

**Drift found on the first reconcile read (not yet applied):** 113 products live here that HDCtool no longer lists, and 61 listed there that are missing or inactive here. That is the projection having quietly gone stale — the thing this exists to stop.

**Known issues:**
- `npm audit` reports 15 high advisories against Next 16.2.x. The fix range resolves above `16.3.0-preview.7`, i.e. **no stable release carries the fix yet**. Not actionable while the spec pins 16.2.7 — revisit when 16.3 ships.
- ~~Artegra font missing~~ — resolved: both weights (ExtLt 200, MedExp 500) were in the handoff and are now loaded via `next/font/local`.
- A killed sync leaves its `SyncRun` row stuck in `RUNNING` forever. Needs a stale-run reaper, or a heartbeat column.
- The warehouse/team photo the About split calls for (1200×840) is not in the asset set — striped placeholder stands in.

## Πλάτος σελίδας σε wide displays

Το handoff είναι καμβάς 1440px με gutters 40px. Κάθε band μέσα του είναι full-bleed
by design (σκούρα breadcrumb strips, stat grid, κόκκινο newsletter bar) και κανένα
δεν είχε όριο — σε 2560px η στήλη σύνοψης του checkout κατέληγε μακριά από τη φόρμα,
οι τέσσερις στήλες του footer απομακρύνονταν, οι σειρές προϊόντων άνοιγαν υπερβολικά.

**Λύση — cap στο CONTENT, όχι στη σελίδα** (εντολή πελάτη: 2500px, backgrounds
edge-to-edge):

| utility | για | συμπεριφορά |
|---|---|---|
| `.shell-x` | full-bleed bands με δικό τους gutter | `padding-inline: max(2.5rem, (100% − 2500px) / 2)` — το background τρέχει edge-to-edge, το περιεχόμενο σταματά στα 2500 |
| `.shell-w` | grids που κουβαλούν gutter στα κελιά τους (καλάθι, checkout, PDP, PLP, stat strip) | `max-width: calc(2500px + 5rem)` — τα δύο 40άρια gutters, ώστε το περιεχόμενο να πέφτει στην ίδια γραμμή με τα `.shell-x` |
| `.page-shell` | το κέλυφος στο `[locale]/layout.tsx` | πλήρες πλάτος, μόνο `flex` + λευκό — **κανένα** max-width |

Επαληθευμένο στα 3400px: bands `left:0 width:3385` με το σκούρο background τους,
content `left:443 width:2500`, το PLP grid `left:403 width:2580` → content επίσης
στο 443. Μηδέν horizontal overflow. Στα ≤2580 δεν αλλάζει απολύτως τίποτα.

Το `/admin` είναι εκτός (δικό του δέντρο, δική του πυκνότητα).

---

## Σύγκριση προϊόντων — `/sygkrisi`

Έως 4 προϊόντα **μίας** ταξινόμησης (`cccSubgroup2` → `mtrgroup` → `mtrcategory`,
όποιο είναι στενότερο στο πρώτο προϊόν που επιλέχθηκε).

**Δύο πηγές αλήθειας, σκόπιμα:**
- **cookie** `KOLLERIS_COMPARE` (`scopeKey|slug,slug`, httpOnly, 7 μέρες) — ό,τι
  γράφει το tray στις σελίδες καταλόγου. Server-rendered, ο browser δεν κρατά state.
- **`?ids=`** — η σελίδα σύγκρισης. Έτσι η σύγκριση μοιράζεται με link, το back
  button αναιρεί την αφαίρεση στήλης, και τα δύο toggles (`?diff=1`, `?best=1`)
  δεν κοστίζουν καθόλου JavaScript.

Η `/sygkrisi` είναι **server component από άκρη σε άκρη**. Τα μόνα client leaves:
`AddToCartButton` στην κεφαλή κάθε στήλης και `CompareCheckbox` στα suggestions.
Το tray είναι server component με `<form action={serverAction}>` — καθόλου client
component παρότι είναι interactive.

**⚠️ Το `ProductSpec.valueNumeric` ΔΕΝ χρησιμοποιείται για τη σύγκριση.**
Ο sync αποθηκεύει «τον πρώτο αριθμό της τιμής», που είναι μια χαρά για facets και
λάθος για matrix. Πραγματικές γραμμές από την projection:

| value | valueNumeric | σωστό |
|---|---|---|
| `1,500 RPM` | 1.5 | 1500 (thousands separator ως δεκαδικό) |
| `0-140mm` | 0 | — (εύρος) |
| `0 - 1500 RPM,1500 - 3000 RPM` | 0 | — (λίστα) |
| `ISO 1173-1:2005` | 1173 | — (πρότυπο) |
| `-10°C to 50°C` | -10 | — (εύρος) |

`lib/compare/numeric.ts` δίνει αριθμό μόνο όταν η τιμή είναι **αναμφίβολα ένας**
αριθμός, και μόνο πεδία του `SPEC_DIRECTION` (torque, maxTorque, maxSpeed, wattage,
amperage, dutyCycle ↑ / noiseLevel ↓) βγάζουν νικητή. Ισοπαλία ή έστω μία στήλη που
δεν διαβάζεται καθαρά → κανένα highlight. Καλύτερα κανένας νικητής παρά λάθος.

**Για το HDCtool:** αξίζει να κανονικοποιηθούν αυτά τα πεδία στην πηγή (χωριστά
min/max, ενιαία μονάδα) — τότε το `SPEC_DIRECTION` μπορεί να επεκταθεί πολύ.


---

## Λογαριασμοί πελατών & B2B — το front end εδώ, οι μέθοδοι στο HDCtool

**Απόφαση (αλλάζει την προηγούμενη «B2B deferred»):** η ταυτότητα των πελατών ζει
στο **HDCtool**, μαζί με τον πίνακα `Customer` που καθρεφτίζει το SoftOne TRDR.
Αυτή η εφαρμογή είναι το **front end** — κρατά μόνο ένα session cookie
(`KOLLERIS_SESSION`) με το token που εξέδωσε το HDCtool, και ρωτά το HDCtool
«ποιος είναι αυτός» σε κάθε request. Μία αυθεντία για την ταυτότητα.

⚠️ Ξεχωριστό realm από το Auth.js του `/admin`. Προσωπικό και πελάτες δεν πρέπει
ποτέ να μοιράζονται cookie.

### Δύο τύποι λογαριασμού

| | Ιδιώτης | Εταιρεία (B2B) |
|---|---|---|
| Παραγγελίες, διευθύνσεις, εγγυήσεις | ✅ | ✅ |
| Τιμές συνεργάτη | ❌ | ✅ (`partnerFactor` από HDCtool) |
| Πληρωμή επί πιστώσει | ❌ | ✅ |
| Πολλοί χρήστες με ρόλους | ❌ | ✅ |
| Όρια δαπάνης ανά χρήστη | ❌ | ✅ |

Ρόλοι εταιρείας: `owner` (παραγγέλνει χωρίς όριο + διαχειρίζεται χρήστες),
`buyer` (παραγγέλνει μέχρι το όριό του), `viewer` (βλέπει, δεν παραγγέλνει).
Ο πίνακας ικανοτήτων είναι στο `src/lib/account/contract.ts` και επιβάλλεται
server-side σε κάθε action.

Εταιρικός λογαριασμός δημιουργείται **pending** και **δεν** συνδέει τον χρήστη —
πάει στο `/eggrafi/anamoni`. `partnerFactor` = 1 μέχρι την έγκριση.

### Νέες μέθοδοι HDCtool (προς υλοποίηση)

Wire shapes: `src/lib/account/contract.ts`. Client: `src/lib/account/account-client.ts`.

| # | Endpoint | Σκοπός |
|---|---|---|
| H8 | `GET /api/public/vat/lookup?vat=` | ΑΦΜ → στοιχεία εταιρείας. **Υπάρχει ήδη** ως `/api/customers/lookup-by-vat` και χρησιμοποιείται σήμερα· χρειάζεται μόνο public counterpart |
| H9 | `POST /api/public/account/login` | email+password → `{user, token, expiresAt}` |
| H10 | `POST /api/public/account/register` | ιδιώτης ή εταιρεία· εταιρεία → `pendingApproval: true`, `token: null` |
| H11 | `POST /api/public/account/me` | token → `{user}` ή `{user: null}` |
| H12 | `PATCH /api/public/account/profile` · `POST …/password` · `POST …/logout` | προφίλ |
| H13 | `POST/PATCH/DELETE /api/public/account/company/members` | χρήστες, ρόλοι, όρια, προσκλήσεις |
| H14 | *(αργότερα)* `…/company/credit` · `…/company/invoices` | πίστωση και τιμολόγια |

### ΑΦΜ → ΑΑΔΕ, στο checkout και στην εγγραφή

Ένα component, `CompanyVatFields`, και στα δύο σημεία. Το HDCtool λύνει το ΑΦΜ
με σειρά: **δικός του `Customer` → SoftOne TRDR → μητρώο ΑΑΔΕ** (`vat.wwa.gr/afm2info`).

Επαληθευμένο live (26/07): `094019245` → ΟΤΕ, ΔΟΥ, δραστηριότητα, διεύθυνση,
TRDR 16743 · `099095556` → ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ, TRDR 20202.

Δύο σημεία που αξίζουν προσοχή:
- Το check digit ελέγχεται **client-side** πριν το round-trip (`isValidAfm`, 12 tests).
  Το μητρώο απαντά «not found» και σε λάθος ΑΦΜ και σε αδήλωτη εταιρεία — δύο πολύ
  διαφορετικά πράγματα να πεις στον πελάτη.
- Το TRDR περνά στην παραγγελία (`Order.erpTrdr`), ώστε το push στο SoftOne να
  **επαναχρησιμοποιεί** τον υπάρχοντα πελάτη αντί να φτιάχνει δεύτερη καρτέλα
  για το ίδιο ΑΦΜ.
- Η αναζήτηση γίνεται με **server action**, όχι route handler — το bearer του
  HDCtool δεν φτάνει ποτέ στον browser και δεν εκτίθεται endpoint που θα
  σάρωνε το μητρώο ΑΑΔΕ για όποιον το βρει.

### Τι είναι χτισμένο

`/eisodos` · `/eggrafi` (ιδιώτης/εταιρεία με ΑΑΔΕ) · `/eggrafi/anamoni` ·
`/logariasmos` · `/logariasmos/stoicheia` · `/b2b` · `/b2b/xristes`.

Όσο λείπει μια μέθοδος από το HDCtool, η οθόνη δείχνει `BackendMissingNotice` με
**το ακριβές endpoint** — όχι fake δεδομένα. Fake δεδομένα σε account area είναι
το χειρότερο placeholder: δείχνουν τελειωμένα και κανείς δεν θυμάται μετά ποιες
οθόνες δεν συνδέθηκαν ποτέ.


---

## Επεξεργασία προϊόντων — μία πηγή αλήθειας

**Απόφαση πελάτη, ρητή:** οι διορθώσεις από το `/admin` εφαρμόζονται **παντού**,
όχι μόνο στο eshop. Άρα **καμία επικάλυψη** για specs και φωτογραφίες: το
HDCtool μένει η μοναδική πηγή αλήθειας, αυτή η εφαρμογή είναι η επιφάνεια
επεξεργασίας, και ο sync φέρνει πίσω κάθε αλλαγή στην projection.

Ο χρήστης δουλεύει **από εδώ**, βλέποντας τη σελίδα όπως τη βλέπει ο πελάτης —
απλώς κάθε ενέργεια στέλνει HTTP στο HDCtool.

### Τι υπάρχει ήδη στο HDCtool

Η λογική είναι γραμμένη και προσεκτική:

| Handler | Τι κάνει |
|---|---|
| `/api/specifications/save` | γράφει el/en/it **και σπρώχνει στο SoftOne** (`updateMTRLProductERP`) |
| `/api/specifications/clear-field` | μηδενίζει ένα πεδίο και στις 3 γλώσσες, με whitelist `CLEARABLE_FIELDS` |
| `/api/super-products/[id]` | επεξεργασία προϊόντος |

**Λείπει μόνο η είσοδος:** όλα αυθεντικοποιούνται με better-auth **cookie
session**, ενώ το eshop κρατά bearer από `/api/public/auth`. Άρα τα H18–H20 είναι
**auth wrappers πάνω σε υπάρχουσα λογική**, όχι νέα λειτουργικότητα.

### Νέες μέθοδοι (προς υλοποίηση)

Wire shapes: `src/lib/pim/contract.ts`. Client: `src/lib/pim/pim-client.ts`.

| # | Endpoint | Σκοπός |
|---|---|---|
| H18 | `POST /api/public/pim/images/order` | σειρά φωτογραφιών + κύρια εικόνα (`ProductImage.order` / `mainImage`) |
| H19 | `POST /api/public/pim/specifications` | εγγραφή ενός spec σε el/en/it — wrapper του `specifications/save` |
| H19b | `DELETE /api/public/pim/specifications` | αφαίρεση spec — wrapper του `clear-field` |
| H20 | `POST /api/public/pim/promo` | **νέο πεδίο**: `promoPrice` + `promoFrom/To`. Δεν υπάρχει πουθενά σήμερα |

⚠️ **H20 είναι το μόνο που θέλει νέο πεδίο στο μοντέλο.** Το `onSale`/`priceList`
της projection προερχόταν από τη μόνιμη διαφορά δύο τιμοκαταλόγων του SoftOne —
68% του καταλόγου «σε προσφορά» — και μηδενίστηκε. Πραγματική προσφορά θέλει
πραγματική τιμή με παράθυρο ισχύος, και πρέπει να φτάνει στο ERP ώστε το
τιμολόγιο να συμφωνεί με ό,τι είδε ο πελάτης.

💡 **Πρόταση για το H19b:** αντί για σκληρό null, ένα `hidden` boolean στη γραμμή
δίνει το ίδιο αποτέλεσμα σε κάθε κανάλι αλλά κρατά την τιμή ανακτήσιμη. Ένα
καθαρισμένο πεδίο δεν αναιρείται από αυτό το UI.

### Τι παραμένει αποκλειστικά storefront

Πράγματα χωρίς αντίστοιχο στο HDCtool, που δεν έχουν νόημα σε PIM/ERP:

`slug` + `Redirect` (URL είναι έννοια του eshop) · ζώνες αρχικής και banners ·
FAQ · inbox επικοινωνίας · παραγγελίες eshop · `isFeatured` / badges.
