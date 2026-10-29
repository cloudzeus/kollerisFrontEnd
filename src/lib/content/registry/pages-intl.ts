/**
 * Storefront pages whose copy is editable through the next-intl override layer.
 *
 * Unlike the `ContentBlock` pages, these need no component changes: their text
 * already flows through next-intl (`t("…")`), and `src/i18n/request.ts` merges
 * any override on top. This list only tells the admin which namespaces to
 * surface as accordions, and where each page lives.
 *
 * `namespace` is the dotted catalogue path whose leaf strings are editable
 * (e.g. `etaireia.page`). The `pages-intl` integrity test asserts every one of
 * them resolves to at least one string, so a typo can't ship a blank accordion.
 *
 * The legal/policy pages are deliberately absent: their prose is structured
 * data in `src/lib/policies/content.ts`, edited through a separate path.
 *
 * Client-safe: declarations only, no values, no I/O.
 */

export type IntlPageDef = {
  id: string;
  title: string;
  path: string;
  namespace: string;
  order: number;
};

export const INTL_PAGES: ReadonlyArray<IntlPageDef> = [
  { id: "etaireia", title: "Η εταιρεία", path: "/etaireia", namespace: "etaireia.page", order: 1 },
  { id: "epikoinonia", title: "Επικοινωνία", path: "/epikoinonia", namespace: "epikoinonia.page", order: 2 },
  { id: "prosfores", title: "Προσφορές", path: "/prosfores", namespace: "prosfores.page", order: 3 },
  { id: "syxnes-erotiseis", title: "Συχνές ερωτήσεις", path: "/syxnes-erotiseis", namespace: "syxnes-erotiseis.page", order: 4 },
] as const;

export const INTL_PAGE_BY_ID = new Map(INTL_PAGES.map((p) => [p.id, p]));
