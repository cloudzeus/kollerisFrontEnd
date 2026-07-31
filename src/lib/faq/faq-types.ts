/**
 * FAQ types.
 *
 * Split from `faq.ts` (which is `server-only` — it counts products) so the
 * client-side filter can import the shape it renders.
 */

export type FaqEntry = {
  q: string;
  a: string;
  /** `searchKey(q + a)`, precomputed so filtering is a plain `includes`. */
  key: string;
};

export type FaqSection = {
  id: string;
  title: string;
  entries: FaqEntry[];
};
