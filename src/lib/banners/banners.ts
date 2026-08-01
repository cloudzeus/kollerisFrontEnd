import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  bannerState,
  validateGrid,
  type BannerContent,
  type BannerView,
  type GridCell,
  type GridTemplateView,
} from "@/lib/banners/contract";

/**
 * Reading and writing banners.
 *
 * Discriminated results rather than exceptions, like the zone layer: every one
 * of these can fail for a reason an operator needs to read, and a thrown error
 * loses the reason on the way to the screen.
 */

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

const ok = <T>(data?: T) => ({ ok: true as const, data: data as T });
const fail = (error: string) => ({ ok: false as const, error });

/* ───────────────────────── Templates ───────────────────────── */

function toTemplateView(row: {
  id: string;
  name: string;
  columns: number;
  rows: number;
  aspect: string | null;
  cells: unknown;
}): GridTemplateView {
  const geometry = (row.cells ?? {}) as { cells?: GridCell[] };
  return {
    id: row.id,
    name: row.name,
    columns: row.columns,
    rows: row.rows,
    aspect: row.aspect,
    cells: geometry.cells ?? [],
  };
}

export async function listTemplates(): Promise<GridTemplateView[]> {
  const rows = await prisma.gridTemplate.findMany({ orderBy: { updatedAt: "desc" } });
  return rows.map(toTemplateView);
}

export async function getTemplate(id: string): Promise<GridTemplateView | null> {
  const row = await prisma.gridTemplate.findUnique({ where: { id } });
  return row ? toTemplateView(row) : null;
}

/**
 * Create or update a template.
 *
 * Geometry is validated before it is written, and the validator's message is
 * returned verbatim — it already names the offending cells, and rewording it
 * here would only make it vaguer.
 */
export async function saveTemplate(
  input: {
    id?: string;
    name: string;
    columns: number;
    rows: number;
    cells: GridCell[];
    aspect?: string | null;
  },
  actor: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return fail("Το πλέγμα χρειάζεται όνομα.");

  const check = validateGrid(input.cells, input.columns, input.rows);
  if (!check.ok) return check;

  const data = {
    name: name.slice(0, 80),
    columns: input.columns,
    rows: input.rows,
    cells: { cells: input.cells } as never,
    aspect: input.aspect?.trim() || null,
    updatedBy: actor.slice(0, 120),
  };

  const row = input.id
    ? await prisma.gridTemplate.update({ where: { id: input.id }, data, select: { id: true } })
    : await prisma.gridTemplate.create({ data, select: { id: true } });

  return { ok: true, id: row.id };
}

/**
 * A template in use cannot be deleted.
 *
 * Cascading would silently empty every banner drawn on it. Reporting the count
 * lets somebody go and look at what they were about to destroy.
 */
export async function deleteTemplate(id: string): Promise<Result> {
  const used = await prisma.banner.count({ where: { templateId: id } });
  if (used > 0) {
    return fail(
      `Το πλέγμα χρησιμοποιείται από ${used} ${used === 1 ? "banner" : "banners"}. Διαγράψτε τα πρώτα.`,
    );
  }
  await prisma.gridTemplate.delete({ where: { id } });
  return { ok: true };
}

/* ───────────────────────── Banners ───────────────────────── */

const asContent = (value: unknown): BannerContent | null => {
  if (!value || typeof value !== "object") return null;
  const c = value as BannerContent;
  return c.widgets ? c : null;
};

export type BannerSummary = {
  id: string;
  name: string;
  templateName: string;
  state: BannerView["state"];
  placements: string[];
  updatedAt: Date;
};

