# DHL Express for EU destinations — shared contract (HDCtool ↔ Kolleris eshop ↔ Milwaukee eshop)

Scope now: EU member states EXCEPT GR and CY (those stay ACS). No customs, no duties. Non-EU later (DDP).
Use the user's skill: ~/.claude/skills/dhl-express (SKILL.md, reference/*.md, assets/dhl-express/src/{api,client,types}.ts — copy the client into the repo, don't import from ~/.claude). DHL creds live ONLY in HDCtool (DHL_API_KEY, DHL_API_SECRET, DHL_ACCOUNT_NUMBER, DHL_ENV=mock|test|production; currently empty, DHL_ENV=test). The eshops never talk to DHL directly.

## Business decisions (user, 13/10/2026)
- VAT: customers in other EU countries see Greek VAT 24% (as today). Keep the rate in ONE place per system (a function `vatRateForDestination(country)` returning 24 for now) so OSS can be switched on later.
- SoftOne: a NEW shipping method ("DHL Express") will be opened in SoftOne by the user; the code is unknown. HDCtool setting `DHL_SOFTONE_SHIPMENT` (+ optional `DHL_SOFTONE_SERIES` for a special order document, default = the eshop's current series). While `DHL_SOFTONE_SHIPMENT` is empty, a DHL order must NOT be sent to SoftOne: refuse with «Ορίστε τον τρόπο αποστολής DHL (DHL_SOFTONE_SHIPMENT) πριν σταλεί η παραγγελία στο SoftOne». Never fall back to the ACS shipping code.
- Feature flag: the eshop checkout shows the country selector / DHL option ONLY when `INTERNATIONAL_SHIPPING_ENABLED=on` (default off). With the flag off, behaviour is exactly today's (Greece only, the GR-only validation added in 43abb07/8c62e87 stays).

## 1. Quote: eshop → HDCtool (existing endpoint, extended)
`POST /api/public/courier/quote` (same auth the eshops already use). Add optional `country` (ISO-2, default "GR"). For GR/CY → today's ACS behaviour, unchanged. For an EU country other than GR/CY:
request: `{ country, postcode, city, weightKg, dimensions?: {x,y,z} (cm), items?: [{mtrl, qty}] , declaredValue? (EUR gross) }`
response 200: `{ success: true, carrier: "DHL", productCode, productName, netAmount, vatRate: 24, grossAmount, currency: "EUR", estimatedDeliveryDate?, transitDays?, source: "dhl-live"|"dhl-mock" }`
response 422: `{ success: false, error: "unserviceable_postcode" | "unsupported_country" | "invalid_postcode", message }` (eshop must NOT fall back to a table for these — same rule as the ACS no-station fix).
5xx/timeouts: eshop shows «Δεν ήταν δυνατός ο υπολογισμός μεταφορικών — δοκιμάστε ξανά» and blocks checkout for international (no table fallback abroad).
HDCtool caches quotes (country+postcode+rounded weight+dims) for ~1h. Postcode format validated per country with the skill's `normalizePostcode` before calling DHL.

## 2. Order intake: eshop → HDCtool (existing `POST /api/public/orders`)
Already carries `shipCountry` (ISO-2). For DHL orders add `shipping: { carrier: "DHL", productCode, netAmount, vatRate, quotedAt }` (optional block; absent = ACS as today). HDCtool stores carrier on EshopOrder (additive nullable columns or a related table).

## 3. HDCtool back office
- In the eshop orders screens (Kolleris + Milwaukee) a DHL order shows carrier badge «DHL» and, instead of the ACS voucher actions, «Αποστολή DHL»: creates the shipment (POST /shipments, label PDF stored/downloadable, AWB saved), optional pickup booking, «Εκτύπωση ετικέτας», «Παρακολούθηση». Unpaid back-order requests remain blocked (existing gate).
- Tracking sync job in the existing cron fleet (every 2h) → updates status; on delivery the same "order shipped/delivered" notifications as ACS where they exist (reuse; if ACS-specific, add carrier-agnostic hooks).
- Settings/status page section «DHL Express»: env status (names only), environment (mock/test/production), «Δοκιμή τιμής» (rate for a sample IT postcode), DHL_SOFTONE_SHIPMENT/SERIES status.
- With empty credentials the client runs against the MOCK server or a local fake (the public mock currently fails TLS — so use an in-process fake for dev/tests and say so in the UI: «Χωρίς κλειδιά DHL — εικονικές τιμές»). Never call production writes without allowProductionWrites.

## 4. Eshop checkout (both shops, behind INTERNATIONAL_SHIPPING_ENABLED)
- Country selector in the shipping address (default Ελλάδα; list = GR, CY + the other 25 EU states, Greek/English/Italian names per locale). Phone with international prefix.
- GR/CY → ACS exactly as now. Other EU → postcode validated with that country's format (copy `normalizePostcode` from the skill), shipping quoted via §1, method shown as «DHL Express · παράδοση σε X–Y εργάσιμες», VAT 24% (via the single helper). Pickup-from-store and lockers unaffected. COD not offered abroad.
- shipCountry saved on the order and sent in the intake; emails/addresses show the country.
- Server action is authoritative: re-quote server-side at order creation; never trust the client price.

---

## Appendix — how the Kolleris eshop implements it

Not part of the contract; where to look in this repo. No migration: `orders.shipCountry` already existed and the DHL quote is stored in `orders.shippingQuote` (JSON).

- **Flag**: `INTERNATIONAL_SHIPPING_ENABLED` (`on`/`true`/`1`/`yes`), `src/lib/shipping/flag.ts`. Off → no selector, the posted `shipCountry` is ignored, Greek-only checks of `lib/shipping/destination` unchanged, `SHIPPING_METHODS` unchanged.
- **Countries / postcodes**: `src/lib/shipping/countries.ts` (GR, CY + 25 EU, names el/en/it, `validateCountryPostcode`); `src/lib/shipping/eu-postcodes.ts` is the skill's `normalizePostcode` + data, copied verbatim. Malta: DHL's data has no postcode for MT (HDCtool sends `""`); the shop still asks for the Maltese «VLT 1117» for the label.
- **VAT**: `vatRateForDestination(country)` in `src/lib/shipping/vat.ts` (24 for all; OSS later). Used for postage/fee VAT in the cart, request offers and the postage correction.
- **Quote**: `src/lib/shipping/courier-quote.ts` — `quoteDestination` (GR → `quoteLivePostage` unchanged; CY → ACS via HDCtool with `country: "CY"`, no table; EU → `quoteDhl`, `POST /api/public/courier/quote` with `country, postcode, city, weightKg, declaredValue`). 422 codes → refusal on the Τ.Κ. field; 5xx/timeout/network → «Δεν ήταν δυνατός ο υπολογισμός μεταφορικών — δοκιμάστε ξανά», blocked. Successful answers cached 10 min in-process. ETA shown as `transitDays`–`transitDays+1` working days (2–4 when DHL gives none).
- **Checkout**: `DHL_SHIPPING_METHOD` (`id: "dhl"`, never free) is offered only abroad (`shippingMethodsFor`). The form asks `quoteDelivery` (server action) while typing and remembers the destination in the `KOLLERIS_DEST` cookie so the summary is priced for it. `placeOrder` re-quotes and charges its own answer; saves `shipCountry` and the DHL quote (`carrier, productCode, netAmount, vatRate, quotedAt`) in `shippingQuote`.
- **Intake**: `shipping` block from `src/lib/shipping/intake.ts`, added by `buildIntakeBody` for DHL destinations (absent for GR/CY/pickup). A request abroad not yet priced carries `productCode: null, quotedAt: null`.
- **Requests**: request orders store `shipCountry`; an offer with `shippingNet: null` is priced with the same DHL quote (`quoteOfferShipping`), stored in `shippingQuote` on receipt/acceptance.
- **HDCtool quote errors**: 422 codes and 400 (missing city / invalid weight → `invalid_address`) are shown on the form; 502/504/other 5xx, timeouts and network errors are «δοκιμάστε ξανά» and block checkout abroad.
- **Shipped webhook** (`/api/webhooks/hdctool/order-shipped`): optional `carrier: "DHL"` + `trackingUrl` (zod, `src/lib/shipping/tracking.ts`); the AWB goes in the same courier-number column (`acsVoucherNo`), carrier and link in `shippingQuote.shipment`. Shipped email, order tracker and admin show «DHL Express» and DHL's link (fallback `https://www.dhl.com/gr-el/home/tracking/tracking-express.html?submit=1&tracking-id=<AWB>`). ACS bodies take the old path unchanged. Delivery arrives through `order-status` as before.
- **ACS tooling** ignores DHL orders: the dispatch queue and the ACS pickup list exclude `shippingMethod = "dhl"`, the in-shop voucher issuing refuses orders outside Greece.
- **No COD** exists in this shop; no lockers. Postage correction refuses orders outside Greece.
