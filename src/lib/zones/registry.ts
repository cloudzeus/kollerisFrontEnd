/**
 * Zones and widgets.
 *
 * A ZONE is a hole in a layout. It has to be declared in code because a
 * component has to render it — you cannot invent a new region of the homepage
 * from an admin screen without someone putting a `<Zone id="…">` there first.
 *
 * A WIDGET is data: which type sits in which zone, in what order, with what
 * props. That split is the whole point — marketing rearranges and reconfigures
 * freely, inside slots whose dimensions and responsive behaviour a designer
 * already decided.
 *
 * Each widget type declares its FIELDS. The admin generates its form from them
 * and the write path validates against them, so adding an option to a widget is
 * one entry here rather than a migration, a form change and a validator.
 *
 * `accepts` on a zone lists the widget types that fit it. A full-width band
 * dropped into a 400px aside is not a layout bug to debug later; it is a choice
 * the admin should never have offered.
 *
 * Client-safe: definitions only, no values, no I/O.
 */

export type FieldKind =
  | "text"
  | "long"
  /** Free URL or internal path. */
  | "link"
  /** Image URL — the admin offers upload, or borrowing a product photo. */
  | "image"
  | "boolean"
  | "select"
  /** A product, stored as its slug. */
  | "product"
  /** A category, stored as its slug. */
  | "category"
  /** Video URL — same picker as image, different accept list. */
  | "video"
  /** A sales badge: preset label plus a tone. */
  | "badge";

export type WidgetField = {
  name: string;
  label: string;
  kind: FieldKind;
  help?: string;
  /** Localised per locale. Non-localised fields (links, flags) stay single. */
  localised?: boolean;
  required?: boolean;
  maxChars?: number;
  options?: ReadonlyArray<{ value: string; label: string }>;
  default?: string | boolean;
};

export type WidgetDef = {
  type: string;
  label: string;
  description: string;
  /** Shown in the picker so somebody can tell two similar widgets apart. */
  preview?: string;
  fields: ReadonlyArray<WidgetField>;
};

/**
 * How a zone arranges what is put in it.
 *
 * The layout belongs to the ZONE, not the widget: the same promo tile has to
 * look right whether it is one of two in a 400px column or one of four across a
 * full-width band, and asking marketing to pick a layout per widget is how a
 * page ends up with four different card shapes in one row.
 */
export type ZoneLayout =
  /** Vertical column. Widgets fill the width, stack in order. */
  | "stack"
  /** Equal columns across the container; wraps on smaller screens. */
  | "grid"
  /** One full-width band per widget, edge to edge. */
  | "band"
  /** Horizontal scroller with arrows once the widgets overflow. */
  | "carousel";

export type ZoneDef = {
  id: string;
  page: string;
  label: string;
  /** What the slot is, in the terms of the person filling it. */
  description: string;
  layout: ZoneLayout;
  /** Columns for `grid`, ignored otherwise. */
  columns?: 2 | 3 | 4;
  accepts: ReadonlyArray<string>;
  /** Hard limit on how many widgets fit. Null for unbounded stacks. */
  max: number | null;
};

/**
 * Background fields every widget carries.
 *
 * Appended to each type's own fields rather than repeated in all of them, so a
 * new widget cannot accidentally ship without a background and the admin form
 * groups them identically everywhere.
 *
 * Video and image are separate fields rather than one "media" field: a video
 * needs a poster image for the first frame and for browsers that refuse to
 * autoplay, and collapsing them would lose that.
 */
/**
 * Ready-made sales badges.
 *
 * Presets rather than free text because a badge is a promise: "ΝΕΟ" and "-20%"
 * mean something to a customer, and a zone where one tile says "ΠΡΟΣΦΟΡΑ" and
 * the next says "προσφορα!!" reads as a shop that does not check its own work.
 * Custom text is still allowed — it just is not the first thing offered.
 */
