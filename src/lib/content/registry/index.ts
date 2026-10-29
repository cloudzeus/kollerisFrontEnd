/**
 * What marketing can edit, and where it appears — aggregated across pages.
 *
 * Every entry carries the copy compiled into the component as `fallback`. That
 * is the whole safety property: a block that has never been filled in renders
 * exactly what the site renders today, and clearing one puts the original back
 * rather than leaving a hole on a live page.
 *
 * Per-page registry modules are imported here and concatenated. Keys stay
 * globally unique (they are the storage key); `page` groups the admin accordions.
 *
 * Client-safe: definitions only, no values, no I/O.
 */

import type { ContentDef, PageDef } from "./types";
import { home } from "./home";

export type { ContentKind, ContentDef, PageDef, ContentView } from "./types";

/** Pages shown in the admin, in order. A page appears only if it has blocks. */
export const PAGES: ReadonlyArray<PageDef> = [
  { id: "home", title: "Αρχική", path: "/", order: 0 },
] as const;

export const CONTENT: ReadonlyArray<ContentDef> = [...home];

export const CONTENT_BY_KEY = new Map(CONTENT.map((c) => [c.key, c]));

/**
 * Legacy section grouping, kept until the admin editor is rewritten to group by
 * page. The homepage blocks still carry these section ids.
 */
export const CONTENT_SECTIONS: ReadonlyArray<{ id: string; title: string; blurb: string }> = [
  { id: "hero", title: "Αρχική — κεντρικό banner", blurb: "Το πρώτο πράγμα που βλέπει ο επισκέπτης." },
  { id: "about", title: "Αρχική — «Η εταιρεία»", blurb: "Η ενότητα εμπιστοσύνης, κάτω από τις κατηγορίες." },
  { id: "reviews", title: "Αρχική — αξιολογήσεις", blurb: "Η λωρίδα με τις κριτικές Google." },
  { id: "shipping", title: "Μηνύματα αποστολής", blurb: "Εμφανίζονται στο καλάθι και στο ταμείο." },
] as const;
