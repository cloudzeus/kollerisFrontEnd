/**
 * The banner system's data contract.
 *
 * Three things with different lifetimes, deliberately three tables:
 *
 *   GridTemplate     a layout, drawn once, reused by many banners
 *   Banner           a template plus the widget in each cell — saved as one
 *                    thing, with its own draft and published versions
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
  /** Stable id, used as the key of the widget map. Never renumbered. */
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

/* ─────────────────────────── Widgets ─────────────────────────── */

/**
 * Where a widget's content comes from.
 *
 * The discriminant. A product widget derives its title, price and link from the
 * catalogue and goes stale on its own if the product changes; a custom widget
 * is typed and stays exactly as typed. Storing them in one shape with optional
 * fields everywhere would lose that distinction at exactly the moment it
 * matters — when somebody asks why the price on the banner is wrong.
 */
export type WidgetSource = "product" | "offer" | "custom";

/** Which product attributes to render. Off by default except the title. */
export type ProductFieldToggles = {
  title: boolean;
  shortDescription: boolean;
  price: boolean;
  /** Only rendered when the product actually has a list price above the net. */
  comparePrice: boolean;
  code: boolean;
  brand: boolean;
};

export type ProductWidget = {
  source: "product";
  /** Product slug. The link is derived from it — never typed. */
  slug: string;
  /** Which of the product's images to use. Empty means its main image. */
  imageUrl: string;
  fields: ProductFieldToggles;
};

export type OfferWidget = {
  source: "offer";
  /** Offer slug. Title, badge and link come from the offer record. */
  slug: string;
  /** Offers carry two crops; this picks which one this cell wants. */
  image: "image" | "imageWide";
  /** Show a live countdown when the offer has an end date. */
  countdown: boolean;
};

/** Per-locale text. Greek is the fallback for the others. */
export type LocalisedText = Partial<Record<"el" | "en" | "it", string>>;

export type CustomWidget = {
  source: "custom";
  heading: LocalisedText;
  subheading: LocalisedText;
  body: LocalisedText;
  cta: LocalisedText;
  /** Manual destination. The only source type where the link is typed. */
  href: string;
  media: {
    kind: "none" | "image" | "video";
    image: string;
    video: string;
    /** First frame, and the fallback wherever autoplay is refused. */
    poster: string;
  };
};

/** Presentation shared by all three sources. */
export type WidgetChrome = {
  badge: string;
  badgeTone: "ink" | "red" | "amber" | "green";
  overlay: "none" | "light" | "medium" | "strong";
  animation: "none" | "fade-up" | "slide-in" | "reveal" | "zoom";
  animationDelay: 0 | 100 | 200 | 400;
  /** White text over the media, rather than ink on white. */
  dark: boolean;
};

export type CellWidget = (ProductWidget | OfferWidget | CustomWidget) & {
  chrome: WidgetChrome;
};

/** The editable body of a banner: one widget per cell, keyed by cell id. */
export type BannerContent = {
  widgets: Record<string, CellWidget>;
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
  return JSON.stringify(draft) === JSON.stringify(published) ? "published" : "modified";
}

/* ────────────────────────── Offers ────────────────────────── */

/**
 * A campaign, authored here rather than read from the ERP.
 *
 * Lives in `contract.ts` because the offers screen and the widget picker are
 * both client components, and the module that reads them is `server-only`.
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

export const DEFAULT_CHROME: WidgetChrome = {
  badge: "",
  badgeTone: "red",
  overlay: "medium",
  animation: "none",
  animationDelay: 0,
  dark: false,
};

export function emptyWidget(source: WidgetSource): CellWidget {
  const chrome = { ...DEFAULT_CHROME };
  if (source === "product") {
    return {
      source: "product",
      slug: "",
      imageUrl: "",
      // Title only. Every field on by default produces a tile nobody can read,
      // and the first thing an editor does is turn most of them off.
      fields: {
        title: true,
        shortDescription: false,
        price: false,
        comparePrice: false,
        code: false,
        brand: false,
      },
      chrome,
    };
  }
  if (source === "offer") {
    return { source: "offer", slug: "", image: "image", countdown: false, chrome };
  }
  return {
    source: "custom",
    heading: {},
    subheading: {},
    body: {},
    cta: {},
    href: "/katalogos",
    media: { kind: "none", image: "", video: "", poster: "" },
    chrome,
  };
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
