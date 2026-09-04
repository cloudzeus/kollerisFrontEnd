/**
 * The banner system's data contract.
 *
 * Three things with different lifetimes, deliberately three tables:
 *
 *   GridTemplate     a layout, drawn once, reused by many banners
 *   Banner           a template plus the composition in each cell — saved as
 *                    one thing, with its own draft and published versions
 *   BannerPlacement  that banner assigned to one zone on one page
 *
 * Collapsing the first two would mean editing one banner silently reshaped
 * every other banner using the same layout. Collapsing the last two would make
 * a banner belong to exactly one page, when the whole point is that a saved
 * composition can be placed wherever it fits.
 *
 * Client-safe: types and helpers only, no Prisma, no I/O.
 */

/* ────────────────────────────── Grid ────────────────────────────── */

/**
 * One cell of a template.
 *
 * Coordinates are GRID UNITS, never pixels: the same template has to work at
 * 400px in an aside and full-bleed in a band, and a pixel geometry only ever
 * describes the width it was drawn at.
 */
export type GridCell = {
  /** Stable id, used as the key of the composition map. Never renumbered. */
  id: string;
  /** What the editor calls it — "Κεντρικό hero", "Δεξιά επάνω". */
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * What happens to this cell on a narrow screen.
   *
   * A twelve-column layout has to become one column on a phone, and not every
   * region earns its place there — a decorative third tile below two others is
   * three screens of scrolling nobody asked for. Hiding is a layout decision,
   * so it lives on the template beside the geometry rather than on each banner
   * drawn over it.
   *
   * `order` is the stacking position when collapsed; without one, cells stack
   * in the order they were drawn.
   */
  mobile?: { hidden?: boolean; order?: number };
};

export type GridGeometry = {
  cells: GridCell[];
};

export type GridTemplateView = {
  id: string;
  name: string;
  columns: number;
  rows: number;
  aspect: string | null;
  cells: GridCell[];
};

/* ──────────────────────────── Binding ──────────────────────────── */

/**
 * Where a cell's live data comes from.
 *
 * Separate from how the cell LOOKS. A product binding supplies the title, the
 * price and the photograph; where those sit and how big they are is the
 * composition's business. Keeping the two apart is what lets a product tile be
 * laid out freely and still follow the catalogue.
 */
export type Binding =
  | { source: "none" }
  | { source: "product"; slug: string }
  | { source: "offer"; slug: string }
  /**
   * A set of products, in the order they were chosen.
   *
   * Its own source rather than a repeated product binding: the cell shows all
   * of them in rotation, so `{title}` has no single answer and offering it
   * would be a promise the renderer cannot keep. What a set lends is a ticker
   * and a count; the headline and the button are written by hand, about the
   * campaign rather than about any one item.
   */
  | { source: "products"; slugs: string[] };

/**
 * Text tokens a bound cell can print.
 *
 * Written into any text layer as `{title}`, `{price}` and so on, so live data
 * can sit anywhere in the composition rather than in the one slot a fixed
 * layout would have given it.
 */
export const TOKENS = [
  { token: "{title}", label: "Τίτλος", sources: ["product", "offer"] },
  { token: "{brand}", label: "Μάρκα", sources: ["product"] },
  { token: "{code}", label: "Κωδικός", sources: ["product"] },
  { token: "{price}", label: "Τιμή", sources: ["product", "offer"] },
  { token: "{compare}", label: "Τιμή σύγκρισης", sources: ["product", "offer"] },
  { token: "{desc}", label: "Σύντομη περιγραφή", sources: ["product"] },
  { token: "{badge}", label: "Badge προσφοράς", sources: ["offer"] },
  { token: "{ends}", label: "Λήγει σε…", sources: ["offer"] },
  { token: "{count}", label: "Πλήθος προϊόντων", sources: ["products"] },
] as const;

/* ──────────────────────────── Layers ──────────────────────────── */

/**
 * Where a layer sits inside its cell — percentages of the cell box.
 *
 * Percentages rather than pixels for the same reason the grid uses units: the
 * cell is 900px wide in a desktop band and 375px on a phone, and a composition
 * described in pixels only ever describes the one width it was dragged at.
 */
export type Frame = { x: number; y: number; w: number; h: number };

export type FontToken = "display" | "sans" | "mono";
export type ColorToken = "ink" | "white" | "red" | "muted" | "white-70";

