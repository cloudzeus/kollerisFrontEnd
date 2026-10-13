# Back-order requests («Κατόπιν παραγγελίας») — shared contract

Applies to BOTH eshops (Kolleris `KOL-…`, Milwaukee hdc-front `HDC-…`) and HDCtool.
HDCtool owns the staff decision (the offer). The eshop owns the customer, emails, and Viva payment.
Reuse existing transports — do NOT invent new auth:
- eshop → HDCtool: the existing authenticated intake `POST /api/public/orders` (same client the eshop already uses, `hdctoolRequest`), re-posted on every state change (it is idempotent by orderNumber).
- HDCtool → eshop: the existing signed webhook family `/api/webhooks/hdctool/<event>` (HMAC over raw body, `verifySignature`, same secret, same target resolution as `eshop-order-webhook-target.ts` / `eshop-order-status-notify.ts`).

## 1. When an order is a request
A cart line is "on request" when the product has no stock OR quantity > available stock.
- All lines on request → the whole order is a REQUEST (no payment, no stock hold).
- Mixed cart → the customer chooses at checkout:
  - `split`: in-stock lines become a normal paid order now; on-request lines become a separate REQUEST order with `parentOrderNumber` = the paid order.
  - `together`: the whole cart becomes one REQUEST.
- Requests skip Viva entirely at submission. Customer gets «Λάβαμε το αίτημά σας — θα επιβεβαιωθεί εντός 24 ωρών» with a link `/{locale}/aitima/{token}` (token = random 32+ chars, unguessable, stored hashed or as-is with unique index).

## 2. Request lifecycle (same names in all three systems)
`REQUESTED` → (staff) `OFFERED` | `REJECTED`
`OFFERED` → (customer) `ACCEPTED` (Viva payment created, awaiting payment) | `DECLINED` | (timer) `EXPIRED`
`ACCEPTED` → payment confirmed → the order becomes a NORMAL paid order and continues the standard flow (receipt, HDCtool intake as paid, SoftOne, ACS). `requestStatus` stays `ACCEPTED` and paymentStatus becomes PAID.
A REQUESTED/OFFERED/REJECTED/DECLINED/EXPIRED order must NEVER be sent to SoftOne and must not count as a sale.

## 3. eshop → HDCtool (intake body additions, all optional for backward compat)
```
request: {
  status: "REQUESTED"|"OFFERED"|"ACCEPTED"|"DECLINED"|"EXPIRED"|"REJECTED",
  requestedAt: ISO, parentOrderNumber?: string,
  lines: [{ lineId, mtrl, sku, name, qty, unitNet, vatRate, stockAtRequest: number|null }],
  offerVersion?: number,          // the offer the customer acted on
  customerNote?: string
}
```
HDCtool stores it on its EshopOrder (additive columns or a related table) and shows it in the requests screen. HDCtool must not push a request to SoftOne until `paymentStatus === PAID` (check the existing auto-push / document-issuing paths and gate them).

## 4. HDCtool → eshop: `POST /api/webhooks/hdctool/order-offer` (signed)
```
{
  orderNumber: "KOL-…",
  offerVersion: 1,                // increments on every re-send; eshop keeps only the latest
  decision: "offer" | "reject",
  // decision = offer:
  lines: [{
    kind: "original" | "modified" | "alternative",
    replacesLineId?: string,       // for modified/alternative: which requested line it replaces
    mtrl: number, sku: string, name: string,
    qty: number, unitNet: number, vatRate: number,   // staff-set price, net EUR
    leadTimeText?: string          // e.g. "5–7 εργάσιμες"
  }],
  removedLineIds: string[],        // requested lines dropped without replacement
  leadTimeText?: string,           // order-level
  shippingNet?: number | null,     // null/absent → eshop computes shipping with its normal ACS quote for the offered lines
  note?: string,                   // shown to the customer
  expiresAt: ISO,                  // default now + 3 days
  // decision = reject:
  reason?: string
}
```
Eshop: verify signature, reject stale `offerVersion`, store the offer, set `requestStatus`, email the customer (offer email with the request link / rejection email), respond `{ ok: true }`. Idempotent per (orderNumber, offerVersion).

## 5. Customer page `/{locale}/aitima/{token}` (eshop)
Shows status. When OFFERED: requested vs offered lines (changes highlighted: modified qty/price, alternatives with "αντί για …", removed), lead time, note, totals incl. shipping, expiry countdown, buttons «Αποδοχή & πληρωμή» / «Απόρριψη». Accept → order lines replaced by the offer (keep the original request lines for history), totals recomputed server-side from the STORED offer (never from the browser), Viva payment order created with the existing createPaymentOrder → redirect to Viva Smart Checkout (card / IRIS). Viva webhook/recheck (existing) completes it like any order. Decline → DECLINED. After `expiresAt` → EXPIRED (page shows "η πρόταση έληξε — επικοινωνήστε μαζί μας").

## 6. Timers (eshop, in-process like the payment sweep, with the same DB lock pattern)
- Offer not paid after 24h → one reminder email.
- `expiresAt` passed → EXPIRED, notify HDCtool via intake re-post.
HDCtool timer: requests still REQUESTED after 20h → one alert email to the shop (existing Mailgun helper, internal recipients already used for internal order emails) and red SLA badge.

## 7. Emails (Greek, existing templates/style; EN/IT where the shop has locales)
Request received · Offer ready (with link) · Offer reminder · Request rejected (with reason) · Offer expired. Secret-bearing links: Mailgun `tracking: false` (HDCtool helper has it; eshops: check their mailer and disable click tracking for these).

## HDCtool interface notes

Clarifications of §3–§4 as HDCtool implements them (both eshops follow them):

