import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTransaction } from "@/lib/payment/viva";
import { routing, type Locale } from "@/i18n/routing";
import { siteOrigin, siteOriginConfigured } from "@/lib/seo/urls";

/**
 * Where Viva sends the customer back to.
 *
 * Two URLs, because Viva's payment source asks for a Success URL and a Failure
 * URL separately. Both do the same job: work out which order this was and send
 * the customer to its confirmation page.
 *
 * **The redirect is navigation, not truth.** Nothing here marks an order paid.
 * A browser landing on a URL proves only that a browser landed on a URL, and
 * the success path is a link anybody can type. Payment is confirmed by the
 * webhook, which reads the transaction back from Viva's API
 * (`/api/webhooks/viva/payment-created`). This route only decides which page to
 * show; the page shows whatever the webhook has already established.
 *
 * That also means the two outcomes differ by almost nothing, which is correct.
 * The failure URL exists so Viva has somewhere to send a cancelled payment
 * without it looking like a success.
 *
 * Under /api on purpose: the locale middleware skips it, so Viva can hold one
 * fixed URL while customers still land on the page in the language they were
 * shopping in, taken from the `lang` Viva appends.
 */

/** Viva appends `t` (transaction id) and, on most flows, `s` (order code). */
async function resolveOrder(orderCode: string | null, transactionId: string | null) {
  if (orderCode) {
    const byCode = await prisma.order.findUnique({
      where: { vivaOrderCode: orderCode },
      select: { orderNumber: true, guestToken: true },
    });
    if (byCode) return byCode;
  }

  // No order code, or one we do not recognise. The transaction knows its own
  // `merchantTrns`, which is the order number we sent when the payment order
  // was created — so one authenticated call finds it.
  if (transactionId) {
    try {
      const transaction = await getTransaction(transactionId);
      if (transaction.merchantTrns) {
        return prisma.order.findUnique({
          where: { orderNumber: transaction.merchantTrns },
          select: { orderNumber: true, guestToken: true },
        });
      }
    } catch (error) {
      console.error("[payment-return] could not resolve transaction", error);
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ outcome: string }> },
) {
  const { outcome } = await params;
  const query = request.nextUrl.searchParams;

  const asked = (query.get("lang") ?? "").slice(0, 2).toLowerCase();
  const locale = (routing.locales as readonly string[]).includes(asked)
    ? (asked as Locale)
    : routing.defaultLocale;
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;

  const order = await resolveOrder(query.get("s"), query.get("t"));

  /*
   * The base is the site's own address, NOT `request.url`.
   *
   * Behind the proxy, `request.url` is the address the Node process is bound
   * to — `https://0.0.0.0:3000` — because the forwarded headers do not reach
   * `NextRequest.url`. So a customer who had just paid was sent to
   * `https://0.0.0.0:3000/checkout/epibebaiosi/KOL-20260806-0002`, a page no
   * browser can open. Their order was fine: CONFIRMED, PAID, the Viva
   * transaction recorded. They simply could not see it, at the one moment they
   * most needed to.
   *
   * `siteOrigin()` is the configured public address and already survives the
   * trailing comma that once broke every canonical URL on the site. The test is
   * `siteOriginConfigured()` and not `siteOriginProblem()`: an unset variable
   * is not malformed, so it reports no problem while quietly answering
   * localhost — which would send the customer to their own machine instead.
   * Unconfigured means development, and there `request.url` is correct.
   */
  const base = siteOriginConfigured() ? siteOrigin() : request.url;

  /*
   * Nothing to identify. Sending them to the tracking form is better than a
   * 404: they have their order number in an email, and this is the page that
   * takes it.
   */
  if (!order) {
    return NextResponse.redirect(new URL(`${prefix}/logariasmos/entopismos`, base));
  }

  const target = new URL(
    `${prefix}/checkout/epibebaiosi/${order.orderNumber}`,
    base,
  );
  target.searchParams.set("t", order.guestToken);
  // Only so the page can say "payment was not completed" rather than leaving
  // someone on a pending order wondering. It changes no state.
  if (outcome === "failure") target.searchParams.set("payment", "failed");

  return NextResponse.redirect(target);
}
