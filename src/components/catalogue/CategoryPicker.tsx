"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { CatalogueNode } from "@/lib/catalog/catalogue-index-types";
import { searchKey, upGreek } from "@/lib/greek";

/**
 * "And the other 185" — a modal picker over one category's whole subtree.
 *
 * The link this replaces navigated to the category page so the customer could
 * choose there. For ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ that is 220 children behind a page load,
 * and if none of them is right you navigate back and start again. Opening them
 * in place makes choosing cheap and reversible.
 *
 * Costs NO extra payload: it filters the same 490-node array the finder above
 * it already receives, by walking each node's `path`. Passing a per-root tree
 * from the server would have duplicated most of that list.
 *
 * Grouped by the middle level, because a flat list of 220 names sorted by size
 * is exactly the maze this page exists to undo.
 */
export function CategoryPicker({
  root,
  nodes,
  label,
}: {
  /** The root category's display name — nodes are matched on `path[0]`. */
  root: string;
  nodes: CatalogueNode[];
  label: string;
}) {
  const t = useTranslations("catalogue.CategoryPicker");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const descendants = useMemo(
    () => nodes.filter((node) => node.path[0] === root),
    [nodes, root],
  );

  const groups = useMemo(() => {
    const key = searchKey(query);
    const matching = key.length >= 2 ? descendants.filter((n) => n.key.includes(key)) : descendants;

    /*
     * Bucketed by the group they sit under. A node whose path is only the root
     * IS a group, so it heads its own bucket; anything deeper joins its
     * parent's.
     */
    const buckets = new Map<string, CatalogueNode[]>();
    for (const node of matching) {
      const head = node.path[1] ?? node.name;
      const list = buckets.get(head) ?? [];
      if (node.path[1]) list.push(node);
      buckets.set(head, list);
    }

    return [...buckets.entries()]
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => b.count - a.count),
        total: items.reduce((sum, i) => sum + i.count, 0),
        // The group itself is a destination too — someone may want all of
        // "ΚΛΕΙΔΙΑ" rather than one kind of key.
        self: matching.find((n) => n.name === name && !n.path[1]),
      }))
      .filter((g) => g.items.length > 0 || g.self)
      .sort((a, b) => b.total - a.total || (b.self?.count ?? 0) - (a.self?.count ?? 0));
  }, [descendants, query]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-card-cta inline-flex cursor-pointer items-center gap-2 border-b-[1.5px] border-k-red pb-[3px] text-k-ink transition-colors hover:text-k-red"
      >
        {upGreek(label)} →
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label={t("kleisimo")}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/55"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("ypokatigories", { root: root })}
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden border border-k-line bg-white"
          >
            <div className="flex shrink-0 flex-col gap-3.5 border-b border-k-line p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
              <div className="min-w-0">
                <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
                  <span aria-hidden className="rule-accent block shrink-0" />
                  {upGreek(t("epilogi_ypokatigorias"))}
                </p>
                <p className="font-artegra mt-2 truncate text-[17px] leading-[1.25] text-k-ink lg:text-xl">
                  {upGreek(root)}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex h-11 min-w-0 flex-1 border-[1.5px] border-k-ink bg-white lg:w-[300px] lg:flex-none">
                  <span className="flex items-center pr-2 pl-3.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A8A8E" strokeWidth="2.4">
                      <circle cx="10.5" cy="10.5" r="7" />
                      <line x1="15.8" y1="15.8" x2="22" y2="22" />
                    </svg>
                  </span>
                  <span className="sr-only">{t("filtrarisma_ypokatigorion")}</span>
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("filtrarisma")}
                    className="t-input min-w-0 flex-1 border-0 bg-transparent pr-3 text-k-ink outline-none placeholder:text-k-text-4"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={t("kleisimo")}
                  className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border border-k-line-2 text-xl leading-none text-k-ink transition-colors hover:border-k-ink hover:bg-k-ink hover:text-white"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4 lg:p-5">
              {groups.length === 0 ? (
                <p className="py-12 text-center text-[13px] text-k-text-3">
                  {t("kamia_ypokatigoria_gia")}{query.trim()}».
                </p>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
                  {groups.map((group) => (
                    <div key={group.name} className="break-inside-avoid">
                      <p className="flex items-baseline justify-between gap-3 border-b border-k-line pb-2">
                        {group.self ? (
                          <Link
                            href={`/katalogos/${group.self.slug}`}
                            onClick={() => setOpen(false)}
                            className="t-eyebrow min-w-0 truncate text-k-ink transition-colors hover:text-k-red"
                          >
                            {upGreek(group.name)}
                          </Link>
                        ) : (
                          <span className="t-eyebrow min-w-0 truncate text-k-text-4">
                            {upGreek(group.name)}
                          </span>
                        )}
                        <span className="t-brand-count shrink-0 font-mono text-k-text-5">
                          {group.total.toLocaleString("el-GR")}
                        </span>
                      </p>

                      <ul className="mt-1.5">
                        {group.items.map((item) => (
                          <li key={item.slug}>
                            <Link
                              href={`/katalogos/${item.slug}`}
                              onClick={() => setOpen(false)}
                              className="flex items-baseline justify-between gap-3 py-1.5 transition-colors hover:text-k-red"
                            >
                              <span className="min-w-0 flex-1 truncate text-[12.5px] text-k-text-2">
                                {item.name}
                              </span>
                              <span className="t-brand-count shrink-0 font-mono text-k-text-5">
                                {item.count}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-k-line bg-k-surface-2 px-4 py-3 lg:px-5">
              <p className="t-brand-count text-k-text-4" aria-live="polite">
                {upGreek(t("ypokatigories_se_omades", { shown: shown, length: groups.length }))}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="t-brand-count cursor-pointer text-k-text-4 underline underline-offset-4 transition-colors hover:text-k-ink"
              >
                {upGreek(t("kleisimo"))}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
