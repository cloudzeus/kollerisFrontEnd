import { siteOrigin } from "@/lib/seo/urls";
import { SHOP } from "@/lib/seo/structured-data";

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
