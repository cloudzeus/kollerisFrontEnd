/**
 * Shared registry types. In their own module so a per-page registry file and
 * the aggregating index can both import them without a cycle.
 *
 * Client-safe: definitions only, no values, no I/O.
 */

export type ContentKind = "text" | "long" | "url" | "image" | "rich";

export type ContentDef = {
  key: string;
  /** The page this block belongs to — one `PageDef.id`. Groups the admin accordions. */
  page: string;
  /** Sub-group inside the page's accordion. */
  section: string;
  label: string;
  where: string;
  kind: ContentKind;
  /** The copy compiled into the component. For `rich`, HTML or plain prose. */
  fallback: string;
  /** Soft guidance shown as a counter; ignored for `rich`. */
  maxChars?: number;
};

export type PageDef = {
  id: string;
  title: string;
  /** On-site path, for the admin's "view on site" link. */
  path: string;
  order: number;
};

export type ContentView = {
  key: string;
  value: string;
  /** True when nothing has been saved and the compiled copy is showing. */
  isFallback: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
};
