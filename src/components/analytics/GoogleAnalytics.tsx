import Script from "next/script";
import { CookieConsent } from "@/components/analytics/CookieConsent";

/**
 * Google Analytics 4, με Consent Mode v2.
 *
 * ── Η άρνηση είναι η προεπιλογή, και δεν είναι διακοσμητική ────────────────
 *
 * Το κατάστημα πουλά στην Ελλάδα. Το GA4 χωρίς συγκατάθεση γράφει cookie
 * ανάλυσης από το πρώτο δευτερόλεπτο, που είναι ακριβώς αυτό που απαγορεύει ο
 * ePrivacy. Με το Consent Mode ο επισκέπτης μετριέται ανώνυμα μέχρι να πει ναι:
 * το tag φορτώνει, στέλνει pings χωρίς αναγνωριστικά, και μόλις δοθεί η
 * συγκατάθεση αρχίζει η κανονική μέτρηση.
 *
 * Έτσι δεν χάνεται η κίνηση όσων δεν απαντούν, και δεν γράφεται τίποτα σε
 * κανέναν που δεν το ζήτησε.
 *
 * ── Γιατί `beforeInteractive` στο αρχικοποιητικό ──────────────────────────
 *
 * Η προεπιλογή συγκατάθεσης ΠΡΕΠΕΙ να μπει στο `dataLayer` πριν από κάθε
 * `config`. Με `afterInteractive` και στα δύο, η σειρά μεταξύ τους δεν είναι
 * εγγυημένη — και μια φορά που θα προλάβει το `config`, το cookie γράφεται
 * πριν ρωτηθεί κανείς.
 *
 * ── Δεν τρέχει σε ανάπτυξη ─────────────────────────────────────────────────
 *
 * Κάθε ανανέωση σε localhost θα μετριόταν ως επίσκεψη, και η κίνηση
 * προγραμματιστή μπαίνει στα ίδια σύνολα με τους πελάτες — αλλοιώνει ποσοστά
 * μετατροπής για πάντα, χωρίς να καθαρίζεται εκ των υστέρων.
 *
 * ── Το αναγνωριστικό ρυθμίζεται ────────────────────────────────────────────
 *
 * Προεπιλογή η ιδιοκτησία που δόθηκε· το `NEXT_PUBLIC_GA_MEASUREMENT_ID` την
 * παρακάμπτει, και κενή τιμή σβήνει τη μέτρηση — για staging που δεν πρέπει να
 * γράφει στα ίδια δεδομένα.
 */

const MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-EGS1JNM4EC";

/** Το κλειδί που κρατά την απάντηση του επισκέπτη. Ίδιο και στο banner. */
export const CONSENT_STORAGE_KEY = "kolleris-consent-v1";

export function GoogleAnalytics() {
  if (process.env.NODE_ENV !== "production") return null;
  if (!MEASUREMENT_ID) return null;

  /*
   * Η αποθηκευμένη απάντηση διαβάζεται ΜΕΣΑ στο inline script, όχι στον
   * διακομιστή: ο διακομιστής δεν ξέρει τι έχει ο browser, και μια
   * αποθηκευμένη σελίδα θα κουβαλούσε την απάντηση άλλου επισκέπτη.
   */
  const init = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
var granted = false;
try { granted = localStorage.getItem(${JSON.stringify(CONSENT_STORAGE_KEY)}) === "granted"; } catch (e) {}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: granted ? 'granted' : 'denied',
  functionality_storage: 'granted',
  security_storage: 'granted',
  wait_for_update: 500
});
gtag('js', new Date());
gtag('config', ${JSON.stringify(MEASUREMENT_ID)});`;

  return (
    <>
      <Script id="ga4-consent-init" strategy="beforeInteractive">
        {init}
      </Script>
      <Script
        id="ga4-src"
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <CookieConsent />
    </>
  );
}
