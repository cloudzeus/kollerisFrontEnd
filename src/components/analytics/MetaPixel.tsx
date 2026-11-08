import Script from "next/script";
import { Suspense } from "react";
import { CONSENT_STORAGE_KEY } from "@/components/analytics/GoogleAnalytics";
import { MetaPageView } from "@/components/analytics/MetaPageView";

/**
 * Meta Pixel (Facebook/Instagram ads), μόνο με συγκατάθεση.
 *
 * Ορίζεται μόνο η ουρά `fbq`· το `fbevents.js` της Meta ΔΕΝ φορτώνει πριν το
 * «Αποδοχή», άρα πριν από αυτό δεν φεύγει ούτε IP προς τη Meta. Ό,τι μπήκε στην
 * ουρά στη σελίδα στέλνεται μόλις δοθεί συγκατάθεση· με άρνηση δεν στέλνεται ποτέ.
 *
 * Μόνο σε production και μόνο με `NEXT_PUBLIC_META_PIXEL_ID`.
 */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

export function MetaPixel() {
  if (process.env.NODE_ENV !== "production") return null;
  if (!/^\d{6,20}$/.test(PIXEL_ID)) return null;

  const init = `
!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window);
window.__kollerisMetaLoad=function(){if(window.__kollerisMetaLoaded)return;window.__kollerisMetaLoaded=1;var t=document.createElement('script');t.async=!0;t.src='https://connect.facebook.net/en_US/fbevents.js';document.head.appendChild(t)};
fbq('init', ${JSON.stringify(PIXEL_ID)});
fbq('track', 'PageView');
try { if (localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)}) === "granted") window.__kollerisMetaLoad(); } catch (e) {}`;

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {init}
      </Script>
      {/* useSearchParams: χωρίς Suspense θα έκανε δυναμικές όλες τις στατικές σελίδες. */}
      <Suspense fallback={null}>
        <MetaPageView />
      </Suspense>
    </>
  );
}
