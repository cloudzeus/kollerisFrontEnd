import type { PolicySlug } from "@/lib/policies/types";

/**
 * The six legal pages as the admin lists them.
 *
 * Their prose is structured data in `content.ts`, rendered through
 * `.prose-kolleris`. The admin edits one rich-HTML body per page (a
 * `MessageOverride` at `policies.<slug>.body`); when none is set, the structured
 * content still renders. This list only names the pages and where they live —
 * titles are admin labels, not the page's own `<h1>` (that stays the structured
 * title, so a rename here never changes the live heading).
 *
 * Client-safe: declarations only.
 */

export type PolicyPageDef = {
  id: PolicySlug;
  title: string;
  path: string;
  order: number;
};

export const POLICY_PAGES: ReadonlyArray<PolicyPageDef> = [
  { id: "oroi-chrisis", title: "Όροι χρήσης", path: "/oroi-chrisis", order: 1 },
  { id: "aporrito", title: "Πολιτική απορρήτου", path: "/aporrito", order: 2 },
  { id: "tropoi-pliromis", title: "Τρόποι πληρωμής", path: "/tropoi-pliromis", order: 3 },
  { id: "apostoli-paradosi", title: "Αποστολή & παράδοση", path: "/apostoli-paradosi", order: 4 },
  { id: "epistrofes", title: "Επιστροφές", path: "/epistrofes", order: 5 },
  { id: "eggyiseis", title: "Εγγυήσεις", path: "/eggyiseis", order: 6 },
] as const;

export const POLICY_PAGE_IDS: ReadonlySet<string> = new Set(POLICY_PAGES.map((p) => p.id));