export async function listBanners(): Promise<BannerSummary[]> {
  const rows = await prisma.banner.findMany({
    orderBy: { updatedAt: "desc" },
    include: { template: { select: { name: true } }, placements: { select: { zone: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    templateName: b.template.name,
    state: bannerState(asContent(b.draft), asContent(b.published)),
    placements: b.placements.map((p) => p.zone),
    updatedAt: b.updatedAt,
  }));
}

export async function getBanner(id: string): Promise<BannerView | null> {
  const row = await prisma.banner.findUnique({
    where: { id },
    include: { template: true, placements: { select: { zone: true } } },
  });
  if (!row) return null;

  const draft = asContent(row.draft);
  const published = asContent(row.published);

  return {
    id: row.id,
    name: row.name,
    template: toTemplateView(row.template),
    draft,
    published,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publishedBy: row.publishedBy,
    state: bannerState(draft, published),
    placements: row.placements.map((p) => p.zone),
  };
}

export async function createBanner(
  name: string,
  templateId: string,
  actor: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const trimmed = name.trim();
  if (!trimmed) return fail("Το banner χρειάζεται όνομα.");

  const template = await prisma.gridTemplate.findUnique({
    where: { id: templateId },
    select: { id: true },
  });
  if (!template) return fail("Το πλέγμα δεν βρέθηκε.");

  const row = await prisma.banner.create({
    data: {
      name: trimmed.slice(0, 80),
      templateId,
      // An empty draft rather than null, so the editor has something to write
      // into and `bannerState` reads "draft" from the first save rather than
      // "empty" for a banner somebody has already started.
      draft: { widgets: {} } as never,
      updatedBy: actor.slice(0, 120),
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function renameBanner(id: string, name: string, actor: string): Promise<Result> {
  const trimmed = name.trim();
  if (!trimmed) return fail("Το banner χρειάζεται όνομα.");
  await prisma.banner.update({
    where: { id },
    data: { name: trimmed.slice(0, 80), updatedBy: actor.slice(0, 120) },
  });
  return { ok: true };
}

export async function saveDraft(id: string, content: BannerContent, actor: string): Promise<Result> {
  await prisma.banner.update({
    where: { id },
    data: { draft: content as never, updatedBy: actor.slice(0, 120) },
  });
  return { ok: true };
}

/**
 * Publish: the draft becomes what the storefront renders.
 *
 * Refuses an empty draft. Publishing nothing over something live is almost
 * always a mistake, and the one time it is not, un-assigning the zone says it
 * more clearly.
 */
export async function publish(
  id: string,
  actor: string,
): Promise<{ ok: true; zones: string[] } | { ok: false; error: string }> {
  const row = await prisma.banner.findUnique({
    where: { id },
    include: { placements: { select: { zone: true } } },
  });
  if (!row) return fail("Το banner δεν βρέθηκε.");

  const draft = asContent(row.draft);
  if (!draft || Object.keys(draft.widgets).length === 0) {
    return fail("Το πρόχειρο είναι άδειο — δεν υπάρχει τίποτα να δημοσιευτεί.");
  }

  await prisma.banner.update({
    where: { id },
    data: {
      published: draft as never,
      publishedAt: new Date(),
      publishedBy: actor.slice(0, 120),
      updatedBy: actor.slice(0, 120),
    },
  });

  return { ok: true, zones: row.placements.map((p) => p.zone) };
}

/** Throw the draft away and start again from what is live. */
export async function discardDraft(id: string, actor: string): Promise<Result> {
  const row = await prisma.banner.findUnique({ where: { id }, select: { published: true } });
  if (!row) return fail("Το banner δεν βρέθηκε.");
  await prisma.banner.update({
    where: { id },
    data: { draft: (row.published ?? { widgets: {} }) as never, updatedBy: actor.slice(0, 120) },
  });
  return { ok: true };
}

export async function deleteBanner(id: string): Promise<Result> {
  // Placements cascade, so a deleted banner takes its assignments with it and
  // the zones fall back to whatever they rendered before.
  await prisma.banner.delete({ where: { id } });
  return { ok: true };
}

/* ──────────────────────── Placement ──────────────────────── */

export async function assignBanner(zone: string, bannerId: string): Promise<Result> {
  await prisma.bannerPlacement.upsert({
    where: { zone },
    create: { zone, bannerId },
    update: { bannerId },
  });
  return { ok: true };
}

export async function unassignZone(zone: string): Promise<Result> {
  await prisma.bannerPlacement.deleteMany({ where: { zone } });
  return { ok: true };
}

/* ──────────────────────── Storefront ──────────────────────── */

/**
 * What a zone should render, if a banner has been published into it.
 *
 * One query for every placement, cached per request: a page renders several
 * zones and a query each would put it back on a round-trip per region.
 *
 * Returns null unless the banner has actually been PUBLISHED. A draft is not
 * something the storefront has any business showing.
 */
const loadPublished = cache(
  async (): Promise<Map<string, { template: GridTemplateView; content: BannerContent }>> => {
    const rows = await prisma.bannerPlacement.findMany({
      include: { banner: { include: { template: true } } },
    });
    const map = new Map<string, { template: GridTemplateView; content: BannerContent }>();
    for (const row of rows) {
      const content = asContent(row.banner.published);
      if (!content || Object.keys(content.widgets).length === 0) continue;
      map.set(row.zone, { template: toTemplateView(row.banner.template), content });
    }
    return map;
  },
);

export async function getPublishedBanner(zone: string) {
  return (await loadPublished()).get(zone) ?? null;
}

/* ────────────────────────── Offers ────────────────────────── */

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

export async function listOffers(): Promise<OfferView[]> {
  return prisma.offer.findMany({ orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }] });
}

/**
 * Offers for the widget picker.
 *
 * Expired ones are excluded: binding a banner to a campaign that ended last
 * month is a mistake the picker can simply not offer.
 */
export async function searchOffersForPicker(query: string): Promise<OfferView[]> {
  const q = query.trim();
  return prisma.offer.findMany({
    where: {
      isActive: true,
      OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
      ...(q.length >= 2
        ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { slug: { contains: q } }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
}

export async function saveOffer(
  input: {
    id?: string;
    slug: string;
    title: string;
    badge?: string | null;
    href: string;
    image?: string | null;
    imageWide?: string | null;
    startsAt?: Date | null;
    endsAt?: Date | null;
    isActive?: boolean;
  },
  actor: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const slug = input.slug.trim().toLowerCase();
  const title = input.title.trim();
  const href = input.href.trim();

  if (!slug || !title || !href) return fail("Slug, τίτλος και σύνδεσμος είναι υποχρεωτικά.");
  if (!/^[a-z0-9-]+$/.test(slug)) return fail("Το slug δέχεται μόνο πεζά, αριθμούς και παύλες.");
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) {
    return fail("Η λήξη πρέπει να είναι μετά την έναρξη.");
  }

  const clash = await prisma.offer.findUnique({ where: { slug }, select: { id: true } });
  if (clash && clash.id !== input.id) return fail(`Το slug «${slug}» χρησιμοποιείται ήδη.`);

  const data = {
    slug,
    title: title.slice(0, 160),
    badge: input.badge?.trim() || null,
    href: href.slice(0, 255),
    image: input.image || null,
    imageWide: input.imageWide || null,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    isActive: input.isActive !== false,
    updatedBy: actor.slice(0, 120),
  };

  const row = input.id
    ? await prisma.offer.update({ where: { id: input.id }, data, select: { id: true } })
    : await prisma.offer.create({ data, select: { id: true } });

  return { ok: true, id: row.id };
}

export async function deleteOffer(id: string): Promise<Result> {
  // Widgets bound to it resolve to nothing and the cell renders empty rather
  // than breaking the page — see `resolve.ts`.
  await prisma.offer.delete({ where: { id } });
  return { ok: true };
}
