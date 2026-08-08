import type { Locale } from "@/i18n/routing";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { absoluteUrl } from "@/lib/seo/urls";

/**
 * Τα κομμάτια του Product schema που περιγράφουν ΓΕΓΟΝΟΤΑ, όχι την πώληση.
 *
 * ── Γιατί χωριστό αρχείο, και γιατί τώρα ────────────────────────────────────
 *
 * Το `Product` της σελίδας είχε όνομα, κωδικούς, εικόνα, μάρκα και προσφορά —
 * σωστά όλα, και τίποτα επινοημένο. Αυτό που έλειπε ήταν καθετί που κάνει μια
 * σελίδα ΠΑΡΑΘΕΣΙΜΗ: τα χαρακτηριστικά, το βάρος, η κατηγορία, οι όροι
 * αποστολής και επιστροφής.
 *
 * Η διαφορά μετράει διπλά:
 *
 *   · Στο Google, τα `shippingDetails` και `hasMerchantReturnPolicy` είναι αυτά
 *     που επιτρέπουν να εμφανιστούν μεταφορικά και επιστροφές μέσα στο
 *     αποτέλεσμα. Χωρίς αυτά το αποτέλεσμα δείχνει μόνο τιμή.
 *   · Στα AI chats, η πυκνότητα γεγονότων ΕΙΝΑΙ ο λόγος που παρατίθεται μια
 *     πηγή. Ένα μοντέλο που ρωτιέται «ποιο κατσαβίδι 25mm με 3 μύτες» δεν
 *     μπορεί να προτείνει σελίδα που δεν δηλώνει ούτε μήκος ούτε τεμάχια —
 *     ακόμα κι αν το κείμενο τα λέει, γιατί το κείμενο είναι πρόζα και αυτά
 *     είναι δεδομένα.
 *
 * Τα χαρακτηριστικά ΥΠΑΡΧΟΥΝ ήδη στη βάση, ανά γλώσσα, με μονάδα. Απλώς δεν
 * έβγαιναν ποτέ σε δομημένη μορφή.
 *
 * ── Τίποτα δεν επινοείται ───────────────────────────────────────────────────
 *
 * Κάθε τιμή εδώ προέρχεται από πραγματικό πεδίο ή από δηλωμένη πολιτική του
 * καταστήματος. Δεν υπάρχει `aggregateRating`: δεν υπάρχουν αξιολογήσεις, και
 * ένα schema που δηλώνει βαθμολογία που δεν συνέβη είναι ψέμα προς τη μηχανή
 * και ποινή όταν το καταλάβει.
 */

/** Ελληνικό δικαίωμα υπαναχώρησης — 14 ημερολογιακές ημέρες. */
const RETURN_DAYS = 14;

export type SpecRow = {
  label: string;
  value: string;
  unit: string | null;
};

/**
 * Τα χαρακτηριστικά ως `PropertyValue`.
 *
 * Η μονάδα μπαίνει στο `unitText` και ΟΧΙ κολλημένη στην τιμή: «25» με
 * `unitText: "mm"` είναι μετρήσιμο, το «25 mm» είναι συμβολοσειρά. Μηχανή που
 * συγκρίνει δύο προϊόντα μπορεί να κάνει το πρώτο, όχι το δεύτερο.
 *
 * Κενές τιμές παραλείπονται αντί να σταλούν άδειες — `PropertyValue` χωρίς
 * τιμή είναι ισχυρισμός ότι το προϊόν δεν έχει αυτό το χαρακτηριστικό.
 */
export function specsAsProperties(
  specs: SpecRow[],
  echo?: { brand?: string | null; category?: string | null },
) {
  /*
   * Πετάμε τα χαρακτηριστικά που απλώς επαναλαμβάνουν μάρκα ή κατηγορία.
   *
   * Πολλά είδη έχουν «χαρακτηριστικά» που είναι στην πραγματικότητα ταυτότητα:
   * Κατασκευαστής, Κατηγορία, Υποκατηγορία. Βρίσκονται ήδη στα `brand` και
   * `category` του schema, οπότε εδώ είναι θόρυβος — και θόρυβος που αραιώνει
   * ακριβώς το πράγμα για το οποίο υπάρχει το `additionalProperty`: τα
   * μετρήσιμα. Καλύτερα να μην υπάρχει block παρά block που δεν λέει τίποτα.
   */
  const echoes = new Set(
    [echo?.brand, echo?.category].filter(Boolean).map((v) => String(v).trim().toLowerCase()),
  );
  const rows = specs
    .filter((s) => s.label?.trim() && s.value?.trim())
    .filter((s) => !echoes.has(s.value.trim().toLowerCase()))
    .map((s) => ({
      "@type": "PropertyValue" as const,
      name: s.label.trim(),
      value: s.value.trim(),
      ...(s.unit?.trim() ? { unitText: s.unit.trim() } : {}),
    }));
  return rows.length > 0 ? rows : undefined;
}

