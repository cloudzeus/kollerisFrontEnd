import Script from "next/script";

/**
 * Google Tag Manager.
 *
 * ── Τι κάνει, και τι ΔΕΝ κάνει ────────────────────────────────────────────
 *
 * Φορτώνει τον container. Μέσα του δεν υπάρχει σήμερα καμία ετικέτα — το
 * επιβεβαίωσα κατεβάζοντας το ίδιο το `gtm.js`: μηδέν GA4, μηδέν Google Ads.
 * Άρα δεν μετρά τίποτα από μόνος του· είναι το κουτί για ό,τι μπει αργότερα
 * χωρίς deploy.
 *
 * ── ΠΡΟΣΟΧΗ: το GA4 μετριέται ΗΔΗ, απευθείας ──────────────────────────────
 *
 * Το `GoogleAnalytics` φορτώνει το `G-EGS1JNM4EC` με το δικό του gtag. Αν
 * κάποια μέρα προστεθεί ΚΑΙ μέσα στο GTM ετικέτα GA4 με το ίδιο αναγνωριστικό,
 * κάθε προβολή θα μετρηθεί δύο φορές — και τα ποσοστά μετατροπής θα πέσουν στο
 * μισό χωρίς να αλλάξει τίποτα στο κατάστημα.
 *
 * Τότε διάλεξε ΕΝΑ από τα δύο:
 *   - κράτα το GA4 εδώ και σβήσε την ετικέτα μέσα στον container, ή
 *   - βάλε το GA4 στον container και μηδένισε το `NEXT_PUBLIC_GA_MEASUREMENT_ID`,
 *     που σβήνει το απευθείας tag.
 *
 * ── Συγκατάθεση ───────────────────────────────────────────────────────────
 *
 * Δεν χρειάζεται δεύτερος μηχανισμός. Η προεπιλογή άρνησης μπαίνει στο
 * `dataLayer` από το `GoogleAnalytics` με `beforeInteractive`, δηλαδή ΠΡΙΝ
 * φορτώσει ο container, και το «ναι» του επισκέπτη γράφεται στο ίδιο
 * `dataLayer`. Το GTM διαβάζει από εκεί, όπως και το gtag.
 *
 * ── Δεν τρέχει σε ανάπτυξη ────────────────────────────────────────────────
 *
 * Ίδιος κανόνας με το GA4: η κίνηση του προγραμματιστή δεν μπαίνει στα ίδια
 * σύνολα με των πελατών.
 */

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-NXJCLBQT";

function enabled(): boolean {
  return process.env.NODE_ENV === "production" && Boolean(GTM_ID);
}

/** Ο container. Μπαίνει στο <body>, μετά τη συγκατάθεση που ήδη έχει δηλωθεί. */
export function GoogleTagManager() {
  if (!enabled()) return null;

  return (
    <Script id="gtm" strategy="afterInteractive">
      {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});`}
    </Script>
  );
}

/**
 * Η εκδοχή για φυλλομετρητές χωρίς JavaScript.
 *
 * Αμέσως μετά το άνοιγμα του <body>, όπως το ορίζει το Google: είναι `iframe`
 * και θέλει να υπάρχει στο έγγραφο ακόμη κι όταν δεν τρέχει κανένα script.
 */
export function GoogleTagManagerNoScript() {
  if (!enabled()) return null;

  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
