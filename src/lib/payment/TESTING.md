# Testing Viva payments

Everything here applies to the **demo** environment only. Set
`VIVA_ENVIRONMENT=demo` in `.env` and `viva.ts` routes to the demo hosts:

| | demo | production |
|---|---|---|
| OAuth token | `demo-accounts.vivapayments.com/connect/token` | `accounts.vivapayments.com/connect/token` |
| Create order | `demo-api.vivapayments.com/checkout/v2/orders` | `api.vivapayments.com/checkout/v2/orders` |
| Payment page | `demo.vivapayments.com/web/checkout?ref={OrderCode}` | `www.vivapayments.com/web/checkout?ref={OrderCode}` |

**Demo needs its own credentials.** A demo account is a separate registration at
`demo.vivapayments.com`, with its own `VIVA_CLIENT_ID`, `VIVA_CLIENT_SECRET` and
`VIVA_SOURCE_CODE`. Production keys pointed at the demo host fail
authentication — the order is written, marked `FAILED` with a history row, and
the customer sees "Η σύνδεση με την τράπεζα απέτυχε". That is the failure
working correctly, not the integration working.

## Test cards

Any 3-digit CVV (4 for Amex) and any future expiry.

| Card | Scheme | Result |
|---|---|---|
| 4147 4630 1111 0133 | Visa | ✅ paid |
| 4147 4630 1111 0141 | Visa | ❌ failed |
| 5239 2907 0000 0101 | Mastercard | ✅ paid |
| 5239 2907 0000 0119 | Mastercard | ❌ failed |
| 3762 060000 00009 | American Express | ✅ paid |
| 3762 0600 0000 025 | American Express | ❌ failed |
| 6759 6498 2643 8453 | Maestro | ✅ paid |
| 5012 8899 1154 1119 | Maestro | ❌ failed |

`5188 3400 0000 0060` (Mastercard) triggers the **3DS challenge** pop-up, where
Y / N / A / R / U simulate authenticated, not authenticated, attempted, rejected
and unavailable.

## Forcing a specific decline

The **amount** chooses the decline reason. Pay with `4147 4630 1111 0133`.

Redirected to the failure URL, no retry offered:

| Amount | EventId | Reason |
|---|---|---|
| €99.06 | 10006 | general card problem |
| €99.07 | 10007 | pick up card (fraud) |
| €99.14 | 10014 | invalid card number |
| €99.41 | 10041 | lost card |
| €99.54 | 10054 | expired card |
| €99.70 | 10070 | call issuer |

Decline recovery — Smart Checkout offers a retry in a pop-up:

| Amount | EventId | Reason |
|---|---|---|
| €99.05 | 10005 | do not honor |
| €99.20 | 10200 | temporary error |
| €99.51 | 10051 | insufficient funds |
| €99.57 | 10057 | function not permitted |
| €99.61 | 10061 | withdrawal limit exceeded |
| €99.79 | 10079 | invalid card data |
| €99.96 | 10096 | system malfunction |

Card instalments are Greek merchants only, and JCB success likewise.

## Webhooks

`VIVA_WEBHOOK_VERIFICATION_KEY` is currently empty, so payment webhooks are not
verified in either environment.

Webhooks do **not** fire for expired payment orders, cancelled transactions, or
payments that failed 3DS authentication — so a silent inbox during those tests
is expected rather than a bug. Use the decline amounts above to exercise a
`Transaction Failed` webhook.

## Checkout language

`requestLang` goes inside `customer` on order creation, and `viva.ts` maps the
site locale to it: `el` → `el-GR`, `en` → `en-US`, `it` → `it-IT`.

It is not the last word. Viva picks the checkout language in this order:

1. a query parameter on the redirect URL
2. the language the customer chose on a previous checkout, remembered across merchants
3. `requestLang` from the payment order — what we send
4. the dominant language of the customer's country

So a returning customer who once chose Greek keeps seeing Greek. Passing the
language on the redirect URL would win, but the portal does not document that
parameter's name; do not add it on the strength of a search result.

Sources: [test cards and environments](https://developer.viva.com/integration-reference/test-cards-and-environments/) ·
[OAuth 2.0](https://developer.viva.com/integration-reference/oauth2-authentication/) ·
[Smart Checkout integration](https://developer.viva.com/smart-checkout/smart-checkout-integration/) ·
[specify languages](https://developer.viva.com/smart-checkout/specify-languages/)
