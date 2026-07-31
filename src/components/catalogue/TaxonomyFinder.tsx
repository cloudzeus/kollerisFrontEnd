"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CatalogueNode } from "@/lib/catalog/catalogue-index-types";
import { searchKey, upGreek } from "@/lib/greek";

/**
 * Find any node in the taxonomy, at any level.
 *
 * The single most useful control on this page. The tree is 23 categories, 140
 * groups and 327 subgroups deep — 490 places a product can live — and the one
 * thing a customer knows is the WORD ("αλλεν", "ποτηροτρύπανο"), not which of
 * three levels it sits on or which parent it hangs from.
 *
 * Filtering is client-side on purpose: 490 nodes ship as about 40KB, a server
 * round-trip per keystroke would be slower and noisier than the filter is
 * worth, and the whole set is already in the page for the tiers below.
 *
 * Every result carries its PATH. Among 327 subgroups there are several called
 * "ΔΙΑΦΟΡΑ" and several called "ΣΕΤ"; a list of bare names would be a worse
 * maze than the one it is meant to solve.
 */
export function TaxonomyFinder({ nodes }: { nodes: CatalogueNode[] }) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const key = searchKey(query);
    if (key.length < 2) return [];

    return (
      nodes
        .filter((node) => node.key.includes(key))
        /*
         * Rank by depth, then by size. A subgroup match is almost always what
         * was meant — someone typing "αλλεν" wants the Allen keys, not
         * ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ because the phrase appears somewhere in its subtree.
         */
        .sort((a, b) => {
          const depth = (n: CatalogueNode) =>
            n.level === "SUBGROUP" ? 0 : n.level === "GROUP" ? 1 : 2;
          return depth(a) - depth(b) || b.count - a.count;
        })
        .slice(0, 24)
    );
  }, [nodes, query]);

  const tooShort = query.trim().length > 0 && searchKey(query).length < 2;

  return (
    <div className="border border-k-line bg-white">
      <div className="flex flex-col gap-4 border-b border-k-line p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
        <label className="flex h-12 w-full min-w-0 border-[1.5px] border-k-ink bg-white lg:w-[440px]">
          <span className="flex items-center pr-2.5 pl-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8A8E" strokeWidth="2.4">
              <circle cx="10.5" cy="10.5" r="7" />
              <line x1="15.8" y1="15.8" x2="22" y2="22" />
            </svg>
          </span>
          <span className="sr-only">Αναζήτηση κατηγορίας</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Βρείτε κατηγορία — π.χ. αλλεν, ποτηροτρύπανο, γάντια"
            autoComplete="off"
            className="t-input min-w-0 flex-1 border-0 bg-transparent pr-2 text-k-ink outline-none placeholder:text-k-text-4"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Καθαρισμός"
              className="cursor-pointer px-4 text-k-text-4 transition-colors hover:text-k-ink"
            >
              ✕
            </button>
          )}
        </label>

        <p className="t-brand-count shrink-0 text-k-text-4" aria-live="polite">
          {query.trim()
            ? upGreek(`${results.length}${results.length === 24 ? "+" : ""} αποτελέσματα`)
            : upGreek(`${nodes.length} κατηγορίες σε 3 επίπεδα`)}
        </p>
      </div>

      {tooShort && (
        <p className="px-4 py-8 text-center text-[13px] text-k-text-3 lg:px-5">
          Γράψτε τουλάχιστον 2 χαρακτήρες.
        </p>
      )}

      {!tooShort && query.trim() && results.length === 0 && (
        <div className="px-4 py-10 text-center lg:px-5">
          <p className="text-[13.5px] font-semibold text-k-ink">
            Καμία κατηγορία για «{query.trim()}»
          </p>
          <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-[1.6] text-k-text-3">
            Δοκιμάστε την αναζήτηση προϊόντων στην κορυφή — ψάχνει σε κωδικούς και ονόματα,
            όχι μόνο σε κατηγορίες.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <ul className="max-h-[420px] overflow-y-auto scroll-slim">
          {results.map((node) => (
            <li key={node.slug}>
              <Link
                href={`/katalogos/${node.slug}`}
                className="flex items-center gap-4 border-b border-k-line px-4 py-3 transition-colors last:border-b-0 hover:bg-k-surface-2 lg:px-5"
              >
                <span className="min-w-0 flex-1">
                  {node.path.length > 0 && (
                    <span className="t-brand-count block truncate text-k-text-5">
                      {node.path.join(" › ")}
                    </span>
                  )}
                  <span className="mt-0.5 block truncate text-[13px] font-medium text-k-ink">
                    <Highlight text={node.name} query={query} />
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block font-mono text-[12.5px] font-semibold text-k-ink">
                    {node.count.toLocaleString("el-GR")}
                  </span>
                  <span className="t-brand-count block text-k-text-5">{upGreek("κωδ.")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Bolds the matched run.
 *
 * Plain `indexOf` on the lower-cased strings, not `searchKey`: the normaliser
 * strips accents and changes length, so its offsets would not line up with the
 * text on screen and the highlight would sit a character or two off.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase();
  if (!needle) return <>{text}</>;
  const at = text.toLowerCase().indexOf(needle);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-k-red/15 text-inherit">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}