export type TextStyle = {
  font: FontToken;
  /**
   * Size at a reference cell width of 1000px, rendered in container units so
   * it scales with the cell. 40 here is 40px in a 1000px-wide cell and 20px in
   * a 500px one — the composition keeps its proportions at every width.
   */
  size: number;
  /*
   * 800 και 900 προστέθηκαν όταν οι τίτλοι του καταστήματος πήγαν στο 900 του
   * design system: ένα banner που δεν μπορούσε να φτάσει πιο πάνω από 700
   * έγραφε τους τίτλους του πιο ελαφριά από κάθε άλλη επικεφαλίδα της σελίδας.
   */
  weight: 400 | 500 | 600 | 700 | 800 | 900;
  /** Letter spacing, in hundredths of an em. */
  tracking: number;
  /** Line height, in hundredths. 120 = 1.2. */
  leading: number;
  color: ColorToken;
  /*
   * Πλακίδιο πίσω από το κείμενο, προαιρετικό.
   * ───────────────────────────────────────────────────────────────────────────
   * Τα badge layers είχαν πάντα `tone` — φόντο και χρώμα μαζί. Τα text layers
   * όχι, και στην πράξη ένα «badge» φτιάχνεται συχνά ως text layer με το token
   * `{badge}` μέσα του, ώστε να ακολουθεί την καμπάνια. Αυτό έμενε χωρίς φόντο
   * και δεν υπήρχε τρόπος να αποκτήσει.
   */
  background?: ColorToken;
  /*
   * Ρόλος τυπογραφίας — κλειδωμένος στο design system.
   * ───────────────────────────────────────────────────────────────────────────
   * Όταν οριστεί, ΑΓΝΟΟΥΝΤΑΙ τα `font`, `size`, `weight`, `tracking`: τα
   * δίνει το σύστημα.
   *
   * Ο λόγος είναι μετρημένος. Το `size` σημαίνει «pixel σε κελί πλάτους
   * 1000px» και το κελί είναι ο container — οπότε μια σύνθεση φτιαγμένη σε
   * πλατύ κελί, όταν προστεθεί μια στήλη, συρρικνώνεται σιωπηλά: τίτλος
   * «μέγεθος 38» σε στήλη 287px αποδίδεται στα 10,9px. Κανείς δεν θα έγραφε
   * επίτηδες τίτλο 11 pixel· απλώς άλλαξε το πλέγμα και κανείς δεν το είπε.
   *
   * Οι ρόλοι λύνουν σε `clamp()`: ελάχιστο αναγνώσιμο, κλιμάκωση με το κελί,
   * ανώτατο που δεν ξεχειλώνει. Το ίδιο κείμενο διαβάζεται σε στήλη 287px και
   * σε λωρίδα 1151px χωρίς να διαλέξει κανείς νούμερο.
   */
  role?: TypeRole;
  /*
   * Ρύθμιση μεγέθους πάνω στον ρόλο, σε ποσοστό. 100 = όπως το ορίζει το
   * design system, 130 = ένα τρίτο μεγαλύτερο σε ΟΛΗ την κλίμακα.
   *
   * Ο ρόλος έδινε ένα και μόνο μέγεθος, που είναι σωστό για τη σελίδα και
   * στενό για ένα banner: ο ίδιος τίτλος θέλει άλλο βάρος μελανιού σε μια
   * λωρίδα πλήρους πλάτους και άλλο σε ένα κελί δίπλα σε τρία ακόμη. Αυτό
   * μετακινεί δάπεδο, κλιμάκωση και ταβάνι μαζί — δηλαδή αλλάζει το μέγεθος
   * χωρίς να σπάει η προστασία από τα 11-pixel γράμματα.
   */
  roleScale?: number;
  align: "left" | "center" | "right";
  /** Vertical placement inside the layer's own box. */
  valign: "start" | "center" | "end";
  uppercase: boolean;
};

export type AnimPreset =
  | "none"
  | "fade"
  | "rise"
  | "words"
  | "chars"
  | "mask"
  | "scale"
  | "slide";

export type Anim = {
  preset: AnimPreset;
  /** Milliseconds after the banner enters the viewport. */
  delay: number;
  duration: number;
};

type LayerBase = {
  id: string;
  name: string;
  frame: Frame;
  anim: Anim;
  /** Hidden layers stay in the file — the editor's undo for "try without it". */
  hidden?: boolean;
};

export type ImageLayer = LayerBase & {
  kind: "image";
  src: string;
  fit: "cover" | "contain";
  opacity: number;
};

export type TextLayer = LayerBase & {
  kind: "text";
  /** May contain `{token}`s when the cell is bound. */
  text: LocalisedText;
  style: TextStyle;
};

export type BadgeLayer = LayerBase & {
  kind: "badge";
  text: LocalisedText;
  tone: "ink" | "red" | "amber" | "green" | "white";
  style: Pick<TextStyle, "font" | "size" | "weight" | "tracking" | "uppercase" | "role" | "roleScale">;
};

export type ButtonLayer = LayerBase & {
  kind: "button";
  text: LocalisedText;
  /**
   * Where this button goes, when it should not go where the cell goes.
   *
   * Empty means it inherits the cell's destination, which is the common case.
   * A cell with two buttons pointing at two places needs its own links, and the
   * renderer stops wrapping the whole cell the moment one of them has an href —
   * an anchor inside an anchor is invalid markup that browsers resolve by
   * guessing.
   */
  href: string;
  variant: "underline" | "solid" | "outline";
  style: Pick<
    TextStyle,
    "font" | "size" | "weight" | "tracking" | "uppercase" | "color" | "role" | "roleScale"
  >;
};

/** A flat block of colour — scrims, side panels, anything the media needs
 *  behind text that the global overlay cannot express. */
export type ShapeLayer = LayerBase & {
  kind: "shape";
  color: ColorToken;
  opacity: number;
};

/**
 * A rotating view of the cell's product set.
 *
 * One box, one product at a time. The first is rendered server-side and every
 * other slide is in the markup behind it, so a failed hydration leaves a
 * perfectly good product tile rather than an empty rectangle — and a crawler
 * sees all ten.
 */
export type TickerLayer = LayerBase & {
  kind: "ticker";
  /** Milliseconds each product holds the frame. */
  interval: number;
  effect: "fade" | "slide";
  fit: "cover" | "contain";
  showName: boolean;
  showPrice: boolean;
};

export type Layer =
  | ImageLayer
  | TextLayer
  | BadgeLayer
  | ButtonLayer
  | ShapeLayer
  | TickerLayer;

export type LayerKind = Layer["kind"];

/* ──────────────────────── Composition ──────────────────────── */

/** Per-locale text. Greek is the fallback for the others. */
export type LocalisedText = Partial<Record<"el" | "en" | "it", string>>;

/**
 * The background, which always covers the whole cell.
 *
 * Separate from the layers because it is the one thing that is never
 * positioned: it fills the cell edge to edge, and everything else sits on top
 * of it. `focus` moves the crop rather than the element — a photograph whose
 * subject is off-centre needs the crop moved, not the picture.
 */
