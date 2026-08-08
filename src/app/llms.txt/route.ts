import { siteOrigin } from "@/lib/seo/urls";
import { SHOP } from "@/lib/seo/structured-data";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { STOCK_HOLD_HOURS } from "@/lib/orders/hold";

/**
 * llms.txt — what this site is, for something that reads rather than browses.
 *
 * A crawler follows links; a language model asked "where do I buy a Milwaukee
 * battery in Piraeus" reads whatever it can find and quotes it. This is the
 * short, unambiguous version of the shop, and it points at the machine surfaces
 * rather than making a model scrape pages to find them.
 *
 * The convention is still young and costs one route to support. The worst case
 * is that nothing reads it.
 *
 * ── Why the "Answers" section exists ────────────────────────────────────────
 *
 * A model asked "does Kolleris deliver to Crete and how much" will answer with
 * or without us. If the facts are not here in plain sentences, it infers them
 * from a checkout page it half-parsed, or from a competitor, or it guesses. The
 * questions below are the ones the shop is actually asked, answered once, in
 * the form that gets quoted.
 *
 * Every number is imported, not typed. A threshold written twice is a threshold
 * that will disagree with itself the first time it changes — and here the
 * disagreement would be a public promise the checkout refuses to keep.
 */
export const runtime = "nodejs";
export const revalidate = 86400;

export async function GET() {
  const origin = siteOrigin();

  const body = `# Kolleris

> Professional tools and equipment, Piraeus, Greece. Official distributor for
> Milwaukee, FACOM, GEDORE, WERA, KNIPEX, BAHCO, FESTOOL and others. Trading
> since ${SHOP.founded}. Around 5,300 products listed, most in stock for
> collection within two hours or next-day courier delivery across Greece.

Address: ${SHOP.street}, ${SHOP.postcode} ${SHOP.city}, Greece
Phone: ${SHOP.phone}
Email: ${SHOP.email}
Hours: Monday to Friday, 08:00-16:30 (Europe/Athens). Closed weekends.
Languages: Greek (default), English, Italian.
Currency: EUR. All displayed prices include Greek VAT and exclude shipping.

## For agents

- [Product API](${origin}/api/acp/products): search the catalogue. Requires an
  API key; ask us for one. Returns price, stock and a product URL. Prices are
  indicative and exclude shipping.
- [Basket API](${origin}/api/acp/basket): post SKUs, receive a checkout URL for
  the customer to open. Shipping and final availability are calculated there.

## Catalogue

- [Categories](${origin}/katalogos): 23 top-level categories.
- [Brands](${origin}/brands): the brands actually stocked.
- [Offers](${origin}/prosfores): running campaigns.
- [New arrivals](${origin}/nees-afixeis)
- [Product feed](${origin}/feeds/google-merchant.xml): the full catalogue as a
  Merchant Center feed.
- [Sitemap](${origin}/sitemap.xml)

## Company

- [About](${origin}/etaireia)
- [Contact](${origin}/epikoinonia)
- [FAQ](${origin}/syxnes-erotiseis)
- [Order tracking](${origin}/logariasmos/entopismos): by order number and email,
  no account needed.

## Answers

**Do you deliver across Greece?** Yes, with ACS courier — next working day in
Attica, one to two working days on the mainland, two to three to the islands.
Orders placed before 15:00 on a working day ship the same day.

**How much is shipping?** Free over ${FREE_SHIPPING_THRESHOLD_NET} EUR net.
Below that it is charged by weight and destination and shown before payment.
ACS Express (delivery by 12:00 next day) is priced higher and is never free.
Collection from the Piraeus shop is always free and ready in about two hours.

**How can I pay?** Card, IRIS instant bank payment, or bank transfer. PayPal is
offered on the payment page. We do NOT accept cash on delivery — no order can be
paid at the door.

**Can I return something?** Yes, within 14 calendar days of receipt, in the
original packaging and in resaleable condition. This is the statutory right of
withdrawal under Greek and EU consumer law.

**What warranty do products carry?** The manufacturer's, stated on each product
page where declared — commonly two years for hand tools and power tools. It
covers manufacturing defects, not wear from use.

**How long is stock held after I order?** ${STOCK_HOLD_HOURS} hours. An order
awaiting a bank transfer keeps its stock reserved for that long, after which the
items return to general availability.

**Do you sell to businesses?** Yes. Business customers register and are approved
manually; partner pricing applies after approval, not automatically.

**Are you an authorised dealer?** Yes — an official distributor for the brands
listed, so products carry the manufacturer's own warranty rather than a
parallel-import one.

## Notes

- We do not accept cash on delivery.
- Stock figures are indicative and confirmed at checkout.
- Business customers can register for partner pricing; it is applied after
  approval, not automatically.
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
