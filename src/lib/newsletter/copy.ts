/**
 * Ό,τι χρειάζονται ΚΑΙ ο server ΚΑΙ ο browser από την καμπάνια.
 *
 * ── Γιατί ξεχωριστό αρχείο ─────────────────────────────────────────────────
 *
 * Το `campaign.ts` εισάγει τον renderer, που εισάγει `server-only`, που εισάγει
 * `node:fs`. Ο wizard είναι client component και χρειαζόταν ΜΙΑ σταθερά από
 * εκεί — τις προεπιλογές κειμένων. Αυτό αρκούσε για να τραβήξει ολόκληρη την
 * αλυσίδα στο bundle του browser και να σπάσει το build:
 *
 *   «You're importing a module that depends on "server-only"»
 *
 * Οι τύποι δεν φταίνε — σβήνονται στη μεταγλώττιση. Φταίει η ΤΙΜΗ. Οπότε ό,τι
 * είναι τιμή και το θέλουν και οι δύο πλευρές ζει εδώ, χωρίς καμία εισαγωγή
 * που να μυρίζει server.
 */

/**
 * Τα «σταθερά» κείμενα του προτύπου προσφορών — κουμπιά, επικεφαλίδες, μπάνερ B2B.
 *
 * Ήταν καρφωτά μέσα στο markup. Έγιναν μεταβλητές με ΑΥΤΕΣ τις προεπιλογές,
 * ώστε καμία καμπάνια να μην αλλάξει όψη αν δεν τις πειράξει κανείς.
 *
 * Πραγματικός χαρακτήρας αχώριστου κενού (U+00A0), ΟΧΙ «&nbsp;»: όσο τα κείμενα
 * ήταν στο markup το «&nbsp;» ήταν HTML και δούλευε· ως μεταβλητές, το
 * Handlebars κάνει escape το «&» και ο παραλήπτης βλέπει κυριολεκτικά
 * «προσφορες&nbsp;→». Ο χαρακτήρας δεν χρειάζεται escape καθόλου.
 *
 * Χωρίς τόνους στα κεφαλαία, όπως τα είχε το πρότυπο — τα ελληνικά κεφαλαία δεν
 * φέρουν τόνο.
 */
export const DEFAULT_COPY = {
  hero_button: "Δειτε τις προσφορες  →",
  section_eyebrow: "Επιλεγμενα",
  section_title: "Οι προσφορες του μηνα",
  section_link: "Ολες οι προσφορες →",
  all_button: "Ολες οι προσφορες  →",
  b2b_eyebrow: "Για επαγγελματιες",
  b2b_button: "Λογαριασμος B2B  →",
} as const;

export type CampaignCopy = Partial<Record<keyof typeof DEFAULT_COPY, string>>;

export type PickedProduct = {
  id: string;
  slug: string;
  name: string;
  code: string;
  brand: string;
  image: string;
  price: string;
  priceOld: string;
  discount: string;
  stockLabel: string;
  url: string;
};

export type CampaignPayload = {
  campaign: {
    eyebrow: string;
    discount: string;
    title: string;
    text: string;
    url: string;
    valid_until: string;
  };
  products: PickedProduct[];
  /** Ελεύθερο κείμενο από τον editor, ήδη ως HTML. */
  bodyHtml?: string;
  /** Παρακάμψεις των σταθερών κειμένων. Κενό = οι προεπιλογές. */
  copy?: CampaignCopy;
};

export type TemplateMeta = {
  id: string;
  name: string;
  category: string;
  categoryTitle: string;
  subject: string;
  preheader: string;
  takesProducts: boolean;
  takesRichText: boolean;
};

export type ProductFilters = {
  query?: string;
  mtrmark?: number | null;
  onSaleOnly?: boolean;
  inStockOnly?: boolean;
};
