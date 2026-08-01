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
  | { source: "offer"; slug: string };

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

export type Layer = ImageLayer | TextLayer | BadgeLayer | ButtonLayer | ShapeLayer;

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

/** The editable body of a banner: one composition per cell, keyed by cell id. */
export type BannerContent = {
  cells: Record<string, CellComposition>;
};

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
  } as React.CSSProperties;
}

/** Grid-level variables: the template's own dimensions and shape. */
export function gridVars(template: Pick<GridTemplateView, "columns" | "rows" | "aspect">) {
  return {
    "--bn-cols": template.columns,
    "--bn-rows": template.rows,
    "--bn-aspect": template.aspect ?? "auto",
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