/**
 * Οι όροι αποστολής, όπως τους εφαρμόζει πραγματικά το ταμείο.
 *
 * Το κατώφλι δωρεάν μεταφορικών διαβάζεται από την ΙΔΙΑ σταθερά που το
 * επιβάλλει (`FREE_SHIPPING_THRESHOLD_NET`), ώστε το schema να μην μπορεί να
 * υποσχεθεί όριο που το καλάθι δεν αναγνωρίζει.
 *
 * Ο χρόνος παράδοσης είναι εύρος και όχι μία τιμή: Αττική και νησιά δεν
 * παραδίδονται την ίδια μέρα, και ένα «1 εργάσιμη» θα ήταν σωστό για τον μισό
 * πληθυσμό και ψέμα για τον άλλον.
 */
export function shippingDetails(locale: Locale) {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: "0",
      currency: "EUR",
      /* Το «0» ισχύει πάνω από το κατώφλι — δηλωμένο, όχι υπονοούμενο. */
      eligibleTransactionVolume: {
        "@type": "PriceSpecification",
        priceCurrency: "EUR",
        minPrice: FREE_SHIPPING_THRESHOLD_NET,
      },
    },
    shippingDestination: {
      "@type": "DefinedRegion",
      addressCountry: "GR",
    },
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      // Παραγγελία πριν τις 15:00 φεύγει αυθημερόν.
      handlingTime: { "@type": "QuantitativeValue", minValue: 0, maxValue: 1, unitCode: "DAY" },
      // Αττική 1 εργάσιμη · νησιά και δυσπρόσιτες έως 3.
      transitTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 3, unitCode: "DAY" },
    },
    ...(locale ? {} : {}),
  };
}

/**
 * Η πολιτική επιστροφών — το θεσμικό δικαίωμα, δηλωμένο.
 *
 * 14 ημέρες υπαναχώρησης είναι ελληνικός νόμος για πωλήσεις εξ αποστάσεως, όχι
 * εμπορική παροχή. Δηλώνεται γιατί το Google το εμφανίζει δίπλα στην τιμή και
 * γιατί ένα μοντέλο που συγκρίνει καταστήματα το διαβάζει — απουσία εδώ
 * διαβάζεται ως «άγνωστη πολιτική», όχι ως «η προβλεπόμενη».
 */
export function returnPolicy() {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "GR",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays: RETURN_DAYS,
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnShippingFees",
  };
}

/**
 * Πότε παύει να ισχύει η τιμή που δηλώνουμε.
 *
 * Το Google θεωρεί προσφορά χωρίς `priceValidUntil` ως δυνητικά μπαγιάτικη και
 * μπορεί να πάψει να δείχνει την τιμή. Ένας χρόνος από σήμερα δεν είναι
 * αυθαίρετος: οι τιμές συγχρονίζονται από το ERP καθημερινά, οπότε η σελίδα
 * ποτέ δεν είναι πραγματικά τόσο παλιά — η ημερομηνία λέει «όχι εγκαταλελειμμένη»,
 * που είναι ακριβώς το ερώτημα.
 */
export function priceValidUntil(from: Date = new Date()): string {
  const until = new Date(from);
  until.setFullYear(until.getFullYear() + 1);
  return until.toISOString().slice(0, 10);
}

/**
 * Η θέση του προϊόντος στον κατάλογο, ως διαδρομή.
 *
 * Το `BreadcrumbList` δεν είναι διακόσμηση στο αποτέλεσμα αναζήτησης: είναι ο
 * μόνος τρόπος που μια μηχανή μαθαίνει ότι το «ΜΥΤΕΣ SHOCKWAVE» ανήκει στα
 * «Αναλώσιμα» — και η ταξινομία είναι αυτό που ρωτάει ένα AI όταν του ζητούν
 * «τι κατσαβίδια έχει το κατάστημα».
 */
export function productBreadcrumb(
  locale: Locale,
  product: {
    name: string;
    slug: string;
    category?: { name: string; slug: string } | null;
  },
) {
  const items: Array<{ name: string; path: string }> = [
    { name: "Αρχική", path: "/" },
    { name: "Κατάλογος", path: "/katalogos" },
  ];
  if (product.category) {
    items.push({ name: product.category.name, path: `/katalogos/${product.category.slug}` });
  }
  items.push({ name: product.name, path: `/proion/${product.slug}` });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path, locale),
    })),
  };
}
