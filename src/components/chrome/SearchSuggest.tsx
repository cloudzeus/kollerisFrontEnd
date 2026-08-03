"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { SuggestResult } from "@/lib/catalog/suggest-types";
import { SUGGEST_DEBOUNCE_MS, SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest-options";
import { formatPrice } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * Search-as-you-type.
 *
 * A typeahead cannot be server-rendered — it reacts to keystrokes — so this is
 * the one place a client island is the whole feature. It is kept thin: it owns
 * the input, a debounce, an abort controller and a highlight index, and every
 * row it draws is data the server produced.
 *
 * Behaviour worth knowing:
 *  - 180ms debounce with the in-flight request aborted on the next keystroke,
 *    so a fast typist never gets an older answer landing after a newer one
 *  - the response is keyed by its own query, so a late reply for "τρυ" cannot
 *    overwrite the results for "τρυπανι"
 *  - an exact code match gets its own row at the top, because someone pasting
 *    an SKU is not browsing
 *  - full keyboard: ↑ ↓ through every row, Enter to open, Esc to close, and
 *    the whole thing is a combobox so a screen reader is told how many results
 *    arrived
 */
export function SearchSuggest({
  locale,
  categories,
  variant = "desktop",
}: {
  locale: string;
  categories: Array<{ slug: string; name: string }>;
  variant?: "desktop" | "mobile";
}) {
  const t = useTranslations("chrome.SearchSuggest");
  const router = useRouter();
  const listId = useId();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  /*
   * The highlight is stored together with the query it belongs to, and read
   * back only when the two still agree. New results therefore reset it during
   * render, with no effect and no cascading re-render — the same shape as
   * `entry` below, for the same reason.
   */
  const [mark, setMark] = useState<{ q: string; index: number }>({ q: "", index: -1 });

  /*
   * The response is stored WITH the query it answers, and both `data` and
   * `loading` are derived from that during render.
   *
   * This is what makes the race impossible rather than merely unlikely: a late
   * reply for "τρυ" landing after the user has typed "τρυπανι" simply does not
   * match the current query, so it is ignored — no comparison, no sequence
   * number, no clearing state from inside an effect (which React now flags as
   * a cascading render, and rightly).
   */
  const [entry, setEntry] = useState<{ q: string; result: SuggestResult } | null>(null);

  const trimmed = query.trim();
  const data = entry?.q === trimmed ? entry.result : null;
  const loading = trimmed.length >= SUGGEST_MIN_LENGTH && data == null;
  const cursor = mark.q === trimmed ? mark.index : -1;
  const setCursor = (next: number | ((i: number) => number)) =>
    setMark((m) => {
      const from = m.q === trimmed ? m.index : -1;
      return { q: trimmed, index: typeof next === "function" ? next(from) : next };
    });

  const root = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  /*
   * Every row the arrow keys can land on, flattened in visual order. Deriving
   * it during render rather than storing it means the cursor can never point
   * at a row that is no longer on screen.
   */
  const rows = useMemo(() => {
    if (!data) return [] as Array<{ href: string; label: string }>;
    const out: Array<{ href: string; label: string }> = [];
    if (data.exact) out.push({ href: `/proion/${data.exact.slug}`, label: data.exact.name });
    for (const p of data.products) out.push({ href: `/proion/${p.slug}`, label: p.name });
    for (const c of data.categories) out.push({ href: `/katalogos/${c.slug}`, label: c.name });
    for (const b of data.brands) out.push({ href: `/brands/${b.slug}`, label: b.name });
    if (data.totalProducts > 0) {
      out.push({
        href: `/anazitisi?q=${encodeURIComponent(data.query)}`,
        label: t("ola_ta_apotelesmata", { totalProducts: data.totalProducts }),
      });
    }
    return out;
  }, [data]);

  // ── Fetch, debounced and abortable ──────────────────────────────────────
  useEffect(() => {
    // Nothing to fetch, and nothing to clear — `data` is derived, so a short
    // query stops matching the stored entry on its own.
    if (trimmed.length < SUGGEST_MIN_LENGTH || data != null) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(trimmed)}&locale=${locale}`, {
        signal: controller.signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((result: SuggestResult) => setEntry({ q: trimmed, result }))
        .catch((error) => {
          // An empty result for this query beats spinning forever.
          if (error.name !== "AbortError") {
            setEntry({
              q: trimmed,
              result: {
                query: trimmed,
                exact: null,
                products: [],
                categories: [],
                brands: [],
                totalProducts: 0,
              },
            });
          }
        });
    }, SUGGEST_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, data, locale]);

  // ── Close on outside click ──────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      // `setMark`, not the derived `setCursor` — the latter closes over
      // `trimmed` and would make this callback stale on every keystroke.
      setMark({ q: "", index: -1 });
      input.current?.blur();
      router.push(href);
    },
    [router],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setCursor(-1);
      return;
    }
    if (!open || rows.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((i) => (i + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((i) => (i - 1 + rows.length) % rows.length);
    } else if (event.key === "Enter" && cursor >= 0) {
      // Only intercept Enter when a row is highlighted — otherwise the form
      // submits to the results page, which is what Enter should do by default.
      event.preventDefault();
      go(rows[cursor].href);
    }
  };

  const showPanel = open && trimmed.length >= SUGGEST_MIN_LENGTH;
  const isEmpty = data != null && rows.length === 0 && !loading;
  const desktop = variant === "desktop";

  return (
    <div ref={root} className="relative min-w-0 flex-1">
      <form
        role="search"
        aria-label={t("anazitisi_proionton")}
        action="/anazitisi"
        className={
          desktop
            ? "search-shell flex h-[50px] min-w-0 border-[1.5px] border-k-ink transition-shadow"
            : "flex min-w-0"
        }
      >
        {desktop && (
          <>
            <label htmlFor="scope-desktop" className="sr-only">
              {t("katigoria_anazitisis")}
            </label>
            <select
              id="scope-desktop"
              name="cat"
              className="t-search-cat h-full w-[168px] shrink-0 cursor-pointer truncate border-0 border-r border-[#E4E4E6] bg-white pr-7 pl-4 text-k-ink outline-none xl:w-[196px]"
            >
              <option value="">{upGreek(t("oles_oi_katigories"))}</option>
              {categories.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.name}
                </option>
              ))}
            </select>
          </>
        )}

        <label htmlFor={`q-${variant}`} className="sr-only">
          {t("anazitisi")}
        </label>
        <input
          ref={input}
          id={`q-${variant}`}
          name="q"
          data-search-input
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={cursor >= 0 ? `${listId}-${cursor}` : undefined}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={
            desktop
              ? t("anazitisi_me_kodiko_proion_i")
              : t("anazitisi_kodikoy_i_proiontos")
          }
          className={
            desktop
              ? "t-input min-w-0 flex-1 border-0 bg-transparent px-4 text-k-ink outline-none placeholder:text-k-text-4"
              : "t-input h-[46px] min-w-0 flex-1 border-[1.5px] border-r-0 border-k-ink px-3.5 text-k-ink outline-none placeholder:text-k-text-4"
          }
        />

        {desktop && (
          <kbd className="t-brand-count my-auto mr-3 hidden shrink-0 border border-k-line-2 px-1.5 py-1 font-mono text-k-text-5 xl:block">
            /
          </kbd>
        )}

        <button
          type="submit"
          aria-label={t("anazitisi")}
          className={`flex shrink-0 cursor-pointer items-center justify-center border-0 bg-k-red transition-colors hover:bg-k-red-hover ${
            desktop ? "w-[58px]" : "h-[46px] w-[52px]"
          }`}
        >
          <svg
            width={desktop ? 17 : 16}
            height={desktop ? 17 : 16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
          >
            <circle cx="10.5" cy="10.5" r="7" />
            <line x1="15.8" y1="15.8" x2="22" y2="22" />
          </svg>
        </button>
      </form>

      {/* Announced separately so a screen reader hears the count, not the rows. */}
      <span aria-live="polite" className="sr-only">
        {data && !loading
          ? t("apotelesmata_gia", { totalProducts: data.totalProducts, query: data.query })
          : ""}
      </span>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          aria-label={t("protaseis_anazitisis")}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[70vh] overflow-y-auto border border-k-line bg-white shadow-[0_18px_40px_rgba(0,0,0,.14)]"
        >
          {loading && !data && <SuggestSkeleton />}

          {isEmpty && (
            <div className="px-5 py-8 text-center">
              <p className="text-[13.5px] font-semibold text-k-ink">
                {t("den_vrethike_kati_gia")}{query.trim()}»
              </p>
              <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-[1.6] text-k-text-3">
                {t("dokimaste_ton_kodiko_toy_kataskeyasti")}
              </p>
            </div>
          )}

          {data && rows.length > 0 && (
            <>
              {data.exact && (
                <Section label={t("akrivis_kodikos")}>
                  <ProductRow
                    id={`${listId}-0`}
                    product={data.exact}
                    query={data.query}
                    active={cursor === 0}
                    exact
                    onSelect={() => go(`/proion/${data.exact!.slug}`)}
                    onHover={() => setCursor(0)}
                  />
                </Section>
              )}

              {data.products.length > 0 && (
                <Section label={t("proionta")}>
                  {data.products.map((product, index) => {
                    const i = (data.exact ? 1 : 0) + index;
                    return (
                      <ProductRow
                        key={product.id}
                        id={`${listId}-${i}`}
                        product={product}
                        query={data.query}
                        active={cursor === i}
                        onSelect={() => go(`/proion/${product.slug}`)}
                        onHover={() => setCursor(i)}
                      />
                    );
                  })}
                </Section>
              )}

              {data.categories.length > 0 && (
                <Section label={t("katigories")}>
                  {data.categories.map((category, index) => {
                    const i = (data.exact ? 1 : 0) + data.products.length + index;
                    return (
                      <TaxonomyRow
                        key={category.slug}
                        id={`${listId}-${i}`}
                        name={category.name}
                        count={category.count}
                        query={data.query}
                        active={cursor === i}
                        onSelect={() => go(`/katalogos/${category.slug}`)}
                        onHover={() => setCursor(i)}
                      />
                    );
                  })}
                </Section>
              )}

              {data.brands.length > 0 && (
                <Section label="Brands">
                  {data.brands.map((brand, index) => {
                    const i =
                      (data.exact ? 1 : 0) +
                      data.products.length +
                      data.categories.length +
                      index;
                    return (
                      <TaxonomyRow
                        key={brand.slug}
                        id={`${listId}-${i}`}
                        name={brand.name}
                        count={brand.count}
                        logo={brand.logo}
                        query={data.query}
                        active={cursor === i}
                        onSelect={() => go(`/brands/${brand.slug}`)}
                        onHover={() => setCursor(i)}
                      />
                    );
                  })}
                </Section>
              )}

              {data.totalProducts > 0 && (
                <button
                  type="button"
                  id={`${listId}-${rows.length - 1}`}
                  role="option"
                  aria-selected={cursor === rows.length - 1}
                  onMouseEnter={() => setCursor(rows.length - 1)}
                  onClick={() => go(`/anazitisi?q=${encodeURIComponent(data.query)}`)}
                  className={`t-card-cta flex w-full cursor-pointer items-center justify-between gap-3 border-t border-k-line px-4 py-3.5 text-left transition-colors ${
                    cursor === rows.length - 1
                      ? "bg-k-ink text-white"
                      : "bg-k-surface-2 text-k-ink hover:bg-k-ink hover:text-white"
                  }`}
                >
                  {upGreek(t("ola_ta_apotelesmata_2", { totalProducts: data.totalProducts }))}
                  <span aria-hidden>→</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-k-line last:border-b-0">
      <p className="t-account-label bg-k-surface-2 px-4 py-2 text-k-text-4">
        {upGreek(label)}
      </p>
      {children}
    </div>
  );
}

function ProductRow({
  id,
  product,
  query,
  active,
  exact = false,
  onSelect,
  onHover,
}: {
  id: string;
  product: import("@/lib/catalog/suggest-types").SuggestProduct;
  query: string;
  active: boolean;
  exact?: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("chrome.SearchSuggest");
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 text-left transition-colors ${
        active ? "bg-k-surface-2" : "bg-white"
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center border bg-white p-1 ${
          exact ? "border-k-red" : "border-k-line"
        }`}
      >
        {product.image ? (
          <Image
            src={product.image}
            alt=""
            width={64}
            height={64}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="t-brand-count text-k-text-5">—</span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          {product.brandName && (
            <span className="t-card-brand shrink-0 text-k-red">{product.brandName}</span>
          )}
          <span className="t-card-sku truncate text-k-text-5">
            <Highlight text={product.sku} query={query} />
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] leading-[1.35] font-medium text-k-ink">
          <Highlight text={product.name} query={query} />
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span className="block font-mono text-[13px] font-semibold text-k-ink">
          {product.priceNet != null
            ? formatPrice(product.priceNet, locale, { vatRate: product.vatRate })
            : "—"}
        </span>
        <span
          className={`t-brand-count mt-0.5 flex items-center justify-end gap-1.5 ${
            product.inStock ? "text-k-green" : "text-k-text-4"
          }`}
        >
          <span aria-hidden className="rounded-pill block h-1.5 w-1.5 bg-current" />
          {product.inStock ? `${product.qty} ${upGreek(t("tem"))}` : upGreek(t("katopin"))}
        </span>
      </span>
    </button>
  );
}

function TaxonomyRow({
  id,
  name,
  count,
  logo,
  query,
  active,
  onSelect,
  onHover,
}: {
  id: string;
  name: string;
  count: number;
  logo?: string | null;
  query: string;
  active: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const locale = useLocale();
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 text-left transition-colors ${
        active ? "bg-k-surface-2" : "bg-white"
      }`}
    >
      {logo !== undefined && (
        <span className="flex h-8 w-11 shrink-0 items-center justify-center">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={64}
              height={64}
              className="h-7 w-7 object-contain"
            />
          ) : null}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-k-ink">
        <Highlight text={name} query={query} />
      </span>
      <span className="t-brand-count shrink-0 font-mono text-k-text-4">
        {count.toLocaleString(locale)}
      </span>
    </button>
  );
}

/**
 * Bolds the matched run.
 *
 * Plain `indexOf` on the lower-cased strings, not `searchKey`: the normaliser
 * strips accents and changes length, so its offsets would not line up with the
 * text actually on screen and the highlight would drift.
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

function SuggestSkeleton() {
  return (
    <div className="p-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3.5 py-2.5">
          <span className="block h-11 w-11 shrink-0 animate-pulse bg-k-surface-3" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-2.5 w-24 animate-pulse bg-k-surface-3" />
            <span className="block h-3 w-2/3 animate-pulse bg-k-surface-3" />
          </span>
          <span className="block h-4 w-16 shrink-0 animate-pulse bg-k-surface-3" />
        </div>
      ))}
    </div>
  );
}