export const BADGE_PRESETS: ReadonlyArray<{
  value: string;
  label: string;
  tone: BadgeTone;
}> = [
  { value: "ΝΕΟ", label: "ΝΕΟ", tone: "ink" },
  { value: "ΠΡΟΣΦΟΡΑ", label: "ΠΡΟΣΦΟΡΑ", tone: "red" },
  { value: "ΤΕΛΕΥΤΑΙΑ ΤΕΜΑΧΙΑ", label: "ΤΕΛΕΥΤΑΙΑ ΤΕΜΑΧΙΑ", tone: "amber" },
  { value: "ΔΩΡΕΑΝ ΜΕΤΑΦΟΡΙΚΑ", label: "ΔΩΡΕΑΝ ΜΕΤΑΦΟΡΙΚΑ", tone: "green" },
  { value: "ΕΠΑΓΓΕΛΜΑΤΙΚΗ ΣΕΙΡΑ", label: "ΕΠΑΓΓΕΛΜΑΤΙΚΗ ΣΕΙΡΑ", tone: "ink" },
  { value: "ΑΜΕΣΑ ΔΙΑΘΕΣΙΜΟ", label: "ΑΜΕΣΑ ΔΙΑΘΕΣΙΜΟ", tone: "green" },
] as const;

export type BadgeTone = "ink" | "red" | "amber" | "green";

export const BADGE_TONES: ReadonlyArray<{
  value: BadgeTone;
  label: string;
  className: string;
}> = [
  { value: "ink", label: "Μαύρο", className: "bg-k-ink text-white" },
  { value: "red", label: "Κόκκινο", className: "bg-k-red text-white" },
  { value: "amber", label: "Πορτοκαλί", className: "bg-k-amber text-white" },
  { value: "green", label: "Πράσινο", className: "bg-k-green text-white" },
] as const;

/**
 * Entrance animation for a widget's text.
 *
 * Offered per widget rather than switched on globally: an animation on
 * everything is noise, and the point is to draw the eye to the one thing being
 * sold. Every option respects `prefers-reduced-motion` at render — motion is a
 * flourish, and for some people it is a symptom.
 */
export const ANIMATION_FIELDS: ReadonlyArray<WidgetField> = [
  {
    name: "animation",
    label: "Κίνηση κειμένου",
    kind: "select",
    help: "Παίζει μία φορά, όταν το widget εμφανιστεί στην οθόνη.",
    options: [
      { value: "none", label: "Καμία" },
      { value: "fade-up", label: "Ανάδυση από κάτω" },
      { value: "slide-in", label: "Είσοδος από πλάι" },
      { value: "reveal", label: "Αποκάλυψη λέξη-λέξη" },
      { value: "zoom", label: "Ελαφρύ ζουμ" },
    ],
    default: "none",
  },
  {
    name: "animationDelay",
    label: "Καθυστέρηση",
    kind: "select",
    help: "Για να μην ξεκινούν όλα μαζί σε μια ζώνη με πολλά widgets.",
    options: [
      { value: "0", label: "Καμία" },
      { value: "100", label: "0,1 δευτ." },
      { value: "200", label: "0,2 δευτ." },
      { value: "400", label: "0,4 δευτ." },
    ],
    default: "0",
  },
] as const;

/** Badge fields, on every widget for the same reason the background group is. */
export const BADGE_FIELDS: ReadonlyArray<WidgetField> = [
  {
    name: "badge",
    label: "Σήμανση",
    kind: "badge",
    help: "Εμφανίζεται πάνω αριστερά. Αφήστε κενό για καμία.",
  },
  {
    name: "badgeTone",
    label: "Χρώμα σήμανσης",
    kind: "select",
    options: BADGE_TONES.map((t) => ({ value: t.value, label: t.label })),
    default: "red",
  },
] as const;

/**
 * Πού πηγαίνει το widget.
 *
 * Κοινό σε ΟΛΟΥΣ τους τύπους, όχι σε όσους έτυχε να το έχουν. Το widget
 * αποδίδεται ολόκληρο μέσα σε έναν σύνδεσμο — αυτό ίσχυε πάντα — αλλά μόνο το
 * «Πλακίδιο προβολής» και το «Κείμενο» είχαν πεδίο για να τον ορίσεις. Μια
 * κάρτα κατηγορίας ή ένα widget με βίντεο φόντου έπεφταν σιωπηλά στο
 * `/katalogos`, χωρίς τρόπο να αλλάξει: το πιο εντυπωσιακό στοιχείο της
 * σελίδας οδηγούσε στο πιο γενικό μέρος του καταστήματος.
 */
export const LINK_FIELDS: ReadonlyArray<WidgetField> = [
  {
    name: "href",
    label: "Σύνδεσμος",
    kind: "link",
    help: "Πού πηγαίνει όποιος το πατήσει. Κενό σημαίνει ο κατάλογος.",
    default: "/katalogos",
  },
] as const;

