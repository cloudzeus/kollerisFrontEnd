"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { Link } from "@/i18n/navigation";
import type { BrandTile, MenuCategory } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

/**
 * Mobile navigation drawer, owning its own burger trigger.
 *
 * Follows the handoff's mobile catalogue pattern: one accordion row per
 * category (index · name · count · caret), expanding to a #FAFAFB panel of
 * subcategories with a "ΟΛΕΣ ΟΙ N ΥΠΟΚΑΤΗΓΟΡΙΕΣ" link.
 *
 * Every touch target is at least 44px, per the handoff's own row heights.
 */
export function MobileMenu({
  categories,
  brands,
  totalCategories,
  totalSubcategories,
  totalProducts,
}: {
  categories: MenuCategory[];
  brands: BrandTile[];
  totalCategories: number;
  totalSubcategories: number;
  totalProducts: number;
}) {
  const locale = useLocale();
  const t = useTranslations("chrome.MobileMenu");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"categories" | "brands">("categories");
  const panelId = useId();

  // Lock body scroll while the drawer is open, and restore on close so the
  // page does not stay frozen if the drawer unmounts mid-transition.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const secondary = [
    { href: "/prosfores", label: upGreek(t("prosfores")), accent: true },
    { href: "/nees-afixeis", label: upGreek(t("nees_afixeis")) },
    { href: "/etaireia", label: upGreek(t("i_etaireia")) },
    { href: "/epikoinonia", label: upGreek(t("epikoinonia")) },
    { href: "/blog", label: "BLOG" },
  ];

  return (
    <>
      <button
        type="button"
        aria-label={t("menoy")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className="flex h-11 w-6 flex-col justify-center gap-1"
      >
        <span className="block h-0.5 w-5 bg-k-ink" />
        <span className="block h-0.5 w-5 bg-k-ink" />
        <span className="block h-0.5 w-3.5 bg-k-red" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={t("kleisimo_menoy")}
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/50"
          />

          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label={t("ploigisi")}
            className="absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col bg-white"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-k-line px-4">
              <span className="t-footer-col text-k-ink">{upGreek(t("menoy"))}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("kleisimo")}
                className="flex h-11 w-11 items-center justify-center text-2xl leading-none text-k-ink"
              >
                ×
              </button>
            </div>

            <div className="flex shrink-0 border-b border-k-line">
              {(
                [
                  ["categories", upGreek(t("katigories"))],
                  ["brands", "BRANDS"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={tab === key ? "true" : undefined}
                  className={`t-nav h-11 flex-1 border-b-2 transition-colors ${
                    tab === key
                      ? "border-k-red text-k-ink"
                      : "border-transparent text-k-text-4"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {tab === "categories" ? (
                <>
                  {categories.map((category, index) => {
                    const isOpen = expanded === category.id;
                    return (
                      <div key={category.id} className="border-b border-k-line">
                        <div className="flex items-stretch">
                          <Link
                            href={`/katalogos/${category.slug}`}
                            onClick={() => setOpen(false)}
                            className={`flex min-h-[52px] flex-1 items-center gap-2.5 py-2 pl-4 ${
                              category.children.length > 0 ? "" : "pr-4"
                            }`}
                          >
                            <span className="t-cat-num shrink-0 text-k-red">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 flex-1 text-[13px] leading-[1.4] font-semibold text-k-ink">
                              {upGreek(category.name)}
                            </span>
                            <span className="t-card-was shrink-0 text-k-text-5">
                              {category.productCount.toLocaleString(locale)}
                            </span>
                          </Link>

                          {category.children.length > 0 && (
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={t(isOpen ? "hide_subcategories" : "show_subcategories", { name: category.name })}
                              onClick={() => setExpanded(isOpen ? null : category.id)}
                              className="flex w-11 shrink-0 items-center justify-center text-k-text-4"
                            >
                              <span
                                className={`block text-lg transition-transform ${
                                  isOpen ? "rotate-90 text-k-red" : ""
                                }`}
                              >
                                ›
                              </span>
                            </button>
                          )}
                        </div>

                        {isOpen && (
                          <div className="bg-k-surface-2 pt-1.5 pb-3">
                            {category.children.map((child) => (
                              <Link
                                key={child.id}
                                href={`/katalogos/${category.slug}?sub=${child.slug}`}
                                onClick={() => setOpen(false)}
                                className="flex min-h-11 items-center gap-2.5 py-2 pr-4 pl-[34px] text-[12.5px] text-k-text-2"
                              >
                                <span className="block h-px w-3 shrink-0 bg-k-line-2" />
                                <span className="min-w-0 flex-1">{child.name}</span>
                                <span className="t-brand-count text-k-text-5">
                                  {child.productCount.toLocaleString(locale)}
                                </span>
                              </Link>
                            ))}
                            <Link
                              href={`/katalogos/${category.slug}`}
                              onClick={() => setOpen(false)}
                              className="block pt-2 pr-4 pl-[34px] text-[10px] font-semibold tracking-[0.07em] text-k-red"
                            >
                              {upGreek(t("oles_oi_ypokatigories", { childCount: category.childCount }))} →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <p className="px-4 py-4 text-[12px] text-k-text-3">
                    {totalCategories} {t("katigories_2")} {totalSubcategories} {t("ypokatigories")}{" "}
                    {totalProducts.toLocaleString(locale)} {t("kodikoi")}
                  </p>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-px bg-k-line">
                  {brands.map((brand) => (
                    <Link
                      key={brand.id}
                      href={`/brands/${brand.slug}`}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[68px] flex-col items-center justify-center gap-1 bg-white px-3 py-3"
                    >
                      <span className="t-brand-name text-k-ink">{brand.name}</span>
                      <span className="t-brand-count text-k-text-5">
                        {brand.productCount.toLocaleString(locale)} {upGreek(t("kod"))}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-k-line">
              {secondary.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`t-nav flex min-h-11 items-center gap-2 px-4 ${
                    link.accent ? "text-k-red" : "text-k-ink"
                  }`}
                >
                  {link.accent && <span className="block h-[5px] w-[5px] bg-k-red" />}
                  {link.label}
                </Link>
              ))}
              <Link
                href="/eisodos"
                onClick={() => setOpen(false)}
                className="t-btn-sm flex min-h-12 items-center justify-center bg-k-ink text-white"
              >
                {upGreek(t("syndesi_logariasmoy"))}
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
