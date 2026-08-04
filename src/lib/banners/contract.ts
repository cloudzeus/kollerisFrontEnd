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
  { token: "{price}", label: "Τιμή", sources: ["product"] },
  { token: "{compare}", label: "Τιμή σύγκρισης", sources: ["product"] },
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
  weight: 400 | 500 | 600 | 700;
  /** Letter spacing, in hundredths of an em. */
  tracking: number;
  /** Line height, in hundredths. 120 = 1.2. */
  leading: number;
  color: ColorToken;
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
  style: Pick<TextStyle, "font" | "size" | "weight" | "tracking" | "uppercase">;
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
  style: Pick<TextStyle, "font" | "size" | "weight" | "tracking" | "uppercase" | "color">;
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
  const brand = newLayer("text") as TextLayer;
  brand.name = "Μάρκα";
  brand.text = { el: "{brand}" };
  brand.frame = { x: 6, y: 54, w: 50, h: 7 };
  brand.style = {
    ...DEFAULT_TEXT_STYLE,
    font: "mono",
    size: 15,
    weight: 500,
    tracking: 10,
    color: "red",
  };

  const title = newLayer("text") as TextLayer;
  title.name = "Τίτλος";
  title.text = { el: "{title}" };
  title.frame = { x: 6, y: 62, w: 62, h: 20 };
  title.style = { ...DEFAULT_TEXT_STYLE, color: "white", size: 42 };

  const price = newLayer("text") as TextLayer;
  price.name = "Τιμή";
  price.text = { el: "{price}" };
  price.frame = { x: 6, y: 84, w: 40, h: 10 };
  price.style = {
    ...DEFAULT_TEXT_STYLE,
    font: "mono",
    size: 26,
    weight: 600,
    tracking: 0,
    color: "white",
    uppercase: false,
  };

  return [brand, title, price];
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

/** Grid-level variables: the template's own dimensions and shape. */
export function gridVars(
  template: Pick<GridTemplateView, "columns" | "rows" | "aspect" | "cells">,
  maxHeight?: BannerHeight | null,
) {
  return {
    "--bn-cols": template.columns,
    "--bn-rows": template.rows,
    /* The single-row layout divides the width by this, so each cell keeps the
       share of the width its column span already gave it. */
    "--bn-span-total": spanTotal(template.cells),
    "--bn-aspect": template.aspect ?? "auto",
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
  } as React.CSSProperties;
}

/* ─────────────────────── Layer geometry ─────────────────────── */

export const clampFrame = (frame: Frame): Frame => ({
  x: Math.max(-20, Math.min(120, Math.round(frame.x * 10) / 10)),
  y: Math.max(-20, Math.min(120, Math.round(frame.y * 10) / 10)),
  w: Math.max(2, Math.min(140, Math.round(frame.w * 10) / 10)),
  h: Math.max(2, Math.min(140, Math.round(frame.h * 10) / 10)),
});

export const FONT_STACK: Record<FontToken, string> = {
  display: "var(--font-artegra)",
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
    if (layer.kind === "text") {
      base.lineHeight = layer.style.leading / 100;
      base.textAlign = layer.style.align;
      base.color = COLOR_VALUE[layer.style.color];
    }
  }

  return base;
}