export const BACKGROUND_FIELDS: ReadonlyArray<WidgetField> = [
  {
    name: "bgKind",
    label: "Φόντο",
    kind: "select",
    options: [
      { value: "none", label: "Χωρίς — μόνο χρώμα" },
      { value: "image", label: "Εικόνα" },
      { value: "video", label: "Βίντεο" },
    ],
    default: "none",
  },
  {
    name: "bgImage",
    label: "Εικόνα φόντου",
    kind: "image",
    help: "Ανεβάστε δική σας ή διαλέξτε φωτογραφία από προϊόν.",
  },
  {
    name: "bgVideo",
    label: "Βίντεο φόντου",
    kind: "video",
    help: "Παίζει σιωπηλά και σε επανάληψη. Κρατήστε το κάτω από 5MB.",
  },
  {
    name: "bgPoster",
    label: "Πρώτο καρέ βίντεο",
    kind: "image",
    help: "Δείχνεται όσο φορτώνει το βίντεο, και όπου δεν παίζει αυτόματα.",
  },
  {
    name: "bgOverlay",
    label: "Σκίαση φόντου",
    kind: "select",
    help: "Κάνει το κείμενο ευανάγνωστο πάνω σε φωτεινή φωτογραφία.",
    options: [
      { value: "none", label: "Καμία" },
      { value: "light", label: "Ελαφριά" },
      { value: "medium", label: "Μέτρια" },
      { value: "strong", label: "Έντονη" },
    ],
    default: "medium",
  },
] as const;

export const WIDGETS: ReadonlyArray<WidgetDef> = [
  {
    type: "promo-tile",
    label: "Πλακίδιο προβολής",
    description: "Εικόνα με μικρό τίτλο, τίτλο και μία γραμμή κειμένου.",
    preview: "Εικόνα + κείμενο + σύνδεσμος",
    fields: [
      {
        name: "eyebrow",
        label: "Μικρός τίτλος",
        kind: "text",
        localised: true,
        maxChars: 24,
      },
      {
        name: "title",
        label: "Τίτλος",
        kind: "text",
        localised: true,
        required: true,
        maxChars: 40,
      },
      {
        name: "body",
        label: "Κείμενο",
        kind: "text",
        localised: true,
        maxChars: 90,
      },
      {
        name: "image",
        label: "Εικόνα",
        kind: "image",
        help: "Ανεβάστε δική σας ή διαλέξτε φωτογραφία από προϊόν.",
      },
      {
        name: "dark",
        label: "Σκούρο πλακίδιο",
        kind: "boolean",
        help: "Λευκά γράμματα πάνω στη φωτογραφία.",
        default: false,
      },
    ],
  },
  {
    type: "category-card",
    label: "Κάρτα κατηγορίας",
    description:
      "Δείχνει μια κατηγορία με τη φωτογραφία και το πλήθος προϊόντων της.",
    preview: "Κατηγορία + πλήθος",
    fields: [
      {
        name: "category",
        label: "Κατηγορία",
        kind: "category",
        required: true,
      },
      {
        name: "titleOverride",
        label: "Τίτλος (προαιρετικός)",
        kind: "text",
        localised: true,
        help: "Αφήστε κενό για το όνομα της κατηγορίας.",
        maxChars: 40,
      },
      { name: "image", label: "Εικόνα", kind: "image" },
    ],
  },
  {
    type: "product-spotlight",
    label: "Προβολή προϊόντος",
    description: "Ένα προϊόν με φωτογραφία, τιμή και κουμπί.",
    preview: "Προϊόν + τιμή",
    fields: [
      { name: "product", label: "Προϊόν", kind: "product", required: true },
      {
        name: "eyebrow",
        label: "Μικρός τίτλος",
        kind: "text",
        localised: true,
        maxChars: 24,
      },
      {
        name: "image",
        label: "Εικόνα (προαιρετική)",
        kind: "image",
        help: "Αφήστε κενό για την κύρια φωτογραφία του προϊόντος.",
      },
    ],
  },
  {
    type: "rich-text",
    label: "Κείμενο",
    description: "Τίτλος και παράγραφος, χωρίς εικόνα προϊόντος.",
    preview: "Τίτλος + παράγραφος",
    fields: [
      {
        name: "title",
        label: "Τίτλος",
        kind: "text",
        localised: true,
        maxChars: 60,
      },
      {
        name: "body",
        label: "Κείμενο",
        kind: "long",
        localised: true,
        maxChars: 400,
      },
      {
        name: "cta",
        label: "Κουμπί",
        kind: "text",
        localised: true,
        maxChars: 24,
      },
    ],
  },
] as const;

