import Script from "next/script";
import { MERCHANT_ID } from "@/lib/seo/google-reviews";

/**
 * The Google Customer Reviews badge — the seller rating those surveys produce.
 *
 * It cannot be placed inside the footer, and that is Google's constraint
 * rather than a choice made here. Reading `merchantwidget.js` (4 KB, and the
 * only documentation of its actual API): `start()` builds its own
 * `<div id="google-merchantwidget-iframe-wrapper">` with `position: fixed` and
 * `z-index: 2147483647`, appends it to `document.body`, and drops an iframe
 * pointing at google.com/shopping/merchantverse into it. There is no mount
 * point to target and no inline mode — the only branch on `position` is
 * `LEFT_BOTTOM` versus everything else, which anchors bottom-right.
 *
 * So it floats. Mounted from the footer anyway, which is the closest thing to
 * what was asked for and still correct: the badge appears only on storefront
 * pages that render a footer — never in `/admin` — and it sits in the bottom
 * corner alongside the other trust marks rather than over the catalogue.
 *
 * Bottom-left, deliberately: the cart drawer and the back-to-top affordance
 * both live on the right, and the widget's z-index is the maximum a browser
 * accepts, so anything it overlapped it would win against.
 *
 * `lazyOnload`: a rating is not part of any task a visitor came to do, so it
 * loads during browser idle time rather than competing with the catalogue.
 *
 * Until enough surveys come back Google renders "rating unavailable" rather
 * than nothing — expected, and why this ships alongside the opt-in rather than
 * waiting for ratings to exist first.
 */
export function GoogleReviewsBadge() {
  return (
    <>
      <Script
        id="google-merchant-widget"
        src="https://www.gstatic.com/shopping/merchant/merchantwidget.js"
        strategy="lazyOnload"
      />
      <Script
        id="google-merchant-widget-start"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `
            (function(){
              function start(){
                if(!window.merchantwidget) return;
                // start() throws if a wrapper already exists — "blocking a
                // second render". Client navigation remounts the footer, so
                // without this guard the second page view is an uncaught error.
                if(document.getElementById('google-merchantwidget-iframe-wrapper')) return;
                window.merchantwidget.start(${JSON.stringify({
                  merchant_id: MERCHANT_ID,
                  position: "LEFT_BOTTOM",
                })});
              }
              if (window.merchantwidget) { start(); }
              else {
                var s = document.getElementById('google-merchant-widget');
                if (s) s.addEventListener('load', start);
              }
            })();
          `,
        }}
      />
    </>
  );
}