export type Background = {
  kind: "none" | "color" | "image" | "video";
  color: ColorToken;
  image: string;
  video: string;
  poster: string;
  /** 0–100 each, the CSS object-position of the crop. */
  focus: { x: number; y: number };
  /** Zoom the crop past cover, for when the subject is small in frame. */
  scale: number;
  overlay: "none" | "light" | "medium" | "strong";
  /** Slow drift on the background while the banner is on screen. */
  kenBurns: boolean;
  /**
   * Whether the background fills the cell or fits inside it.
   *
   * `cover` fills and crops — right for a photograph, where the edges are
   * scenery. `contain` shows the whole frame and letterboxes the rest, which
   * is the only correct answer for a video that was composed: a product shot
   * or an animated logo loses its subject the moment the cell's ratio differs
   * from the footage, and it always differs. Absent means `cover`, so every
   * banner already saved keeps exactly the look it has.
   */
  fit?: "cover" | "contain";
  /**
   * Η φυσική αναλογία του αρχείου, μετρημένη από τον συντάκτη.
   *
   * Ο διακομιστής δεν μπορεί να τη μαντέψει: για τα βίντεο η βιβλιοθήκη δεν
   * κρατά διαστάσεις, και το να τις διαβάσει θα σήμαινε κατέβασμα metadata σε
   * κάθε απόδοση σελίδας. Ο επεξεργαστής όμως έχει ήδη το αρχείο φορτωμένο,
   * οπότε τη μετράει μία φορά και τη γράφει εδώ. Από εκεί και πέρα το ύψος
   * βγαίνει με καθαρό CSS και προσαρμόζεται μόνο του σε κάθε πλάτος οθόνης —
   * κανένα JavaScript στο κατάστημα, καμία μέτρηση, κανένα αναπήδημα.
   */
  mediaAspect?: number;
};

export type CellComposition = {
  binding: Binding;
  background: Background;
  layers: Layer[];
  /** Derived for product and offer bindings; typed only when unbound. */
  href: string;
};

/**
 * How tall a banner is allowed to get.
 *
 * `px` is an absolute ceiling; `vh` is a share of the window, which is what
 * "no more than half the screen" means and what keeps a hero from swallowing
 * the fold on a laptop while still filling a large monitor.
 */
export type BannerHeight = { value: number; unit: "px" | "vh" };

/**
 * What the grid does once the screen is wide.
 *
 * `grid` keeps the template's arrangement at every width. `row` lays every cell
 * out in a single line above 88rem, each as wide as the columns it spans — an
 * 8/4/4 template becomes 50/25/25.
 *
 * It exists because a capped banner on a wide monitor is very wide and very
 * short, and a cell stacked two-high in that space gets half of an already
 * short height: 225px for a title, a price and a button. Side by side they each
 * get the full height instead.
 */
export type WideLayout = "auto" | "grid" | "row";

/**
 * One arrangement of the cells.
 *
 * No `stack` here on purpose. Stacking is what happens below 704px, where the
 * CSS collapses the grid to one column — but it is never the better answer
 * ABOVE that width, because a cell's layers are absolutely positioned and
 * contribute no height. A stacked cell is exactly its 13rem floor, which is
 * shorter than the same cell in the template's own arrangement. Choosing it to
 * relieve a cramped cell made the cramping worse: 208px instead of 386px, and
 * text overflow up from 1px to 87px.
 */
export type BandLayout = "grid" | "row";

/**
 * The width bands a banner is allowed to rearrange at.
 *
 * Container widths, not viewport widths — the preview modal renders a banner at
 * 390 / 768 / 1440 inside a desktop window, and a media query would show it the
 * desktop layout at every setting.
 */
export const BANDS = [
  { key: "tablet", from: 704 },
  { key: "desktop", from: 1024 },
  { key: "wide", from: 1408 },
  { key: "ultra", from: 1920 },
] as const;

export type BandKey = (typeof BANDS)[number]["key"];

/** A stacked cell needs about this to hold a heading, a line and a button. */
const CRAMPED_CELL = 240;
/** Below this a cell is a column of wrapped words, whatever its height. */
const NARROW_CELL = 220;

const aspectOf = (aspect: string | null): number | null => {
  if (!aspect || aspect === "auto") return null;
  const [w, h] = aspect.split("/").map((n) => Number(n.trim()));
  return w > 0 && h > 0 ? w / h : null;
};

/**
 * The best arrangement for one width, worked out rather than guessed.
 *
 * Everything it needs is known before anything renders: the template's shape,
 * its aspect ratio and the banner's height ceiling. So it costs no JavaScript,
 * cannot flicker, and gives the same answer on the server and in the preview.
 *
 * It asks two questions in order. Is every cell tall enough as drawn? Then keep
 * the template — the operator's arrangement wins whenever it works. If not,
 * would one row give every cell the full height without making any of them too
 * narrow to read? Then one row. Otherwise stack them, which is the only
 * arrangement that can always give a cell the room it needs.
 */
export function resolveBand(
  cells: GridCell[],
  rows: number,
  aspect: string | null,
  maxHeight: BannerHeight | null | undefined,
  width: number,
): BandLayout {
  if (cells.length < 2) return "grid";

  const ratio = aspectOf(aspect);
  const capPx = !maxHeight?.value
    ? Infinity
    : maxHeight.unit === "vh"
      // A share of a window this side cannot measure; a laptop is the case
      // worth being right about.
      ? (maxHeight.value / 100) * 900
      : maxHeight.value;
  const height = Math.min(ratio ? width / ratio : Infinity, capPx);
  // No ratio and no ceiling: the banner is as tall as its rows make it, and
  // nothing is cramped.
  if (!Number.isFinite(height)) return "grid";

  const shortestAsDrawn = Math.min(...cells.map((c) => (height * c.h) / rows));
  if (shortestAsDrawn >= CRAMPED_CELL) return "grid";

  const total = spanTotal(cells);
  const narrowestInRow = Math.min(...cells.map((c) => (width * c.w) / total));
  if (height >= CRAMPED_CELL && narrowestInRow >= NARROW_CELL) return "row";

  // Neither is comfortable, so keep the operator's arrangement — it gives the
  // largest cell the most height, and the alternative helps nothing.
  return "grid";
}

/** The arrangement for every band, honouring an explicit choice over its own
 *  arithmetic. */
export function resolveBands(
  cells: GridCell[],
  rows: number,
  aspect: string | null,
  maxHeight: BannerHeight | null | undefined,
  choice: WideLayout | undefined,
): Record<BandKey, BandLayout> {
  const forced = choice === "grid" || choice === "row" ? choice : null;
  return Object.fromEntries(
    BANDS.map((b) => [b.key, forced ?? resolveBand(cells, rows, aspect, maxHeight, b.from)]),
  ) as Record<BandKey, BandLayout>;
}

