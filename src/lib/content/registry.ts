/**
 * What marketing can edit, and where it appears.
 *
 * Every entry carries the copy that is compiled into the component as
 * `fallback`. That is the whole safety property: a block that has never been
 * filled in renders exactly what the site renders today, and clearing one puts
 * the original back rather than leaving a hole on a live page.
 *
 * `where` is written for the person editing, not for the developer — it is what
 * the admin shows above the field, so somebody can find the text on the site
 * without being told which component it lives in.
 *
 * Client-safe: definitions only, no values, no I/O.
 */

export type ContentKind = "text" | "long" | "url" | "image";

export type ContentDef = {
  key: string;
  section: string;
  label: string;
  where: string;
  kind: ContentKind;
  fallback: string;
  /** Soft guidance shown as a counter; long copy in a fixed box overflows. */
  maxChars?: number;
};

export const CONTENT_SECTIONS: ReadonlyArray<{ id: string; title: string; blurb: string }> = [
  { id: "hero", title: "Αρχική — κεντρικό banner", blurb: "Το πρώτο πράγμα που βλέπει ο επισκέπτης." },
  { id: "about", title: "Αρχική — «Η εταιρεία»", blurb: "Η ενότητα εμπιστοσύνης, κάτω από τις κατηγορίες." },
  { id: "reviews", title: "Αρχική — αξιολογήσεις", blurb: "Η λωρίδα με τις κριτικές Google." },
  { id: "shipping", title: "Μηνύματα αποστολής", blurb: "Εμφανίζονται στο καλάθι και στο ταμείο." },
] as const;

export const CONTENT: ReadonlyArray<ContentDef> = [
  // ── Hero ──
  {
    key: "hero.eyebrow",
    section: "hero",
    label: "Μικρός τίτλος",
    where: "Πάνω από τον μεγάλο τίτλο, με κεφαλαία.",
    kind: "text",
    fallback: "Βιομηχανικά εργαλεία",
    maxChars: 40,
  },
  {
    key: "hero.title",
    section: "hero",
    label: "Τίτλος",
    where: "Ο μεγάλος τίτλος του banner.",
    kind: "text",
    fallback: "Εργαλεία που δουλεύουν.",
    maxChars: 48,
  },
  {
    key: "hero.titleSecond",
    section: "hero",
    label: "Δεύτερη γραμμή τίτλου",
    where: "Η γραμμή από κάτω, σε πιο ανοιχτό τόνο.",
    kind: "text",
    fallback: "Χωρίς δικαιολογίες.",
    maxChars: 48,
  },
  {
    key: "hero.lead",
    section: "hero",
    label: "Κείμενο εισαγωγής",
    where: "Η παράγραφος κάτω από τον τίτλο, σε υπολογιστή.",
    kind: "long",
    fallback:
      "48 χρόνια προμηθεύουμε ναυτιλιακές εταιρείες, εργοστάσια και συνεργεία. Τώρα με πλήρες απόθεμα online — τιμές, διαθεσιμότητα, παράδοση 24-48 ώρες.",
    maxChars: 200,
  },
  {
    key: "hero.leadMobile",
    section: "hero",
    label: "Κείμενο εισαγωγής (κινητό)",
    where: "Η ίδια θέση σε κινητό, όπου χωράει λιγότερο. Τα {products} και {brands} αντικαθίστανται με τους πραγματικούς αριθμούς.",
    kind: "text",
    fallback: "{products}+ κωδικοί, {brands} brands, παράδοση 24-48 ώρες.",
    maxChars: 80,
  },
  {
    key: "hero.since",
    section: "hero",
    label: "Έτος ίδρυσης",
    where: "Δίπλα στον μικρό τίτλο.",
    kind: "text",
    fallback: "SINCE 1978",
    maxChars: 20,
  },
  {
    key: "hero.ctaPrimary",
    section: "hero",
    label: "Κύριο κουμπί",
    where: "Το κόκκινο κουμπί.",
    kind: "text",
    fallback: "Αγοράστε τώρα",
    maxChars: 24,
  },
  {
    key: "hero.ctaSecondary",
    section: "hero",
    label: "Δεύτερο κουμπί",
    where: "Το κουμπί δίπλα στο κόκκινο.",
    kind: "text",
    fallback: "Κατάλογος",
    maxChars: 24,
  },
  {
    key: "hero.image",
    section: "hero",
    label: "Εικόνα banner",
    where: "Η φωτογραφία στο δεξί μισό. Διαδρομή αρχείου ή πλήρης διεύθυνση.",
    kind: "image",
    fallback: "",
  },

  // ── About ──
  {
    key: "about.eyebrow",
    section: "about",
    label: "Μικρός τίτλος",
    where: "Πάνω από τον τίτλο της ενότητας.",
    kind: "text",
    fallback: "Η εταιρεία",
    maxChars: 40,
  },
  {
    key: "about.title",
    section: "about",
    label: "Τίτλος",
    where: "Ο τίτλος της ενότητας.",
    kind: "text",
    fallback: "Γιατί οι επαγγελματίες",
    maxChars: 60,
  },
  {
    key: "about.titleSecond",
    section: "about",
    label: "Δεύτερη γραμμή τίτλου",
    where: "Συνέχεια του τίτλου, σε δεύτερη γραμμή.",
    kind: "text",
    fallback: "εμπιστεύονται την Kolleris",
    maxChars: 60,
  },
  {
    key: "about.cta",
    section: "about",
    label: "Κουμπί",
    where: "Ο σύνδεσμος προς τη σελίδα της εταιρείας.",
    kind: "text",
    fallback: "Γνωρίστε μας",
    maxChars: 24,
  },
  {
    key: "about.image",
    section: "about",
    label: "Φωτογραφία",
    where: "Η εικόνα δίπλα στο κείμενο. Σήμερα είναι κενή θέση.",
    kind: "image",
    fallback: "",
  },

  // ── Reviews ──
  {
    key: "reviews.title",
    section: "reviews",
    label: "Τίτλος",
    where: "Πάνω από τις κριτικές.",
    kind: "text",
    fallback: "Αξιολογήσεις Google",
    maxChars: 40,
  },

  // ── Shipping messaging ──
  {
    key: "shipping.freeNotice",
    section: "shipping",
    label: "Μήνυμα δωρεάν μεταφορικών",
    where: "Στο καλάθι, όταν ο πελάτης έχει φτάσει το όριο.",
    kind: "text",
    fallback: "Δωρεάν μεταφορικά",
    maxChars: 60,
  },
  {
    key: "shipping.promise",
    section: "shipping",
    label: "Υπόσχεση παράδοσης",
    where: "Στη σελίδα προϊόντος και στο ταμείο.",
    kind: "long",
    fallback: "Παραγγελία πριν τις 15:00 εργάσιμη φεύγει αυθημερόν.",
    maxChars: 160,
  },
] as const;

export const CONTENT_BY_KEY = new Map(CONTENT.map((c) => [c.key, c]));

export type ContentView = {
  key: string;
  value: string;
  /** True when nothing has been saved and the compiled copy is showing. */
  isFallback: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};
