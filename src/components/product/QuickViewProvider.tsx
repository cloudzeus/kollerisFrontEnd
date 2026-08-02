"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { BuyNowButton } from "@/components/cart/BuyNowButton";
import { Link } from "@/i18n/navigation";
import { formatPercent, formatPrice, savingsOf } from "@/lib/format";
import { upGreek } from "@/lib/greek";

type QuickViewProduct = {
  id: string;
  slug: string;
  name: string;
  sku: string;
  mpn: string;
  ean: string;
  shortDescription: string | null;
  brand: { name: string; slug: string } | null;
  images: string[];
  priceNet: number | null;
  priceListNet: number | null;
  vatRate: number;
  qty: number;
  inStock: boolean;
  specs: Array<{ label: string; value: string }>;
};

const QuickViewContext = createContext<{ open: (slug: string) => void } | null>(null);

export function useQuickView() {
  const ctx = useContext(QuickViewContext);
  // Cards render on pages without the provider (e.g. the PDP related row);
  // a no-op keeps them working instead of throwing.
  return ctx ?? { open: () => {} };
}

/**
 * Quick view: one modal for the whole grid, opened by slug.
 *
 * Data is fetched on open — see the route handler for why the grid does not
 * carry it. Responses are memoised for the session so reopening the same card
 * is instant.
 */