/** The editable body of a banner: one composition per cell, keyed by cell id. */
export type BannerContent = {
  cells: Record<string, CellComposition>;
  /**
   * Ceiling on the rendered height. Lives on the banner rather than the grid
   * template because the template is a reusable shape — the same three-cell
   * hero is 520px in one zone and 40vh in another — and because changing the
   * height is an edit, so it belongs in the draft and gets published with
   * everything else.
   */
  maxHeight?: BannerHeight | null;
  /**
   * Floor on the rendered height — the other half of a real height control.
   *
   * A ceiling alone can only ever shorten. A grid template with no aspect
   * ratio has no height of its own, so its banner sat on the stylesheet's
   * floor and the ceiling did nothing at all; there was no number anywhere
   * that made a banner taller. Setting this equal to `maxHeight` pins an
   * exact height, which is what "make it 400 tall" means.
   */
  minHeight?: BannerHeight | null;
  /**
   * Η αναλογία του banner, βγαλμένη από το υλικό ενός κελιού.
   *
   * Σταθερό ύψος σε εικονοστοιχεία λύνει μία οθόνη και χαλάει τις υπόλοιπες:
   * μια λωρίδα πλήρους πλάτους είναι 1440 στο γραφείο και 390 στο κινητό, και
   * ένα νούμερο δεν μπορεί να είναι σωστό και στα δύο. Η αναλογία είναι
   * ποσοστιαία εξ ορισμού — το ύψος ακολουθεί το πλάτος, όποιο κι αν είναι —
   * οπότε το υλικό διατηρεί το σχήμα του παντού χωρίς περικοπή.
   */
  aspectFromMedia?: number | null;
  /** Arrangement above 88rem. Defaults to keeping the template's grid. */
  wideLayout?: WideLayout;
};

/** The CSS length a banner's ceiling amounts to, or none. */
export function maxHeightCss(height: BannerHeight | null | undefined): string {
  if (!height || !height.value) return NO_CEILING;
  const value = Math.round(height.value);
  if (height.unit === "vh") return `${Math.min(100, Math.max(10, value))}vh`;
  return `${Math.min(2000, Math.max(120, value))}px`;
}

/**
 * A length rather than `none`, so the grid's floor can be written as
 * `min(floor, ceiling)`. `min()` with the keyword `none` is invalid and would
 * throw the whole declaration away, taking the floor with it.
 */
const NO_CEILING = "9999px";

/* ────────────────────────── Banner ────────────────────────── */

export type BannerState = "empty" | "draft" | "published" | "modified";

export type BannerView = {
  id: string;
  name: string;
  template: GridTemplateView;
  draft: BannerContent | null;
  published: BannerContent | null;
  publishedAt: string | null;
  publishedBy: string | null;
  state: BannerState;
  /** Zones this banner is assigned to. Publishing affects all of them. */
  placements: string[];
};

/**
 * What the editor badge says.
 *
 * "modified" is the one worth distinguishing: a placement that is live AND has
 * unpublished edits is the state where somebody is most likely to assume their
 * change is already visible.
 */
export function bannerState(
  draft: BannerContent | null,
  published: BannerContent | null,
): BannerState {
  if (!published && !draft) return "empty";
  if (!published) return "draft";
  if (!draft) return "published";
  return sameContent(draft, published) ? "published" : "modified";
}

/**
 * Deep equality with sorted keys.
 *
 * Both sides are stored in a `jsonb` column, which does not preserve key order,
 * and the editor compares an object it built in the browser against one that
 * came back through the database. A plain `JSON.stringify` comparison reports
 * every published banner as modified the moment the round trip reorders a key
 * — the badge saying "unpublished changes" about a banner with none is worse
 * than no badge at all.
 */
export function sameContent(a: BannerContent, b: BannerContent): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    // An absent key and a key set to undefined are the same content.
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

/* ────────────────────────── Offers ────────────────────────── */

/**
 * A campaign, authored here rather than read from the ERP.
 *
 * Lives in `contract.ts` because the offers screen and the cell editor are both
 * client components, and the module that reads them is `server-only`.
 */
export type OfferView = {
  id: string;
  slug: string;
  /** Greek. The picker is a Greek-only admin; the storefront picks by locale. */
  title: string;
  badge: string | null;
  href: string;
  image: string | null;
  imageWide: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
};

/**
 * What an offer is doing right now.
 *
 * `isActive` on its own lies as soon as a date passes: a campaign switched on
 * in March and ended in April is still "active" in the column and invisible on
 * the site. The dates decide, the switch only vetoes.
 */
export function offerStatus(
  offer: Pick<OfferView, "isActive" | "startsAt" | "endsAt">,
  now: Date = new Date(),
): "live" | "scheduled" | "expired" | "off" {
  if (!offer.isActive) return "off";
  if (offer.endsAt && offer.endsAt <= now) return "expired";
  if (offer.startsAt && offer.startsAt > now) return "scheduled";
  return "live";
}

/* ───────────────────────── Defaults ───────────────────────── */

export const DEFAULT_ANIM: Anim = { preset: "none", delay: 0, duration: 700 };

export const DEFAULT_BACKGROUND: Background = {
  fit: "cover",
  kind: "none",
  color: "white",
  image: "",
  video: "",
  poster: "",
  focus: { x: 50, y: 50 },
  scale: 100,
  overlay: "medium",
  kenBurns: false,
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  font: "display",
  size: 40,
  weight: 600,
  tracking: -1,
  leading: 115,
  color: "ink",
  align: "left",
  valign: "start",
  uppercase: true,
};

export function emptyComposition(): CellComposition {
  return {
    binding: { source: "none" },
    background: { ...DEFAULT_BACKGROUND },
    layers: [],
    href: "/katalogos",
  };
}

const uid = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

/**
 * A new layer of the given kind, sized so it lands somewhere sensible.
 *
 * Dropping a layer at 0,0 with no size means the first thing anybody does is
 * fight it into view; these are placed where that kind of thing usually goes
 * and are meant to be dragged from there.
 */