/**
 * Values a widget can drop into its text.
 *
 * Written as `{products}` in any text field and replaced at render, so a
 * headline can say "5.305 κωδικοί" without somebody typing a number that is
 * wrong the next time the catalogue syncs.
 */
export const DYNAMIC_TOKENS: ReadonlyArray<{ token: string; label: string }> = [
  { token: "{products}", label: "Πλήθος προϊόντων" },
  { token: "{brands}", label: "Πλήθος brands" },
  { token: "{categories}", label: "Πλήθος κατηγοριών" },
  { token: "{freeShipping}", label: "Όριο δωρεάν μεταφορικών" },
] as const;

const ALL: ReadonlyArray<string> = [
  "promo-tile",
  "category-card",
  "product-spotlight",
  "rich-text",
];

/*
 * Οι θέσεις όπου μπαίνει banner.
 * ─────────────────────────────────────────────────────────────────────────────
 * Τρεις από αυτές ήταν δηλωμένες αλλά καμία σελίδα δεν τις απέδιδε: ο συντάκτης
 * τοποθετούσε το banner στη «Σελίδα προϊόντος», η οθόνη έλεγε «Δημοσιευμένο»,
 * και στο site δεν υπήρχε τίποτα. Καμία ένδειξη πουθενά, γιατί από την πλευρά
 * των δεδομένων όλα ήταν σωστά — απλώς δεν το ζητούσε κανείς.
 *
 * Κάθε ζώνη εδώ αποδίδεται τώρα από τη σελίδα της. Το `page` δεν είναι
 * διακοσμητικό: ομαδοποιεί τη λίστα στην τοποθέτηση, που με είκοσι θέσεις σε
 * ένα ενιαίο μενού θα ήταν άχρηστη.
 *
 * Οι θέσεις είναι σταθερά δύο ανά σελίδα — κορυφή και τέλος — εκτός από την
 * αρχική, που είναι φτιαγμένη σε ενότητες και σηκώνει περισσότερες. Η κορυφή
 * πιάνει το βλέμμα πριν το περιεχόμενο· το τέλος πιάνει όποιον διάβασε και δεν
 * αγόρασε, που είναι διαφορετικό κοινό και θέλει διαφορετικό μήνυμα.
 */
