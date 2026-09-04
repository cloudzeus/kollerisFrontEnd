import { ImageResponse } from "next/og";

/**
 * Η εικόνα που βλέπει κανείς όταν κάποιος στέλνει ένα link του καταστήματος.
 *
 * ── Τι υπήρχε πριν ─────────────────────────────────────────────────────────
 *
 * Τίποτα. Μετρημένο σε έξι σελίδες: ούτε ένα `og:*`, ούτε ένα `twitter:*`.
 * Ένα link του eshop επικολλημένο σε Viber, Messenger, Slack ή LinkedIn
 * εμφανιζόταν ως γυμνή διεύθυνση — χωρίς τίτλο, χωρίς περιγραφή, χωρίς εικόνα.
 * Το `<title>` και το `description` ήταν σωστά· απλώς δεν τα διαβάζει κανένας
 * scraper, γιατί οι scrapers διαβάζουν Open Graph.
 *
 * ── Γιατί παράγεται και δεν είναι αρχείο ───────────────────────────────────
 *
 * Ένα PNG στο `public/` γίνεται λάθος τη μέρα που αλλάζει το λογότυπο ή το
 * σύνθημα, και κανείς δεν το θυμάται γιατί δεν φαίνεται πουθενά στη σελίδα.
 * Εδώ χτίζεται από τα ίδια χρώματα και το ίδιο σήμα με το κατάστημα.
 *
 * ── Χωρίς `next/font` ──────────────────────────────────────────────────────
 *
 * Το `ImageResponse` τρέχει σε δικό του περιβάλλον και δεν βλέπει τα CSS
 * variables της σελίδας· θέλει τα ίδια τα bytes της γραμματοσειράς. Χωρίς
 * αυτά αποδίδει σε system sans, που για 1200×630 σε λευκά κεφαλαία είναι
 * αρκετά κοντά — και σαφώς καλύτερο από το να μην υπάρχει καθόλου εικόνα.
 */
export const alt = "Kolleris — Εργαλεία & Επαγγελματικός Εξοπλισμός";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

/* Το σήμα, ως διαδρομές: το ίδιο διάνυσμα με το `public/brand`. Γραμμένο εδώ
   και όχι διαβασμένο από αρχείο, γιατί το `ImageResponse` δεν φορτώνει
   εξωτερικό SVG — θέλει στοιχεία που ξέρει να ζωγραφίσει. */
const MARK = (
  <svg width="150" height="113" viewBox="0 0 91.8 69.1" fill="#EA3E39">
    <polygon points="91.8,0 49.9,0 0,35.4 0,65.5" />
    <polygon points="33.7,41.4 58.2,69.1 91.8,69.1 67.3,41.4" />
  </svg>
);

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#1A1B1E",
          padding: "72px 80px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {MARK}
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 900,
              letterSpacing: "-0.02em",
              color: "#FFFFFF",
            }}
          >
            ΚΟΛΛΕΡΗΣ
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 74,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: "-0.03em",
              color: "#FFFFFF",
            }}
          >
            ΕΡΓΑΛΕΙΑ ΠΟΥ ΔΟΥΛΕΥΟΥΝ.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "rgba(255,255,255,0.72)" }}>
            Επαγγελματικά εργαλεία, μηχανήματα και αναλώσιμα — από το 1978.
          </div>
        </div>

        {/* Η κόκκινη γραμμή του design system, στο κάτω άκρο. */}
        <div style={{ display: "flex", height: 10, backgroundColor: "#EA3E39", width: 260 }} />
      </div>
    ),
    size,
  );
}