export function newLayer(kind: LayerKind): Layer {
  const anim = { ...DEFAULT_ANIM };
  switch (kind) {
    case "text":
      return {
        id: uid(),
        name: "Κείμενο",
        kind: "text",
        frame: { x: 6, y: 62, w: 60, h: 22 },
        anim,
        text: {},
        style: { ...DEFAULT_TEXT_STYLE },
      };
    case "badge":
      return {
        id: uid(),
        name: "Badge",
        kind: "badge",
        frame: { x: 0, y: 0, w: 18, h: 10 },
        anim,
        text: { el: "ΝΕΟ" },
        tone: "red",
        style: { font: "mono", size: 15, weight: 500, tracking: 8, uppercase: true },
      };
    case "button":
      return {
        id: uid(),
        name: "Κουμπί",
        kind: "button",
        frame: { x: 6, y: 86, w: 34, h: 9 },
        anim,
        text: { el: "Δείτε περισσότερα" },
        href: "",
        variant: "underline",
        style: {
          font: "sans",
          size: 17,
          weight: 500,
          tracking: 4,
          uppercase: true,
          color: "ink",
        },
      };
    case "ticker":
      return {
        id: uid(),
        name: "Εναλλαγή προϊόντων",
        kind: "ticker",
        frame: { x: 52, y: 10, w: 42, h: 74 },
        anim,
        interval: 2500,
        effect: "fade",
        fit: "contain",
        showName: false,
        showPrice: true,
      };
    case "image":
      return {
        id: uid(),
        name: "Εικόνα",
        kind: "image",
        frame: { x: 55, y: 12, w: 40, h: 70 },
        anim,
        src: "",
        fit: "contain",
        opacity: 100,
      };
    case "shape":
    default:
      return {
        id: uid(),
        name: "Πλαίσιο",
        kind: "shape",
        frame: { x: 0, y: 55, w: 100, h: 45 },
        anim,
        color: "ink",
        opacity: 55,
      };
  }
}

/**
 * A text layer carrying one live value, dressed the way that value should be.
 *
 * A price is monospaced and heavy; a brand is small, tracked-out and red; a
 * description is body copy. Dropping a `{price}` that arrives styled as a
 * 42px display heading means the first thing anybody does is fix it, every
 * single time.
 *
 * `onDark` decides the colour rather than a fixed default: text dropped onto a
 * cell with a photograph or a video behind it needs to be white, and having to
 * notice that afterwards is the same wasted step.
 */
export function layerForToken(token: string, onDark: boolean): TextLayer {
  const layer = newLayer("text") as TextLayer;
  const light: ColorToken = onDark ? "white" : "ink";
  const quiet: ColorToken = onDark ? "white-70" : "muted";

  const styles: Record<string, { name: string; frame: Frame; style: Partial<TextStyle> }> = {
    "{title}": {
      name: "Τίτλος",
      frame: { x: 6, y: 62, w: 62, h: 20 },
      style: { size: 42, color: light },
    },
    "{brand}": {
      name: "Μάρκα",
      frame: { x: 6, y: 54, w: 40, h: 7 },
      style: { font: "mono", size: 15, weight: 500, tracking: 10, color: "red" },
    },
    "{code}": {
      name: "Κωδικός",
      frame: { x: 6, y: 46, w: 30, h: 7 },
      style: { font: "mono", size: 14, weight: 400, tracking: 6, color: quiet },
    },
    "{price}": {
      name: "Τιμή",
      frame: { x: 6, y: 84, w: 34, h: 10 },
      style: {
        font: "mono",
        size: 26,
        weight: 600,
        tracking: 0,
        color: light,
        uppercase: false,
      },
    },
    "{compare}": {
      name: "Πριν",
      frame: { x: 42, y: 85, w: 24, h: 8 },
      style: {
        font: "mono",
        size: 18,
        weight: 400,
        tracking: 0,
        color: quiet,
        uppercase: false,
      },
    },
    "{desc}": {
      name: "Περιγραφή",
      frame: { x: 6, y: 70, w: 52, h: 14 },
      style: {
        font: "sans",
        size: 16,
        weight: 400,
        tracking: 0,
        leading: 155,
        color: quiet,
        uppercase: false,
      },
    },
    "{badge}": {
      name: "Badge",
      frame: { x: 6, y: 10, w: 20, h: 8 },
      style: { font: "mono", size: 16, weight: 600, tracking: 6, color: "red" },
    },
    "{ends}": {
      name: "Λήγει",
      frame: { x: 6, y: 76, w: 40, h: 8 },
      style: {
        font: "mono",
        size: 16,
        weight: 500,
        tracking: 4,
        color: quiet,
        uppercase: false,
      },
    },
  };

  const preset = styles[token];
  layer.text = { el: token };
  if (preset) {
    layer.name = preset.name;
    layer.frame = preset.frame;
    layer.style = { ...DEFAULT_TEXT_STYLE, ...preset.style };
  } else {
    layer.style = { ...DEFAULT_TEXT_STYLE, color: light };
  }
  return layer;
}

/**
 * The composition a freshly bound product starts from.
 *
 * A bound cell that renders empty until somebody adds four layers by hand is a
 * worse starting point than one that already looks like a product tile. These
 * are ordinary layers — move them, restyle them, delete them.
 */