export const ZONES: ReadonlyArray<ZoneDef> = [
  /* ── Αρχική ── */
  {
    id: "home.top",
    page: "Αρχική",
    label: "Πάνω από το hero",
    description:
      "Λεπτή λωρίδα στην κορυφή. Για ανακοινώσεις με ημερομηνία λήξης.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "home.aside",
    page: "Αρχική",
    label: "Δεξιά από το κεντρικό banner",
    description: "Στήλη 400px δίπλα στο hero. Μόνο σε υπολογιστή.",
    layout: "stack",
    accepts: ALL,
    max: 2,
  },
  {
    id: "home.belowCategories",
    page: "Αρχική",
    label: "Κάτω από τις κατηγορίες",
    description: "Πλέγμα σε όλο το πλάτος. Καλό για τρεις ισοδύναμες προβολές.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 6,
  },
  {
    id: "home.band",
    page: "Αρχική",
    label: "Λωρίδα πλήρους πλάτους",
    description:
      "Μία λωρίδα ανά widget, από άκρη σε άκρη. Δυνατό με βίντεο φόντο.",
    layout: "band",
    accepts: ALL,
    max: 3,
  },
  {
    id: "home.beforeFooter",
    page: "Αρχική",
    label: "Πριν το υποσέλιδο",
    description: "Το τελευταίο πράγμα πριν τους συνδέσμους. Για εγγραφή ή B2B.",
    layout: "band",
    accepts: ALL,
    max: 2,
  },

  /* ── Κατάλογος ── */
  {
    id: "catalogue.top",
    page: "Κατάλογος",
    label: "Πάνω από τις κατηγορίες",
    description: "Οριζόντιος κύλινδρος. Καλό για εποχικές προβολές.",
    layout: "carousel",
    accepts: ALL,
    max: null,
  },
  {
    id: "catalogue.bottom",
    page: "Κατάλογος",
    label: "Τέλος σελίδας",
    description: "Για όποιον κατέβηκε ως το τέλος χωρίς να διαλέξει κατηγορία.",
    layout: "grid",
    columns: 2,
    accepts: ALL,
    max: 4,
  },
  {
    id: "catalogue.middle",
    page: "Κατάλογος",
    label: "Ανάμεσα στις κατηγορίες",
    description: "Λωρίδα στη μέση του καταλόγου.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },

  /* ── Κατηγορία ── */
  {
    id: "category.top",
    page: "Κατηγορία",
    label: "Πάνω από τα προϊόντα",
    description: "Κάτω από τον τίτλο της κατηγορίας, πριν τα φίλτρα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "category.middle",
    page: "Κατηγορία",
    label: "Στη μέση",
    description: "Λωρίδα ανάμεσα στα προϊόντα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "category.bottom",
    page: "Κατηγορία",
    label: "Κάτω από τα προϊόντα",
    description: "Μετά τη σελιδοποίηση. Για συναφείς κατηγορίες ή μάρκες.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },

  /* ── Σελίδα προϊόντος ── */
  {
    id: "product.aboveRelated",
    page: "Σελίδα προϊόντος",
    label: "Πάνω από τα σχετικά προϊόντα",
    description: "Μετά την περιγραφή. Πιάνει όποιον διάβασε τα χαρακτηριστικά.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "product.middle",
    page: "Σελίδα προϊόντος",
    label: "Στη μέση",
    description: "Ανάμεσα στην περιγραφή και τα σχετικά.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "product.below",
    page: "Σελίδα προϊόντος",
    label: "Κάτω από τα σχετικά προϊόντα",
    description: "Πλέγμα δύο στηλών στο τέλος της σελίδας.",
    layout: "grid",
    columns: 2,
    accepts: ALL,
    max: 4,
  },

  /* ── Προσφορές ── */
  {
    id: "offers.top",
    page: "Προσφορές",
    label: "Κορυφή σελίδας",
    description: "Μία λωρίδα πλήρους πλάτους πάνω από τις προσφορές.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "offers.middle",
    page: "Προσφορές",
    label: "Στη μέση",
    description: "Λωρίδα ανάμεσα στις καμπάνιες.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "offers.bottom",
    page: "Προσφορές",
    label: "Τέλος σελίδας",
    description: "Κάτω από τη λίστα των προσφορών.",
    layout: "grid",
    columns: 2,
    accepts: ALL,
    max: 2,
  },

  /* ── Υπόλοιπες σελίδες καταλόγου ── */
  {
    id: "arrivals.top",
    page: "Νέες αφίξεις",
    label: "Κορυφή σελίδας",
    description: "Πάνω από τα νέα προϊόντα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "arrivals.middle",
    page: "Νέες αφίξεις",
    label: "Στη μέση",
    description: "Ανάμεσα στους μήνες.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "arrivals.bottom",
    page: "Νέες αφίξεις",
    label: "Τέλος σελίδας",
    description: "Κάτω από τις αφίξεις.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },
  {
    id: "brands.top",
    page: "Μάρκες",
    label: "Κορυφή σελίδας",
    description: "Πάνω από τον κατάλογο των μαρκών.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "brands.middle",
    page: "Μάρκες",
    label: "Στη μέση",
    description: "Ανάμεσα στο πλέγμα και τις ειδικότητες.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "brands.bottom",
    page: "Μάρκες",
    label: "Τέλος σελίδας",
    description: "Κάτω από το πλέγμα μαρκών. Για κατηγορίες ή προσφορές.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },
  {
    id: "brand.top",
    page: "Σελίδα μάρκας",
    label: "Κορυφή σελίδας",
    description: "Κάτω από το λογότυπο της μάρκας. Ίδιο σε όλες τις μάρκες.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "brand.middle",
    page: "Σελίδα μάρκας",
    label: "Στη μέση",
    description: "Ανάμεσα στα προϊόντα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "brand.bottom",
    page: "Σελίδα μάρκας",
    label: "Κάτω από τα προϊόντα",
    description: "Μετά το πλέγμα. Για σχετικές μάρκες ή εγγύηση.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },
  {
    id: "search.top",
    page: "Αναζήτηση",
    label: "Πάνω από τα αποτελέσματα",
    description: "Φαίνεται σε κάθε αναζήτηση, ό,τι κι αν αναζητήθηκε.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "search.middle",
    page: "Αναζήτηση",
    label: "Στη μέση",
    description: "Ανάμεσα στα αποτελέσματα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "search.bottom",
    page: "Αναζήτηση",
    label: "Τέλος αποτελεσμάτων",
    description: "Δείχνεται και όταν η αναζήτηση δεν βρήκε τίποτα.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },

  /* ── Περιεχόμενο ── */
  {
    id: "blog.top",
    page: "Blog",
    label: "Κορυφή σελίδας",
    description: "Πάνω από τη λίστα των άρθρων.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "blog.middle",
    page: "Blog",
    label: "Στη μέση",
    description: "Ανάμεσα στα άρθρα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "blog.bottom",
    page: "Blog",
    label: "Τέλος σελίδας",
    description: "Κάτω από τα άρθρα. Για εγγραφή ή κατηγορίες.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },
  {
    id: "article.below",
    page: "Άρθρο",
    label: "Τέλος άρθρου",
    description: "Μετά το κείμενο. Ίδιο σε όλα τα άρθρα.",
    layout: "grid",
    columns: 2,
    accepts: ALL,
    max: 2,
  },
  {
    id: "article.top",
    page: "Άρθρο",
    label: "Πάνω από το άρθρο",
    description: "Λεπτή λωρίδα πριν το κείμενο. Χωρίς να κόβει την ανάγνωση.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "article.middle",
    page: "Άρθρο",
    label: "Στη μέση",
    description: "Μέσα στο κείμενο, μετά την εισαγωγή.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },

  /* ── Αγορά και εταιρικές ── */
  {
    id: "cart.below",
    page: "Καλάθι",
    label: "Κάτω από το καλάθι",
    description: "Για συμπληρωματικά ή για το όριο δωρεάν μεταφορικών.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "cart.top",
    page: "Καλάθι",
    label: "Πάνω από το καλάθι",
    description: "Για δωρεάν μεταφορικά ή συμπληρωματικά.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "cart.middle",
    page: "Καλάθι",
    label: "Στη μέση",
    description: "Ανάμεσα στο καλάθι και τη σύνοψη.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "contact.below",
    page: "Επικοινωνία",
    label: "Τέλος σελίδας",
    description: "Κάτω από τη φόρμα και τα στοιχεία.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "contact.top",
    page: "Επικοινωνία",
    label: "Πάνω από τη φόρμα",
    description: "Ώρες, τηλέφωνο, κατάστημα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "contact.middle",
    page: "Επικοινωνία",
    label: "Στη μέση",
    description: "Ανάμεσα στη φόρμα και τον χάρτη.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "about.below",
    page: "Εταιρεία",
    label: "Τέλος σελίδας",
    description: "Κάτω από το ιστορικό.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "about.top",
    page: "Εταιρεία",
    label: "Πάνω από το κείμενο",
    description: "Λωρίδα εισαγωγής.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "about.middle",
    page: "Εταιρεία",
    label: "Στη μέση",
    description: "Ανάμεσα στις ενότητες.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "faq.below",
    page: "Συχνές ερωτήσεις",
    label: "Τέλος σελίδας",
    description: "Κάτω από τις ερωτήσεις. Για επικοινωνία ή B2B.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "faq.top",
    page: "Συχνές ερωτήσεις",
    label: "Πάνω από τις ερωτήσεις",
    description: "Για επικοινωνία ή B2B.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "faq.middle",
    page: "Συχνές ερωτήσεις",
    label: "Στη μέση",
    description: "Ανάμεσα στις ομάδες ερωτήσεων.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },

  /* ── Όλα τα προϊόντα ── */
  {
    id: "products.top",
    page: "Όλα τα προϊόντα",
    label: "Πάνω από τη λίστα",
    description: "Οριζόντιος κύλινδρος πάνω από το πλέγμα.",
    layout: "carousel",
    accepts: ALL,
    max: 4,
  },
  {
    id: "products.middle",
    page: "Όλα τα προϊόντα",
    label: "Στη μέση",
    description: "Ανάμεσα στα προϊόντα.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "products.bottom",
    page: "Όλα τα προϊόντα",
    label: "Τέλος σελίδας",
    description: "Κάτω από τη σελιδοποίηση.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },

  /* ── Σελίδα προσφοράς ── */
  {
    id: "offer.top",
    page: "Σελίδα προσφοράς",
    label: "Πάνω από τα προϊόντα",
    description: "Λωρίδα κάτω από τον τίτλο της καμπάνιας.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "offer.middle",
    page: "Σελίδα προσφοράς",
    label: "Στη μέση",
    description: "Ανάμεσα στα προϊόντα της καμπάνιας.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "offer.bottom",
    page: "Σελίδα προσφοράς",
    label: "Τέλος σελίδας",
    description: "Κάτω από τα προϊόντα της προσφοράς.",
    layout: "grid",
    columns: 3,
    accepts: ALL,
    max: 3,
  },

  /* ── Υπόλοιπες σελίδες ── */
  {
    id: "compare.below",
    page: "Σύγκριση",
    label: "Κάτω από τον πίνακα",
    description: "Για βοήθεια επιλογής ή επικοινωνία.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "compare.top",
    page: "Σύγκριση",
    label: "Πάνω από τον πίνακα",
    description: "Λωρίδα πριν τη σύγκριση.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "compare.middle",
    page: "Σύγκριση",
    label: "Στη μέση",
    description: "Ανάμεσα στον πίνακα και τις προτάσεις.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "b2b.below",
    page: "Εταιρικός λογαριασμός",
    label: "Κάτω από τα στοιχεία",
    description: "Για τιμοκατάλογο ή επικοινωνία με πωλητή.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "b2b.top",
    page: "Εταιρικός λογαριασμός",
    label: "Πάνω από τα στοιχεία",
    description: "Λωρίδα καλωσορίσματος.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "b2b.middle",
    page: "Εταιρικός λογαριασμός",
    label: "Στη μέση",
    description: "Ανάμεσα στα μεγέθη και τους ρόλους.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "policy.below",
    page: "Θεσμικές σελίδες",
    label: "Κάτω από το κείμενο",
    description:
      "Κοινή ζώνη σε όρους, απόρρητο, αποστολή, επιστροφές, εγγυήσεις, πληρωμές.",
    layout: "band",
    accepts: ALL,
    max: 2,
  },
  {
    id: "policy.top",
    page: "Θεσμικές σελίδες",
    label: "Πάνω από το κείμενο",
    description: "Κοινή λωρίδα σε όλες τις θεσμικές.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
  {
    id: "policy.middle",
    page: "Θεσμικές σελίδες",
    label: "Στη μέση",
    description: "Ανάμεσα στις ενότητες του κειμένου.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
] as const;

export const WIDGETS_BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

/** A widget's own fields followed by the background group every widget shares. */
export function fieldsFor(type: string): ReadonlyArray<WidgetField> {
  const def = WIDGETS_BY_TYPE.get(type);
  return def
    ? [
        ...def.fields,
        ...LINK_FIELDS,
        ...BADGE_FIELDS,
        ...ANIMATION_FIELDS,
        ...BACKGROUND_FIELDS,
      ]
    : [];
}
export const ZONES_BY_ID = new Map(ZONES.map((z) => [z.id, z]));

/** A stored widget, as the admin and the renderer both see it. */
export type WidgetInstance = {
  id: string;
  zone: string;
  type: string;
  order: number;
  enabled: boolean;
  props: Record<string, unknown>;
};

/**
 * Reads one prop for a locale.
 *
 * A localised field is stored as `{el: "…", en: "…"}`. Falling back to Greek
 * rather than to empty is deliberate: a half-translated widget should show the
 * Greek text on the English page, not a hole where a title belongs.
 */
export function propText(
  props: Record<string, unknown>,
  name: string,
  locale: string,
  defaultLocale = "el",
): string {
  const raw = props[name];
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const map = raw as Record<string, string>;
    return (map[locale] || map[defaultLocale] || "").trim();
  }
  return "";
}

export function propString(
  props: Record<string, unknown>,
  name: string,
): string {
  const raw = props[name];
  return typeof raw === "string" ? raw : "";
}

/** Replaces {tokens} with live figures. Unknown tokens are left alone rather
 *  than blanked — a typo should be visible, not silently swallowed. */
export function resolveTokens(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

export function propBool(
  props: Record<string, unknown>,
  name: string,
): boolean {
  return props[name] === true;
}
