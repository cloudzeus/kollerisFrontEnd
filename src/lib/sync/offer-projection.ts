/**
 * Η προσφορά του HDCtool, προβεβλημένη στις στήλες τιμής του καταλόγου.
 *
 * ── Γιατί δεν υπάρχει στήλη «τιμή προσφοράς» ───────────────────────────────
 *
 * Η τιμή της προσφοράς μπαίνει στο `priceNet` και η παγωμένη κανονική στο
 * `priceList` — τις δύο στήλες που ΟΛΗ η βιτρίνα διαβάζει ήδη. Έτσι η κάρτα,
 * η σελίδα προϊόντος, το καλάθι, η σύγκριση, το newsletter και τα feed
 * δείχνουν και χρεώνουν την τιμή της προσφοράς χωρίς να ξέρουν ότι υπάρχει
 * προσφορά. Μια έκτη στήλη «τιμή προσφοράς» θα σήμαινε ότι δεκατέσσερα σημεία
 * εμφάνισης πρέπει να θυμηθούν να τη ρωτήσουν, και το δέκατο πέμπτο δεν θα τη
 * θυμόταν.
 *
 * Εδώ μέσα, και μόνο εδώ, οι τιμές του feed (ΜΕ ΦΠΑ) γίνονται καθαρές.
 */

/** Ό,τι χρειάζεται από το προϊόν του feed — τίποτα άλλο. */
export type OfferInput = {
  pricer02?: number | null;
  priceWeb?: number | null;
  priceRetail?: number | null;
  priceOffer?: number | null;
  offerBasePrice?: number | null;
  offerDiscountPct?: number | null;
  offerBadge?: string | null;
  offerSlug?: string | null;
  offerEndsAt?: string | null;
  price30dLow?: number | null;
};

export type OfferProjection = {
  /** Η τιμή που χρεώνεται, καθαρή. */
  priceNet: number | null;
  /** Η διαγραμμένη «πριν», καθαρή. Null όταν δεν τρέχει προσφορά. */
  priceList: number | null;
  onSale: boolean;
  offerSlug: string | null;
  offerBadge: string | null;
  offerDiscountPct: number | null;
  offerEndsAt: Date | null;
  price30dLowNet: number | null;
};

/** ΤΕΣΣΕΡΑ δεκαδικά: η καθαρή τιμή είναι πηλίκο, και με δύο η μεικτή δεν ξαναβγαίνει. */
const roundTo4 = (value: number) => Math.round(value * 10_000) / 10_000;

const netOf = (gross: number, vatPercent: number) => roundTo4(gross / (1 + vatPercent / 100));

const positive = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Καμία προσφορά: οι στήλες της σβήνονται ρητά. */
const none = (priceNet: number | null): OfferProjection => ({
  priceNet,
  priceList: null,
  onSale: false,
  offerSlug: null,
  offerBadge: null,
  offerDiscountPct: null,
  offerEndsAt: null,
  price30dLowNet: null,
});

export function offerProjection(p: OfferInput, vatPercent: number): OfferProjection {
  /*
   * Η ΠΑΓΩΜΕΝΗ κανονική τιμή προηγείται της σημερινής.
   *
   * Το `offerBasePrice` είναι η τιμή της στιγμής που εγκρίθηκε η προσφορά. Αν
   * η διαγραμμένη έπαιρνε τη σημερινή, ένας κανόνας τιμολόγησης που τρέχει
   * στη μέση της προσφοράς θα άλλαζε το «πριν» κάτω από τα πόδια του πελάτη —
   * και το ποσοστό στο σήμα θα έλεγε άλλο νούμερο από το παραστατικό.
   */
  const baseGross =
    positive(p.offerBasePrice) ?? positive(p.pricer02) ?? positive(p.priceWeb) ?? positive(p.priceRetail);
  const baseNet = baseGross == null ? null : netOf(baseGross, vatPercent);

  const slug = p.offerSlug?.trim() || null;
  const offerGross = positive(p.priceOffer);

  /*
   * Τρεις λόγοι να μη μετρήσει μια προσφορά, και οι τρεις σημαίνουν «δείξε την
   * κανονική τιμή»:
   *
   *   χωρίς slug      — η σελίδα `/prosfores/[slug]` δεν θα άνοιγε, άρα το
   *                     σήμα θα οδηγούσε στο πουθενά
   *   χωρίς τιμή      — παλιό HDCtool, ή γραμμή που δεν επαληθεύτηκε στο ERP
   *   όχι μείωση      — τιμή ίση ή πάνω από την κανονική. Το ίδιο λάθος που
   *                     είχε κάνει το 68% του καταλόγου μόνιμα «σε προσφορά».
   */
  if (!slug || offerGross == null || baseGross == null || offerGross >= baseGross) return none(baseNet);

  const low = positive(p.price30dLow);
  const pct = Number(p.offerDiscountPct);

  return {
    priceNet: netOf(offerGross, vatPercent),
    priceList: baseNet,
    onSale: true,
    offerSlug: slug,
    offerBadge: p.offerBadge?.trim() || null,
    offerDiscountPct: Number.isFinite(pct) && pct > 0 ? pct : null,
    offerEndsAt: p.offerEndsAt ? new Date(p.offerEndsAt) : null,
    price30dLowNet: low == null ? null : netOf(low, vatPercent),
  };
}