export function seedProductLayers(): Layer[] {
  /*
   * Ρόλοι, όχι νούμερα.
   *
   * Τα μεγέθη τα δίνει το design system και κλιμακώνονται με το κελί: ο ίδιος
   * τίτλος διαβάζεται σε στήλη 287px και σε λωρίδα 1151px. Πριν ήταν σταθεροί
   * αριθμοί, και μια στήλη παραπάνω τους έκανε 11 pixel χωρίς να το πει κανείς.
   *
   * Το σκούρο πλαίσιο στο κάτω μέρος δεν είναι διακόσμηση: το υλικό είναι
   * φωτογραφία προϊόντος, συχνά σε λευκό, και λευκό κείμενο πάνω σε λευκό δεν
   * διαβάζεται. Το πλαίσιο είναι το έδαφος του κειμένου.
   */
  const plate = newLayer("shape") as ShapeLayer;
  plate.name = "Πλαίσιο";
  plate.color = "ink";
  plate.opacity = 84;
  plate.frame = { x: 0, y: 52, w: 100, h: 48 };

  const brand = newLayer("text") as TextLayer;
  brand.name = "Μάρκα";
  brand.text = { el: "{brand}" };
  brand.frame = { x: 6, y: 57, w: 60, h: 7 };
  brand.style = { ...DEFAULT_TEXT_STYLE, role: "eyebrow", color: "red" };

  const title = newLayer("text") as TextLayer;
  title.name = "Τίτλος";
  title.text = { el: "{title}" };
  title.frame = { x: 6, y: 65, w: 80, h: 18 };
  title.style = { ...DEFAULT_TEXT_STYLE, role: "title", color: "white" };

  /* Η παλιά τιμή πάνω από την τρέχουσα, όπως τη δείχνει και η λίστα
     προϊόντων: μικρότερη, σβηστή, διαγραμμένη. Κενή όταν δεν υπάρχει
     έκπτωση — και τότε δεν αποδίδεται καθόλου. */
  const compare = newLayer("text") as TextLayer;
  compare.name = "Παλιά τιμή";
  compare.text = { el: "{compare}" };
  /*
   * Δίπλα στην τρέχουσα τιμή, όχι από πάνω της.
   * ─────────────────────────────────────────────────────────────────────────
   * Πάνω από την τιμή δεν υπάρχει χώρος: ο τίτλος σε τρεις γραμμές φτάνει ως
   * το 83% και η τιμή ξεκινά στο 86%, οπότε μια διαγραμμένη τιμή στο 80%
   * καθόταν ΚΑΤΩ από την τελευταία γραμμή του τίτλου και δεν φαινόταν
   * καθόλου. Στην ίδια γραμμή, ελαφρώς χαμηλότερα ώστε να συμπέσουν οι
   * βάσεις των δύο διαφορετικών μεγεθών.
   */
  compare.frame = { x: 42, y: 87.3, w: 26, h: 7 };
  compare.style = {
    ...DEFAULT_TEXT_STYLE,
    role: "compare",
    color: "white-70",
    uppercase: false,
  };

  const price = newLayer("text") as TextLayer;
  price.name = "Τιμή";
  price.text = { el: "{price}" };
  price.frame = { x: 6, y: 86, w: 50, h: 9 };
  price.style = { ...DEFAULT_TEXT_STYLE, role: "price", color: "white", uppercase: false };

  return [plate, brand, title, compare, price];
}

export function seedOfferLayers(): Layer[] {
  const badge = newLayer("badge") as BadgeLayer;
  badge.text = { el: "{badge}" };

  const title = newLayer("text") as TextLayer;
  title.name = "Τίτλος";
  title.text = { el: "{title}" };
  title.frame = { x: 8, y: 38, w: 80, h: 24 };
  title.style = { ...DEFAULT_TEXT_STYLE, size: 34 };

  return [badge, title];
}

/* ───────────────────────── Geometry ───────────────────────── */

/**
 * Checks a drawn grid before it can be saved.
 *
 * Overlaps and holes are both real outcomes of a freehand builder, and both
 * look like a rendering bug rather than a drawing mistake once the page is
 * live. Better to refuse the save and say which cells collide.
 */
export function validateGrid(
  cells: GridCell[],
  columns: number,
  rows: number,
): { ok: true } | { ok: false; error: string } {
  if (cells.length === 0) return { ok: false, error: "Το πλέγμα δεν έχει κελιά." };

  const seen = new Set<string>();
  for (const c of cells) {
    if (seen.has(c.id)) return { ok: false, error: `Διπλό αναγνωριστικό κελιού: ${c.id}` };
    seen.add(c.id);
    if (c.w < 1 || c.h < 1) return { ok: false, error: `Το «${c.name}» έχει μηδενικό μέγεθος.` };
    if (c.x < 0 || c.y < 0 || c.x + c.w > columns || c.y + c.h > rows) {
      return { ok: false, error: `Το «${c.name}» βγαίνει εκτός πλέγματος.` };
    }
  }

  const grid: (string | null)[][] = Array.from({ length: rows }, () => Array(columns).fill(null));
  for (const c of cells) {
    for (let y = c.y; y < c.y + c.h; y++) {
      for (let x = c.x; x < c.x + c.w; x++) {
        if (grid[y][x]) {
          const other = cells.find((o) => o.id === grid[y][x]);
          return { ok: false, error: `Το «${c.name}» επικαλύπτει το «${other?.name}».` };
        }
        grid[y][x] = c.id;
      }
    }
  }

  const holes = grid.flat().filter((v) => v === null).length;
  if (holes > 0) {
    return { ok: false, error: `Το πλέγμα έχει ${holes} κενά τετράγωνα.` };
  }

  return { ok: true };
}

/** CSS grid placement for one cell. Used by the builder, preview and storefront
 *  alike, so the three can never drift into three different geometries. */
export function cellStyle(cell: GridCell): React.CSSProperties {
  return {
    gridColumn: `${cell.x + 1} / span ${cell.w}`,
    gridRow: `${cell.y + 1} / span ${cell.h}`,
  };
}

/** How many columns a template's cells span in total — the denominator the
 *  single-row layout divides the width by. */
export const spanTotal = (cells: GridCell[]) => cells.reduce((n, c) => n + c.w, 0);

/**
 * The same placement, as custom properties.
 *
 * The rendered banner collapses to one column on a narrow container, which a
 * style attribute cannot express — inline styles have no breakpoints. The
 * variables are read inside a container query in `globals.css`, and ignored
 * below it, so the collapse needs no second geometry.
 */
export function cellVars(cell: GridCell): React.CSSProperties {
  return {
    "--bn-col": `${cell.x + 1} / span ${cell.w}`,
    "--bn-row": `${cell.y + 1} / span ${cell.h}`,
    /* Its share of the width when the cells are laid out in a single row. */
    "--bn-w": cell.w,
  } as React.CSSProperties;
}

