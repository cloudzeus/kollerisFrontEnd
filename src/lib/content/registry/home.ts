/**
 * Homepage copy + the shipping messages that appear in the cart and checkout.
 *
 * These are the original blocks of the content system; they keep their keys and
 * any stored values. Each now also names the page it belongs to (`home`) so the
 * admin can group it under one accordion.
 */

import type { ContentDef } from "./types";

export const home: ReadonlyArray<ContentDef> = [
  // ── Hero ──
  {
    key: "hero.eyebrow",
    page: "home",
    section: "hero",
    label: "Μικρός τίτλος",
    where: "Πάνω από τον μεγάλο τίτλο, με κεφαλαία.",
    kind: "text",
    fallback: "Βιομηχανικά εργαλεία",
    maxChars: 40,
  },
  {
    key: "hero.title",
    page: "home",
    section: "hero",
    label: "Τίτλος",
    where: "Ο μεγάλος τίτλος του banner.",
    kind: "text",
    fallback: "Εργαλεία που δουλεύουν.",
    maxChars: 48,
  },
  {
    key: "hero.titleSecond",
    page: "home",
    section: "hero",
    label: "Δεύτερη γραμμή τίτλου",
    where: "Η γραμμή από κάτω, σε πιο ανοιχτό τόνο.",
    kind: "text",
    fallback: "Χωρίς δικαιολογίες.",
    maxChars: 48,
  },
  {
    key: "hero.lead",
    page: "home",
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
    page: "home",
    section: "hero",
    label: "Κείμενο εισαγωγής (κινητό)",
    where: "Η ίδια θέση σε κινητό, όπου χωράει λιγότερο. Τα {products} και {brands} αντικαθίστανται με τους πραγματικούς αριθμούς.",
    kind: "text",
    fallback: "{products}+ κωδικοί, {brands} brands, παράδοση 24-48 ώρες.",
    maxChars: 80,
  },
  {
    key: "hero.since",
    page: "home",
    section: "hero",
    label: "Έτος ίδρυσης",
    where: "Δίπλα στον μικρό τίτλο.",
    kind: "text",
    fallback: "SINCE 1978",
    maxChars: 20,
  },
  {
    key: "hero.ctaPrimary",
    page: "home",
    section: "hero",
    label: "Κύριο κουμπί",
    where: "Το κόκκινο κουμπί.",
    kind: "text",
    fallback: "Αγοράστε τώρα",
    maxChars: 24,
  },
  {
    key: "hero.ctaSecondary",
    page: "home",
    section: "hero",
    label: "Δεύτερο κουμπί",
    where: "Το κουμπί δίπλα στο κόκκινο.",
    kind: "text",
    fallback: "Κατάλογος",
    maxChars: 24,
  },
  {
    key: "hero.image",
    page: "home",
    section: "hero",
    label: "Εικόνα banner",
    where: "Η φωτογραφία στο δεξί μισό. Διαδρομή αρχείου ή πλήρης διεύθυνση.",
    kind: "image",
    fallback: "",
  },

  // ── About ──
  {
    key: "about.eyebrow",
    page: "home",
    section: "about",
    label: "Μικρός τίτλος",
    where: "Πάνω από τον τίτλο της ενότητας.",
    kind: "text",
    fallback: "Η εταιρεία",
    maxChars: 40,
  },
  {
    key: "about.title",
    page: "home",
    section: "about",
    label: "Τίτλος",
    where: "Ο τίτλος της ενότητας.",
    kind: "text",
    fallback: "Γιατί οι επαγγελματίες",
    maxChars: 60,
  },
  {
    key: "about.titleSecond",
    page: "home",
    section: "about",
    label: "Δεύτερη γραμμή τίτλου",
    where: "Συνέχεια του τίτλου, σε δεύτερη γραμμή.",
    kind: "text",
    fallback: "εμπιστεύονται την Kolleris",
    maxChars: 60,
  },
  {
    key: "about.cta",
    page: "home",
    section: "about",
    label: "Κουμπί",
    where: "Ο σύνδεσμος προς τη σελίδα της εταιρείας.",
    kind: "text",
    fallback: "Γνωρίστε μας",
    maxChars: 24,
  },
  {
    key: "about.image",
    page: "home",
    section: "about",
    label: "Φωτογραφία",
    where: "Η εικόνα δίπλα στο κείμενο. Σήμερα είναι κενή θέση.",
    kind: "image",
    fallback: "",
  },

  // ── Reviews ──
  {
    key: "reviews.title",
    page: "home",
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
    page: "home",
    section: "shipping",
    label: "Μήνυμα δωρεάν μεταφορικών",
    where: "Στο καλάθι, όταν ο πελάτης έχει φτάσει το όριο.",
    kind: "text",
    fallback: "Δωρεάν μεταφορικά",
    maxChars: 60,
  },
  {
    key: "shipping.promise",
    page: "home",
    section: "shipping",
    label: "Υπόσχεση παράδοσης",
    where: "Στη σελίδα προϊόντος και στο ταμείο.",
    kind: "long",
    fallback: "Παραγγελία πριν τις 15:00 εργάσιμη φεύγει αυθημερόν.",
    maxChars: 160,
  },
] as const;
