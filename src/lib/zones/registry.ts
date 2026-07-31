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
export const BADGE_PRESETS: ReadonlyArray<{ value: string; label: string; tone: BadgeTone }> = [
  { value: "ΝΕΟ", label: "ΝΕΟ", tone: "ink" },
  { value: "ΠΡΟΣΦΟΡΑ", label: "ΠΡΟΣΦΟΡΑ", tone: "red" },
  { value: "ΤΕΛΕΥΤΑΙΑ ΤΕΜΑΧΙΑ", label: "ΤΕΛΕΥΤΑΙΑ ΤΕΜΑΧΙΑ", tone: "amber" },
  { value: "ΔΩΡΕΑΝ ΜΕΤΑΦΟΡΙΚΑ", label: "ΔΩΡΕΑΝ ΜΕΤΑΦΟΡΙΚΑ", tone: "green" },
  { value: "ΕΠΑΓΓΕΛΜΑΤΙΚΗ ΣΕΙΡΑ", label: "ΕΠΑΓΓΕΛΜΑΤΙΚΗ ΣΕΙΡΑ", tone: "ink" },
  { value: "ΑΜΕΣΑ ΔΙΑΘΕΣΙΜΟ", label: "ΑΜΕΣΑ ΔΙΑΘΕΣΙΜΟ", tone: "green" },
] as const;

export type BadgeTone = "ink" | "red" | "amber" | "green";

export const BADGE_TONES: ReadonlyArray<{ value: BadgeTone; label: string; className: string }> = [
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
      { name: "eyebrow", label: "Μικρός τίτλος", kind: "text", localised: true, maxChars: 24 },
      { name: "title", label: "Τίτλος", kind: "text", localised: true, required: true, maxChars: 40 },
      { name: "body", label: "Κείμενο", kind: "text", localised: true, maxChars: 90 },
      {
        name: "image",
        label: "Εικόνα",
        kind: "image",
        help: "Ανεβάστε δική σας ή διαλέξτε φωτογραφία από προϊόν.",
      },
      { name: "href", label: "Σύνδεσμος", kind: "link", required: true, default: "/katalogos" },
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
    description: "Δείχνει μια κατηγορία με τη φωτογραφία και το πλήθος προϊόντων της.",
    preview: "Κατηγορία + πλήθος",
    fields: [
      { name: "category", label: "Κατηγορία", kind: "category", required: true },
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
      { name: "eyebrow", label: "Μικρός τίτλος", kind: "text", localised: true, maxChars: 24 },
      { name: "image", label: "Εικόνα (προαιρετική)", kind: "image", help: "Αφήστε κενό για την κύρια φωτογραφία του προϊόντος." },
    ],
  },
  {
    type: "rich-text",
    label: "Κείμενο",
    description: "Τίτλος και παράγραφος, χωρίς εικόνα προϊόντος.",
    preview: "Τίτλος + παράγραφος",
    fields: [
      { name: "title", label: "Τίτλος", kind: "text", localised: true, maxChars: 60 },
      { name: "body", label: "Κείμενο", kind: "long", localised: true, maxChars: 400 },
      { name: "cta", label: "Κουμπί", kind: "text", localised: true, maxChars: 24 },
      { name: "href", label: "Σύνδεσμος κουμπιού", kind: "link" },
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

export const ZONES: ReadonlyArray<ZoneDef> = [
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
    description: "Μία λωρίδα ανά widget, από άκρη σε άκρη. Δυνατό με βίντεο φόντο.",
    layout: "band",
    accepts: ALL,
    max: 3,
  },
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
    id: "product.below",
    page: "Σελίδα προϊόντος",
    label: "Κάτω από τα σχετικά προϊόντα",
    description: "Πλέγμα δύο στηλών στο τέλος της σελίδας.",
    layout: "grid",
    columns: 2,
    accepts: ALL,
    max: 4,
  },
  {
    id: "offers.top",
    page: "Προσφορές",
    label: "Κορυφή σελίδας",
    description: "Μία λωρίδα πλήρους πλάτους πάνω από τις προσφορές.",
    layout: "band",
    accepts: ALL,
    max: 1,
  },
] as const;

export const WIDGETS_BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

/** A widget's own fields followed by the background group every widget shares. */
export function fieldsFor(type: string): ReadonlyArray<WidgetField> {
  const def = WIDGETS_BY_TYPE.get(type);
  return def ? [...def.fields, ...BADGE_FIELDS, ...ANIMATION_FIELDS, ...BACKGROUND_FIELDS] : [];
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

export function propString(props: Record<string, unknown>, name: string): string {
  const raw = props[name];
  return typeof raw === "string" ? raw : "";
}

/** Replaces {tokens} with live figures. Unknown tokens are left alone rather
 *  than blanked — a typo should be visible, not silently swallowed. */
export function resolveTokens(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}

export function propBool(props: Record<string, unknown>, name: string): boolean {
  return props[name] === true;
}