/**
 * Η αναλογία που πρέπει να έχει ΟΛΟ το banner ώστε ένα κελί να δείχνει το
 * υλικό του ακέραιο.
 *
 * Αντιστροφή του `cellAspect`: το κελί παίρνει το `w/h` μερίδιό του από τη
 * γεωμετρία του πλέγματος, οπότε για να καταλήξει σε δεδομένη αναλογία, το
 * banner πρέπει να ξεκινήσει από αυτήν εδώ. Για κελί πλήρους πλάτους και
 * ύψους το αποτέλεσμα είναι η ίδια η αναλογία του υλικού.
 */
export function bannerAspectForCell(
  template: Pick<GridTemplateView, "columns" | "rows">,
  cell: Pick<GridCell, "w" | "h">,
  mediaAspect: number,
): number {
  return (mediaAspect * (cell.h / cell.w) * template.columns) / template.rows;
}

/** Grid-level variables: the template's own dimensions and shape. */
export function gridVars(
  template: Pick<GridTemplateView, "columns" | "rows" | "aspect" | "cells">,
  maxHeight?: BannerHeight | null,
  minHeight?: BannerHeight | null,
  aspectFromMedia?: number | null,
) {
  return {
    "--bn-cols": template.columns,
    "--bn-rows": template.rows,
    /* The single-row layout divides the width by this, so each cell keeps the
       share of the width its column span already gave it. */
    "--bn-span-total": spanTotal(template.cells),
    /* Η αναλογία από το υλικό υπερισχύει εκείνης του προτύπου: το πρότυπο
       είναι επαναχρησιμοποιήσιμο σχήμα, το υλικό είναι αυτό που πρέπει να
       χωρέσει ακέραιο σε ΑΥΤΟ το banner. */
    "--bn-aspect": aspectFromMedia || (template.aspect ?? "auto"),
    /*
     * `aspect-ratio` derives height from width, so a 21/9 hero on a 2560px
     * screen is 1100px tall and pushes everything below it off the fold. This
     * caps it; `none` is the CSS default, so a template without one behaves
     * exactly as before.
     */
    /*
     * `aspect-ratio` derives height from width, so a 21/9 hero on a 2560px
     * screen is 1100px tall and the catalogue starts below the fold. This is
     * the banner's own ceiling on that.
     */
    "--bn-max-h": maxHeightCss(maxHeight),
    /* Unset means "no request", and the stylesheet's own floor applies. */
    "--bn-min-h": minHeight?.value ? maxHeightCss(minHeight) : undefined,
  } as React.CSSProperties;
}

/* ─────────────────────── Layer geometry ─────────────────────── */

export const clampFrame = (frame: Frame): Frame => ({
  x: Math.max(-20, Math.min(120, Math.round(frame.x * 10) / 10)),
  y: Math.max(-20, Math.min(120, Math.round(frame.y * 10) / 10)),
  w: Math.max(2, Math.min(140, Math.round(frame.w * 10) / 10)),
  h: Math.max(2, Math.min(140, Math.round(frame.h * 10) / 10)),
});

/**
 * Οι τέσσερις ρόλοι τυπογραφίας ενός banner, από το Kolleris Design System.
 *
 * Ίδιοι με τη σελίδα: eyebrow σε mono κόκκινο, τίτλος display 900 με tracking
 * −0,03em, σώμα σε Inter, αριθμοί σε JetBrains Mono.
 */
export type TypeRole = "eyebrow" | "title" | "body" | "price" | "compare";

export const TYPE_ROLE: Record<
  TypeRole,
  {
    label: string;
    font: FontToken;
    /**
     * Το μέγεθος ως τριάδα: [δάπεδο σε px, κλιμάκωση σε cqw, ταβάνι σε px].
     *
     * Δεν γράφεται ως έτοιμο `clamp()` γιατί πολλαπλασιάζεται με το
     * `roleScale` του layer πριν αποδοθεί — αλλιώς η ρύθμιση μεγέθους θα
     * έπρεπε να ξαναγράφει τη συμβολοσειρά με regex.
     *
     * Το ταβάνι είναι το μέγεθος που έχει η ΙΔΙΑ βαθμίδα στη σελίδα: 46 για
     * τίτλο (t-h1: 48), 21 για τιμή (t-card-price: 21), 11,5 για παλιά τιμή
     * (t-card-was: 11,5 — εδώ 19 γιατί το banner δεν έχει τη στήλη της κάρτας).
     */
    size: [min: number, cqw: number, max: number];
    css: React.CSSProperties;
  }
> = {
  /* t-eyebrow: mono 500, tracking 0,14em, line-height 1. */
  eyebrow: {
    label: "Eyebrow",
    font: "mono",
    size: [9, 3.4, 13],
    css: {
      fontWeight: 500,
      letterSpacing: "0.14em",
      lineHeight: 1.2,
      textTransform: "uppercase",
    },
  },
  /* t-h1 / t-h2: display 900, tracking −0,03em, wdth 125%, line-height 1,02. */
  title: {
    label: "Τίτλος",
    font: "display",
    size: [17, 9.5, 46],
    css: {
      fontWeight: 900,
      letterSpacing: "-0.03em",
      lineHeight: 1.02,
      fontStretch: "125%",
      textTransform: "uppercase",
    },
  },
  /* t-body: sans 400, line-height 1,68. */
  body: {
    label: "Κείμενο",
    font: "sans",
    size: [11, 4.2, 17],
    css: {
      fontWeight: 400,
      letterSpacing: "0",
      lineHeight: 1.68,
    },
  },
  /* t-card-price: mono 600, tracking −0,01em, line-height 1,1. */
  price: {
    label: "Τιμή",
    font: "mono",
    size: [15, 6.4, 30],
    css: {
      fontWeight: 600,
      letterSpacing: "-0.01em",
      lineHeight: 1.1,
    },
  },
  /*
   * Η προηγούμενη τιμή — διαγραμμένη. Το κατάστημα τη γράφει με `t-card-was`:
   * mono 400, ένα σκαλί κάτω από την τρέχουσα.
   * ───────────────────────────────────────────────────────────────────────────
   * Ρόλος και όχι διακόπτης «διαγραφή»: η διαγραμμένη τιμή δεν είναι εφέ, είναι
   * νόημα. Έρχεται πάντα μικρότερη και σβηστή δίπλα στην τρέχουσα, ποτέ σε
   * λευκό δίπλα σε λευκό — αλλιώς διαβάζονται ως δύο τιμές και ο πελάτης δεν
   * ξέρει ποια πληρώνει.
   *
   * Το `{compare}` λύνει σε κενό όταν δεν υπάρχει έκπτωση, και ένα layer χωρίς
   * κείμενο δεν αποδίδεται καθόλου — οπότε δεν μένει σκουπίδι σε προϊόν που
   * δεν είναι σε προσφορά.
   */
  compare: {
    label: "Παλιά τιμή",
    font: "mono",
    size: [11, 4.2, 19],
    css: {
      fontWeight: 400,
      letterSpacing: "0",
      lineHeight: 1.1,
      textDecoration: "line-through",
      textDecorationThickness: "0.08em",
    },
  },
};

