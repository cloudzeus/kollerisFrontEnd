import Script from "next/script";
import { MERCHANT_ID } from "@/lib/seo/google-reviews";

/**
 * The Google Customer Reviews survey opt-in, on the order confirmation page.
 *
 * Asks the customer's permission for Google to email them a survey about this
 * order around the time it should have arrived. Their answers become the
 * seller rating shown next to the shop in search results and on the badge.
 *
 * A server component: nothing here is interactive, and `next/script` renders
 * fine from the server as long as no `onLoad`/`onReady` handler is passed —
 * those need a client component. The opt-in has no such handler.
 *
 * Everything is passed as JSON rather than interpolated into the script text.
 * `JSON.stringify` escapes the values, so an order number or an email that
 * contained a quote could not break out of the string and into the script,
 * which is the standard way an inline script becomes an XSS hole.
 */
export function GoogleReviewsOptIn({
  orderId,
  email,
  deliveryCountry,
  estimatedDeliveryDate,
  gtins,
}: {
  orderId: string;
  email: string;
  /** ISO-3166 alpha-2, e.g. "GR". */
  deliveryCountry: string;
  /** `YYYY-MM-DD`. */
  estimatedDeliveryDate: string;
  /** Valid GTINs only — see `isValidGtin`. Optional in Google's schema. */
  gtins: string[];
}) {
  const config = {
    merchant_id: MERCHANT_ID,
    order_id: orderId,
    email,
    delivery_country: deliveryCountry,
    estimated_delivery_date: estimatedDeliveryDate,
    ...(gtins.length ? { products: gtins.map((gtin) => ({ gtin })) } : {}),
  };

  return (
    <>
      <Script
        id="google-reviews-optin-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.renderOptIn=function(){window.gapi.load('surveyoptin',function(){window.gapi.surveyoptin.render(${JSON.stringify(config)})})}`,
        }}
      />
      {/*
        `?onload=renderOptIn` is Google's own contract: the platform script
        calls that global once it is ready. So the config above must be defined
        first — hence two scripts in this order rather than one.
      */}
      <Script
        id="google-reviews-optin"
        src="https://apis.google.com/js/platform.js?onload=renderOptIn"
        strategy="afterInteractive"
      />
    </>
  );
}
