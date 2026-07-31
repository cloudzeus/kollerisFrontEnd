import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { searchKey } from "@/lib/greek";
import type { CatalogueNode, CatalogueTier } from "@/lib/catalog/catalogue-index-types";

/**
 * The catalogue index.
 *
 * The taxonomy is lopsided in a way that decides the whole design of the page:
 *
 *   ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ            3.797 products — 72% of the catalogue
 *   the next 22 categories      1.508 between them
 *   the bottom five             1 to 5 products each
 *
 * ...across 23 categories, 140 groups and 327 subgroups that hold stock. A
 * 23-tile grid of equal squares therefore tells a lie: it gives a category with
 * one product the same weight as one with 3.797, and it hides the 187
 * subcategories a customer actually wants to land in.
 *
 * So this splits the roots into tiers by SIZE, and every tier carries its top
 * children inline — the point being that you should be able to jump straight to
 * "ΑΛΛΕΝ" without first entering ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ and paging through 33 groups.
 */

type Row = { nameEl: string; nameEn: string; nameIt: string };
const pick = (row: Row, locale: Locale) =>
  locale === "en" ? row.nameEn || row.nameEl : locale === "it" ? row.nameIt || row.nameEl : row.nameEl;

const SELECT = {
  id: true,
  parentId: true,
  slug: true,
  erpType: true,
  productCount: true,
  childCount: true,
  nameEl: true,
  nameEn: true,
  nameIt: true,
  mainImage: true,
} as const;

export type CatalogueRoot = CatalogueNode & {
  tier: CatalogueTier;
  /** Direct children, biggest first — the level a customer usually wants. */
  children: CatalogueNode[];
  groupCount: number;
  subgroupCount: number;
  image: string | null;
};

export type CatalogueIndex = {
  roots: CatalogueRoot[];
  /** Every node holding stock, flattened with its path — feeds the finder. */
  all: CatalogueNode[];
  totals: {
    products: number;
    categories: number;
    groups: number;
    subgroups: number;
    /** Share of the catalogue held by the single biggest category, 0–100. */
    topShare: number;
  };
};

/**
 * Tiers by share of the catalogue, not by rank.
 *
 * Rank would put the 5-product category in "medium" simply for being twelfth.
 * The thresholds are read off the real distribution: one category above 10%,
 * a working middle above 1%, and a tail that would be noise as a full tile.
 */
function tierFor(count: number, total: number): CatalogueTier {
  const share = count / total;
  if (share >= 0.1) return "feature";
  if (share >= 0.01) return "standard";
  return "tail";
}

export const getCatalogueIndex = cache(async (locale: Locale): Promise<CatalogueIndex> => {
  const [nodes, totalProducts] = await Promise.all([
    prisma.category.findMany({
      where: { productCount: { gt: 0 } },
      orderBy: [{ productCount: "desc" }],
      select: SELECT,
    }),
    prisma.product.count({ where: { isActive: true } }),
  ]);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, typeof nodes>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = childrenOf.get(node.parentId) ?? [];
    list.push(node);
    childrenOf.set(node.parentId, list);
  }

  /*
   * Breadcrumb path, walked up through `parentId`.
   *
   * This is what makes the finder useful rather than confusing: 327 subgroups
   * include several called "ΔΙΑΦΟΡΑ" and several called "ΣΕΤ", and a result
   * list of bare names could not tell you which is which.
   */
  const pathOf = (node: (typeof nodes)[number]): string[] => {
    const out: string[] = [];
    let current = node.parentId ? byId.get(node.parentId) : undefined;
    // Bounded: the ERP hierarchy is three levels, and the guard means a cycle
    // in the data cannot hang a page render.
    for (let depth = 0; current && depth < 4; depth += 1) {
      out.unshift(pick(current, locale));
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return out;
  };

  const toNode = (node: (typeof nodes)[number]): CatalogueNode => {
    const name = pick(node, locale);
    const path = pathOf(node);
    return {
      slug: node.slug,
      name,
      level: node.erpType,
      count: node.productCount,
      childCount: node.childCount,
      path,
      // Normalised once here so the finder filters with a plain `includes`
      // instead of re-normalising 490 strings on every keystroke.
      key: searchKey([name, ...path].join(" ")),
    };
  };

  const rootRows = nodes.filter((n) => n.erpType === "CATEGORY");

  const roots: CatalogueRoot[] = rootRows.map((root) => {
    const groups = childrenOf.get(root.id) ?? [];
    const subgroups = groups.flatMap((g) => childrenOf.get(g.id) ?? []);

    /*
     * The children a customer is offered are the biggest ones at ANY level
     * below — for a category whose groups are thin but whose subgroups are
     * fat, offering the groups would be offering the emptier choice.
     */
    const offered = [...groups, ...subgroups]
      .sort((a, b) => b.productCount - a.productCount)
      .slice(0, 8);

    return {
      ...toNode(root),
      tier: tierFor(root.productCount, totalProducts),
      children: offered.map(toNode),
      groupCount: groups.length,
      subgroupCount: subgroups.length,
      image: root.mainImage,
    };
  });

  const groupNodes = nodes.filter((n) => n.erpType === "GROUP");
  const subgroupNodes = nodes.filter((n) => n.erpType === "SUBGROUP");

  return {
    roots,
    all: nodes.map(toNode),
    totals: {
      products: totalProducts,
      categories: rootRows.length,
      groups: groupNodes.length,
      subgroups: subgroupNodes.length,
      topShare: rootRows.length
        ? Math.round((rootRows[0].productCount / totalProducts) * 100)
        : 0,
    },
  };
});