- **Offer lines.** `original` lines come WITHOUT `replacesLineId` — the eshop matches them to the requested line by `mtrl`. `modified` is sent only when qty or price changed (a lead time alone is not a change). A product staff add («Προσθήκη προϊόντος») is `kind: "alternative"` WITHOUT `replacesLineId`: an additional line, shown «Προσθήκη», never «αντί για …». `alternative` WITH `replacesLineId` is a substitute.
- **`shippingNet`** is always present; `null` = the eshop computes shipping (its normal ACS quote for the offered lines and the order's postcode).
- **Reject** body is exactly `{ orderNumber, offerVersion, decision: "reject", reason }`, `reason` always present. A reject also increments `offerVersion`, so a reject with a higher version than the last offer is applied; an offer after a reject never comes from HDCtool.
- **Delivery / retries.** HDCtool marks OFFERED/REJECTED only on HTTP 2xx with JSON `{ ok: true }`. On anything else it keeps the offer as undelivered and retries the SAME `offerVersion` — so a repeat of the same version must answer `{ ok: true }` without emailing the customer again (the eshop answers `{ ok: true, duplicate: true }`; an older version `{ ok: true, ignored: "stale_offer_version" }`).
- **Signature**: `x-hdc-signature` + `x-hdc-timestamp`, the same as `order-status`. Path `<webhook base>/order-offer` — Kolleris: the base used for `order-status` / `order-shipped`; Milwaukee: the base HDCtool calls for `HDC-` orders.
- **Intake** (`POST /api/public/orders`): `request: { status, requestedAt, parentOrderNumber?, lines: [{ lineId, mtrl, sku, name, qty, unitNet, vatRate, stockAtRequest }], offerVersion?, customerNote? }`. Money may be numbers or strings. A malformed block → HTTP 400 with nothing written (the eshop logs it and records it in `orders.erpError`). The response carries `request: { status }` as stored. Status never moves backwards (REQUESTED < OFFERED < terminal); among terminal statuses the eshop wins.
- **After acceptance + payment** the ordinary re-post with `paymentStatus: "PAID"` releases the order to SoftOne; it keeps the `request` block with `status: "ACCEPTED"` and the `offerVersion` the customer accepted (the eshop refuses newer offers once ACCEPTED, so `offerVersion` stays the accepted one).
- HDCtool accepts staff decisions only while the request is REQUESTED or OFFERED.

---

## Appendix — how the Kolleris eshop implements it

Not part of the contract; where to look in this repo.

- **Data**: additive columns on `orders` (`requestStatus`, `requestToken` unique, `requestedAt`, `parentOrderNumber`, `requestLines` = `{ v, locale, lines[] }` snapshot, `offerVersion`, `offerJson`, `offerExpiresAt`, `offerRemindedAt`, `requestDecisionAt`) — migration `20261013120000_order_backorder_requests` (apply with `prisma migrate deploy`). A request is an ordinary `orders` row with `paymentMethod = card`, `shippingNet = 0` until the offer, and no Viva order / stock hold.
- **Rules (pure)**: `src/lib/requests/model.ts` — line classification (`isOnRequest`: no stock, or quantity > stock; the whole line), `planCheckout` (split / together, decided from server stock), offer zod schema, totals (`priceLines`, same arithmetic as the cart), requested-vs-offered comparison.
- **Checkout**: `src/lib/checkout/actions.ts` → `src/lib/requests/create.ts`. Mixed cart without `requestMode` is refused.
- **State changes**: `src/lib/requests/service.ts` (webhook apply, accept, decline, expire, remind), each a conditional `updateMany`.
- **HDCtool**: intake re-post via `syncRequestToHdctool` (`src/lib/orders/send-to-erp.ts`, `request` block in `buildIntakeBody`) on REQUESTED / ACCEPTED / DECLINED / EXPIRED. `sendOrderToErp` refuses any request that is not ACCEPTED **and** PAID.
- **Webhook**: `POST /api/webhooks/hdctool/order-offer` (same `HDCTOOL_WEBHOOK_SECRET` + `x-hdc-signature` / `x-hdc-timestamp` as `order-status`). Answers: `200 {ok:true,…}` (also for a duplicate or stale `offerVersion`), `400` bad body, `401` signature, `404` unknown order, `409` not a request / already accepted, `422` unknown `replacesLineId` / `removedLineIds`. When `shippingNet` is absent the shop's ACS quote for the offered lines and the order's postcode is taken once, on receipt, and stored with the offer (`quotedShippingNet`).
- **Customer page**: `/{locale}/aitima/{token}` (`src/app/[locale]/aitima/[token]/page.tsx`), noindex, `referrer: no-referrer`. Accept → order lines replaced by the stored offer (original kept in `requestLines`), totals recomputed server-side, `createPaymentOrder`, ACCEPTED, intake, redirect to Viva. Payment then completes through the existing webhook / recheck / payment sweep.
- **Emails**: `src/lib/mail/request-emails.ts`, template `src/emails/templates/order-request.html` (Greek, like every transactional email of this shop; the link opens the page in the customer's locale). Mailgun tracking is turned off (`o:tracking=no`) on every customer email that carries the token. Internal heads-up to `MAIL_ORDER_NOTIFY` on each new request.
- **Timer**: `src/lib/requests/request-sweep.ts`, armed from `instrumentation.ts` like the payment sweep. `REQUEST_SWEEP_ENABLED` (on/off; default on in production), `REQUEST_SWEEP_INTERVAL_MIN` (default 15), `REQUEST_SWEEP_DEBUG=1`.
- **Admin**: request chip/status on `/admin/orders` and the order page (read-only), «Αιτήματα» filter; open requests are not counted as sales on the dashboard.