export function QuickViewProvider({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("product.QuickViewProvider");
  const [slug, setSlug] = useState<string | null>(null);
  /*
   * The cache IS the state. Deriving `product` from it during render — rather
   * than copying it into a second state inside an effect — is what keeps the
   * cache-hit path free of a synchronous setState (which would cascade a
   * render) and removes a whole class of "which one is stale" bugs.
   */
  const [cache, setCache] = useState<Record<string, QuickViewProduct>>({});
  const [failedSlug, setFailedSlug] = useState<string | null>(null);

  const open = useCallback((next: string) => {
    setFailedSlug(null);
    setSlug(next);
  }, []);
  const close = useCallback(() => setSlug(null), []);

  const product = slug ? (cache[slug] ?? null) : null;
  const state: "idle" | "loading" | "error" =
    slug == null || product ? "idle" : failedSlug === slug ? "error" : "loading";

  useEffect(() => {
    if (!slug || cache[slug]) return;

    const controller = new AbortController();
    fetch(`/api/quick-view/${slug}?locale=${locale}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: QuickViewProduct) => setCache((c) => ({ ...c, [slug]: data })))
      .catch((error) => {
        if (error.name !== "AbortError") setFailedSlug(slug);
      });

    return () => controller.abort();
  }, [slug, locale, cache]);

  useEffect(() => {
    if (!slug) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [slug, close]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <QuickViewContext.Provider value={value}>
      {children}

      {slug && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <button
            type="button"
            aria-label={t("kleisimo")}
            tabIndex={-1}
            onClick={close}
            className="absolute inset-0 bg-black/55"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label={product?.name ?? "Γρήγορη προβολή"}
            className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden bg-white"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-k-line px-4 py-3 lg:px-6">
              <span className="t-eyebrow text-k-red">{upGreek(t("grigori_provoli"))}</span>
              <button
                type="button"
                onClick={close}
                aria-label={t("kleisimo")}
                className="flex h-10 w-10 items-center justify-center text-2xl leading-none text-k-ink"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {state === "loading" && (
                <div className="grid gap-6 p-4 sm:grid-cols-2 lg:p-6">
                  <div className="h-[260px] animate-pulse bg-k-surface-3" />
                  <div className="space-y-3">
                    <div className="h-3 w-24 animate-pulse bg-k-surface-3" />
                    <div className="h-6 w-full animate-pulse bg-k-surface-3" />
                    <div className="h-6 w-2/3 animate-pulse bg-k-surface-3" />
                    <div className="h-10 w-40 animate-pulse bg-k-surface-3" />
                  </div>
                </div>
              )}

              {state === "error" && (
                <p className="p-10 text-center text-[13px] text-k-text-3">
                  {t("den_itan_dynati_i_fortosi")}
                </p>
              )}

              {product && <QuickViewBody product={product} onNavigate={close} />}
            </div>
          </div>
        </div>
      )}
    </QuickViewContext.Provider>
  );
}

function QuickViewBody({
  product,
  onNavigate,
}: {
  product: QuickViewProduct;
  onNavigate: () => void;
}) {
  const t = useTranslations("product.QuickViewProvider");
  const ctx = { vatRate: product.vatRate };
  const saving =
    product.priceListNet != null && product.priceNet != null
      ? savingsOf(product.priceListNet, product.priceNet, ctx)
      : null;

  return (
    <div className="grid gap-6 p-4 sm:grid-cols-2 lg:gap-8 lg:p-6">
      <div className="relative flex h-[240px] items-center justify-center border border-k-line bg-k-surface-2 p-6 lg:h-[340px]">
        {saving && (
          <span className="t-badge absolute top-0 left-0 bg-k-red px-2 py-1 text-white">
            {formatPercent(saving.percent)}
          </span>
        )}
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            width={520}
            height={520}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span className="t-footer-tag text-k-text-4">{upGreek(t("choris_eikona"))}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        {product.brand && (
          <p className="t-card-brand text-k-red">{upGreek(product.brand.name)}</p>
        )}
        <h2 className="font-artegra mt-2 text-[18px] leading-[1.28] font-medium text-k-ink">
          {product.name}
        </h2>
        <p className="t-card-sku mt-1.5 text-k-text-4">
          {product.sku}
          {product.mpn !== "—" && ` · ${product.mpn}`}
        </p>

        {product.shortDescription && (
          <p className="t-body-sm mt-3 text-k-text-2">{product.shortDescription}</p>
        )}

        <div className="mt-4 flex items-end gap-3">
          {saving && product.priceListNet != null && (
            <span className="t-card-was text-k-text-5 line-through">
              {formatPrice(product.priceListNet, ctx)}
            </span>
          )}
          <span className="font-mono text-[28px] leading-none font-semibold text-k-ink">
            {product.priceNet != null ? formatPrice(product.priceNet, ctx) : "—"}
          </span>
        </div>
        <p className="t-card-vat mt-1 text-k-text-5">
          {upGreek(`με ΦΠΑ ${product.vatRate}%`)}
        </p>

        <p
          className={`t-card-stock mt-3 flex items-center gap-2 ${
            product.inStock ? "text-k-green" : "text-k-text-4"
          }`}
        >
          <span className="rounded-pill block h-1.5 w-1.5 bg-current" />
          {product.inStock
            ? `${upGreek(t("amesa_diathesimo"))} · ${product.qty} ${upGreek(t("tem"))}`
            : upGreek(t("katopin_paraggelias"))}
        </p>

        {product.specs.length > 0 && (
          <dl className="mt-4 border-t border-k-line">
            {product.specs.slice(0, 5).map((spec) => (
              <div key={spec.label} className="flex gap-3 border-b border-k-line py-2">
                <dt className="w-1/2 shrink-0 text-[12px] text-k-text-3">{spec.label}</dt>
                <dd className="min-w-0 flex-1 font-mono text-[12px] font-medium text-k-ink">
                  {spec.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
          <AddToCartButton
            productId={product.id}
            className="t-btn h-12 flex-1 bg-k-red text-white transition-colors hover:bg-k-red-hover"
          />
          <BuyNowButton
            productId={product.id}
            disabled={product.priceNet == null}
            className="t-btn-sm flex h-12 items-center justify-center border-[1.5px] border-k-ink px-5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
          />
          <Link
            href={`/proion/${product.slug}`}
            onClick={onNavigate}
            className="t-btn-sm flex h-12 items-center justify-center border-[1.5px] border-k-ink px-5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
          >
            {upGreek(t("pliri_stoicheia"))} →
          </Link>
        </div>
      </div>
    </div>
  );
}