/**
 * Το μέγεθος ενός ρόλου, ρυθμισμένο.
 *
 * Ο ρόλος κλειδώνει τη ΣΧΕΣΗ — δάπεδο, κλιμάκωση, ταβάνι — και το `roleScale`
 * μετακινεί και τα τρία μαζί. Έτσι ένας τίτλος στο 130% παραμένει τίτλος: δεν
 * ξεχειλώνει στα στενά κελιά ούτε παγώνει στα πλατιά, απλώς κάθεται ψηλότερα
 * σε ολόκληρη την κλίμακα. Ένα σκέτο νούμερο pixel θα ξανάφερνε ακριβώς το
 * πρόβλημα που έλυσαν οι ρόλοι.
 */
export function roleFontSize(role: TypeRole, scale?: number): string {
  const [min, cqw, max] = TYPE_ROLE[role].size;
  const k = Math.max(50, Math.min(220, scale ?? 100)) / 100;
  const r = (n: number) => Math.round(n * k * 10) / 10;
  return `clamp(${r(min)}px, ${r(cqw)}cqw, ${r(max)}px)`;
}

export const FONT_STACK: Record<FontToken, string> = {
  display: "var(--font-display)",
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
};

export const COLOR_VALUE: Record<ColorToken, string> = {
  ink: "var(--color-k-ink)",
  white: "#ffffff",
  red: "var(--color-k-red)",
  muted: "var(--color-k-text-3)",
  "white-70": "rgba(255,255,255,.72)",
};

/**
 * Where a layer sits, and how big its type is.
 *
 * Font size is emitted in container units against the cell, so a composition
 * keeps its proportions at every width the cell is rendered at, with a floor in
 * px so a phone never gets three-pixel type.
 */
export function layerStyle(layer: Layer): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    left: `${layer.frame.x}%`,
    top: `${layer.frame.y}%`,
    width: `${layer.frame.w}%`,
    height: `${layer.frame.h}%`,
  };

  if (layer.kind === "text" || layer.kind === "badge" || layer.kind === "button") {
    const style = layer.style;
    const role = style.role ? TYPE_ROLE[style.role] : null;
    if (role) {
      /* Ο ρόλος δίνει τα πάντα — οικογένεια, μέγεθος, βάρος, tracking. Τα
         αριθμητικά πεδία της σύνθεσης αγνοούνται όσο είναι ενεργός. */
      Object.assign(base, role.css, {
        fontFamily: FONT_STACK[role.font],
        fontSize: roleFontSize(style.role!, style.roleScale),
      });
      if (layer.kind === "text") {
        base.textAlign = layer.style.align;
        base.color = COLOR_VALUE[layer.style.color];
        if (layer.style.background) {
          base.backgroundColor = COLOR_VALUE[layer.style.background];
          base.padding = "0.9cqw 2.2cqw";
          base.width = "fit-content";
        }
      }
      return base;
    }
    base.fontFamily = FONT_STACK[style.font];
    /*
     * Sized by the cell's width.
     *
     * Note what this cannot see: the cell's HEIGHT. `cqw` resolves against
     * `.banner-shell`, the only container in the tree, so type keeps a
     * composition's proportions as the banner gets wider and knows nothing
     * about it getting shorter. A layer whose box is a percentage of a short
     * cell will overflow, which is why the single-row layout above matters —
     * it fixes the cause rather than shrinking the symptom.
     *
     * Capping this by the box height needs `cqh`, which needs a size container
     * on the cell, which would also change what `cqw` resolves to — from the
     * banner's width to the cell's — and resize the type in every composition
     * already built. That is a deliberate change, not a bug fix.
     */
    base.fontSize = `max(10px, ${style.size / 10}cqw)`;
    base.fontWeight = style.weight;
    base.letterSpacing = `${style.tracking / 100}em`;
    /*
     * Το extended πλάτος των τίτλων.
     * ───────────────────────────────────────────────────────────────────────
     * Η display γραμματοσειρά είναι μεταβλητή (Roboto Flex) και το design
     * system τη ζητά σε wdth 125%. Στο κατάστημα αυτό το δίνουν οι κλάσεις
     * `t-h1` / `t-display`· εδώ τα στυλ γράφονται inline, οπότε χωρίς αυτή τη
     * γραμμή ο τίτλος ενός banner αποδιδόταν σε κανονικό πλάτος — ίδια
     * γραμματοσειρά με τις επικεφαλίδες της σελίδας, ορατά διαφορετικό σχήμα.
     */
    if (style.font === "display") base.fontStretch = "125%";
    if (layer.kind === "text") {
      base.lineHeight = layer.style.leading / 100;
      base.textAlign = layer.style.align;
      base.color = COLOR_VALUE[layer.style.color];
      if (layer.style.background) {
        base.backgroundColor = COLOR_VALUE[layer.style.background];
        /* Σε μονάδες του καμβά, όπως και η τυπογραφία: ένα πλακίδιο με padding
           σε pixel θα ήταν χοντρό στο κινητό και τριχούλα στα 2560. */
        base.padding = "0.9cqw 2.2cqw";
        base.width = "fit-content";
      }
    }
  }

  return base;
}
