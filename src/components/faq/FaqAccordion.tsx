"use client";

import { useMemo, useState } from "react";
import type { FaqSection } from "@/lib/faq/faq-types";
import { searchKey, upGreek } from "@/lib/greek";

/**
 * Filterable FAQ.
 *
 * Uses native `<details>`: it opens without JavaScript, it is in the
 * accessibility tree for free, and Ctrl+F finds text inside a closed panel in
 * most browsers — which is exactly what someone hunting an answer does first.
 * The client part is only the filter and the "open everything" toggle.
 *
 * Filtering searches the ANSWERS too, not just the questions. Someone typing
 * "αντικαταβολή" does not know it lives under "Αποστολή", and matching only
 * headings would tell them we have no answer when we do.
 */
export function FaqAccordion({ sections }: { sections: FaqSection[] }) {
  const [query, setQuery] = useState("");
  const [expandAll, setExpandAll] = useState(false);

  const key = searchKey(query);
  const filtering = key.length >= 2;

  const filtered = useMemo(() => {
    if (!filtering) return sections;
    return sections
      .map((section) => ({
        ...section,
        entries: section.entries.filter((entry) => entry.key.includes(key)),
      }))
      .filter((section) => section.entries.length > 0);
  }, [sections, key, filtering]);

  const total = sections.reduce((n, s) => n + s.entries.length, 0);
  const shown = filtered.reduce((n, s) => n + s.entries.length, 0);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <label className="flex h-12 w-full min-w-0 border-[1.5px] border-k-ink bg-white lg:w-[440px]">
          <span className="flex items-center pr-2.5 pl-4">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A8A8E" strokeWidth="2.4">
              <circle cx="10.5" cy="10.5" r="7" />
              <line x1="15.8" y1="15.8" x2="22" y2="22" />
            </svg>
          </span>
          <span className="sr-only">Αναζήτηση στις ερωτήσεις</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ψάξτε μια ερώτηση — π.χ. αντικαταβολή, εγγύηση, τιμολόγιο"
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

        <div className="flex items-center gap-4">
          <p className="t-brand-count text-k-text-4" aria-live="polite">
            {filtering ? upGreek(`${shown} από ${total}`) : upGreek(`${total} ερωτήσεις`)}
          </p>
          <button
            type="button"
            onClick={() => setExpandAll((v) => !v)}
            className="t-brand-count cursor-pointer text-k-ink underline underline-offset-4 transition-colors hover:text-k-red"
          >
            {upGreek(expandAll ? "Σύμπτυξη όλων" : "Άνοιγμα όλων")}
          </button>
        </div>
      </div>

      {filtering && shown === 0 && (
        <div className="mt-7 border border-k-line bg-k-surface-2 px-5 py-12 text-center">
          <p className="text-[13.5px] font-semibold text-k-ink">
            Καμία ερώτηση για «{query.trim()}»
          </p>
          <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-[1.6] text-k-text-3">
            Ρωτήστε μας απευθείας — απαντάμε την ίδια εργάσιμη, και η ερώτησή σας πιθανότατα
            μπει εδώ για τον επόμενο.
          </p>
          <a
            href="tel:+302104111355"
            className="t-btn-sm mt-5 inline-block bg-k-ink px-7 py-3.5 text-white transition-colors hover:bg-k-red"
          >
            210 411 1355
          </a>
        </div>
      )}

      <div className="mt-7 flex flex-col gap-8 lg:mt-9 lg:gap-10">
        {filtered.map((section) => (
          <section key={section.id} id={section.id}>
            <p className="flex items-center gap-2.5">
              <span aria-hidden className="rule-accent block shrink-0" />
              <span className="t-eyebrow text-k-red">{upGreek(section.title)}</span>
            </p>

            <div className="mt-3.5 border border-k-line bg-white">
              {section.entries.map((entry) => (
                <details
                  key={entry.q}
                  /* `key` on the group forces a remount when the toggle flips,
                     which is what makes "open all" work on a native element
                     whose openness the browser owns. */
                  open={expandAll || filtering}
                  className="group/faq border-b border-k-line last:border-b-0"
                >
                  <summary className="flex cursor-pointer list-none items-start gap-4 px-4 py-3.5 transition-colors hover:bg-k-surface-2 lg:px-5 lg:py-4">
                    <span className="min-w-0 flex-1 text-[13.5px] leading-[1.4] font-semibold text-k-ink">
                      {entry.q}
                    </span>
                    <span
                      aria-hidden
                      className="mt-0.5 shrink-0 text-k-red transition-transform group-open/faq:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="max-w-[72ch] px-4 pb-4 text-[13px] leading-[1.75] text-k-text-2 lg:px-5 lg:pb-5">
                    {entry.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
