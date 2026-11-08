"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useRouter } from "@/i18n/navigation";
import type { BrandTile, MenuCategory } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

/*
 * `prefetch={false}` σε κάθε σύνδεσμο αυτού του αρχείου.
 * ─────────────────────────────────────────────────────────────────────────────
 * Μετρημένο στην παραγωγή: μία επίσκεψη στο `/katalogos` έβγαζε **34** αιτήματα
 * RSC — 18 για κατηγορίες, 14 για την πλοήγηση και το υποσέλιδο, καθένα 450-780ms.
 * Κάθε ένα από αυτά είναι ΠΛΗΡΗΣ απόδοση στον διακομιστή, γιατί οι σελίδες
 * απαντούν `cache-control: no-store` (διαβάζουν καλάθι και γλώσσα από cookies).
 *
 * Δηλαδή ένας επισκέπτης παρήγαγε 34 renders, και με μερικούς ταυτόχρονους ο
 * διακομιστής κορεννύεται — γι' αυτό «αργεί σε ΟΛΕΣ τις σελίδες» και όχι σε μία.
 *
 * Η πλοήγηση και το υποσέλιδο είναι σε κάθε σελίδα και δείχνουν παντού· κανείς
 * δεν πρόκειται να πατήσει και τα δεκατέσσερα. Το prefetch έχει νόημα για τον
 * έναν σύνδεσμο που ΘΑ πατηθεί, όχι για τον κατάλογο των πάντων.
 */

/**
 * Mobile navigation drawer, owning its own burger trigger.
 *
 * Follows the handoff's mobile catalogue pattern: one accordion row per
 * category (index · name · count · caret), expanding to a #FAFAFB panel of
 * subcategories with a "ΟΛΕΣ ΟΙ N ΥΠΟΚΑΤΗΓΟΡΙΕΣ" link.
 *
 * Every touch target is at least 44px, per the handoff's own row heights.
 *
 * Portalled to <body>: inside the sticky header it was trapped in the header's
 * z-40 layer, so the cookie banner (z-50) sat on top of the open drawer.
 *
 * Opening pushes one history entry so the phone's back button closes the menu
 * instead of leaving the page. Links therefore pop that entry first and only
 * then navigate, or the next back press would land on a duplicate page.
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
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pendingHref = useRef<string | null>(null);

  function openMenu() {
    window.history.pushState({ ...window.history.state, kMenu: true }, "");
    setOpen(true);
  }

  function closeMenu() {
    if (window.history.state?.kMenu) window.history.back();
    else setOpen(false);
  }

  function follow(event: MouseEvent, href: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button) return;
    event.preventDefault();
    if (window.history.state?.kMenu) {
      pendingHref.current = href;
      window.history.back();
    } else {
      setOpen(false);
      router.push(href);
    }
  }

  // Lock body scroll while the drawer is open, and restore on close so the
  // page does not stay frozen if the drawer unmounts mid-transition.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.menuOpen = "true";
    return () => {
      document.body.style.overflow = previous;
      delete document.body.dataset.menuOpen;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const button = trigger.current;

    const onPop = () => {
      setOpen(false);
      const href = pendingHref.current;
      pendingHref.current = null;
      if (href) router.push(href);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
      if (e.key !== "Tab" || !panel.current) return;
      const items = [
        ...panel.current.querySelectorAll<HTMLElement>("a[href], button"),
      ];
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    // Rotating a tablet past `lg` hides the drawer; it must not leave the page locked.
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onDesktop = () => {
      if (desktop.matches) closeMenu();
    };

    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onDesktop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onDesktop);
      button?.focus({ preventScroll: true });
    };
  }, [open, router]);

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
        ref={trigger}
        type="button"
        aria-label={t("menoy")}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={openMenu}
        className="-ml-3 flex h-11 w-11 flex-col items-start justify-center gap-1 pl-3"
      >
        <span className="block h-0.5 w-5 bg-k-on-dark" />
        <span className="block h-0.5 w-5 bg-k-on-dark" />
        <span className="block h-0.5 w-3.5 bg-k-red" />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label={t("kleisimo_menoy")}
            tabIndex={-1}
            onClick={closeMenu}
            className="absolute inset-0 touch-none bg-black/50"
          />

          <div
            ref={panel}
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label={t("ploigisi")}
            className="absolute top-0 left-0 flex h-dvh w-[min(88vw,340px)] animate-[zone-slide-in_180ms_ease-out] flex-col bg-white motion-reduce:animate-none"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-k-line px-4">
              <span className="t-footer-col text-k-ink">
                {upGreek(t("menoy"))}
              </span>
              <button
                ref={closeButton}
                type="button"
                onClick={closeMenu}
                aria-label={t("kleisimo")}
                className="flex h-11 w-11 items-center justify-center text-2xl leading-none text-k-ink"
              >
                ×
              </button>
            </div>

            <div role="tablist" className="flex shrink-0 border-b border-k-line">
              {(
                [
                  ["categories", upGreek(t("katigories"))],
                  ["brands", "BRANDS"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
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

            {/* One scroller for everything below the tabs. The links used to be
                pinned here and took 269px, which left a phone in landscape with
                no room at all for the categories. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {tab === "categories" ? (
                <>
                  {categories.map((category, index) => {
                    const isOpen = expanded === category.id;
                    return (
                      <div key={category.id} className="border-b border-k-line">
                        <div className="flex items-stretch">
                          <Link
                            href={`/katalogos/${category.slug}`}
                            onClick={(e) => follow(e, `/katalogos/${category.slug}`)}
                            className={`flex min-h-[52px] flex-1 items-center gap-2.5 py-2 pl-4 ${
                              category.children.length > 0 ? "" : "pr-4"
                            }`}
                            prefetch={false}
                          >
                            <span className="t-cat-num shrink-0 text-k-red">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 flex-1 text-[length:var(--fs-13)] leading-[1.4] font-semibold text-k-ink">
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
                              aria-label={t(
                                isOpen
                                  ? "hide_subcategories"
                                  : "show_subcategories",
                                { name: category.name },
                              )}
                              onClick={() =>
                                setExpanded(isOpen ? null : category.id)
                              }
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
                                onClick={(e) =>
                                  follow(e, `/katalogos/${category.slug}?sub=${child.slug}`)
                                }
                                className="flex min-h-11 items-center gap-2.5 py-2 pr-4 pl-[34px] text-[length:var(--fs-12-5)] text-k-text-2"
                                prefetch={false}
                              >
                                <span className="block h-px w-3 shrink-0 bg-k-line-2" />
                                <span className="min-w-0 flex-1">
                                  {child.name}
                                </span>
                                <span className="t-brand-count text-k-text-5">
                                  {child.productCount.toLocaleString(locale)}
                                </span>
                              </Link>
                            ))}
                            <Link
                              href={`/katalogos/${category.slug}`}
                              onClick={(e) => follow(e, `/katalogos/${category.slug}`)}
                              className="flex min-h-11 items-center pr-4 pl-[34px] text-[length:var(--fs-10)] font-semibold tracking-[0.07em] text-k-red"
                              prefetch={false}
                            >
                              {upGreek(
                                t("oles_oi_ypokatigories", {
                                  childCount: category.childCount,
                                }),
                              )}{" "}
                              →
                            </Link>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <p className="px-4 py-4 text-[length:var(--fs-12)] text-k-text-3">
                    {totalCategories} {t("katigories_2")} {totalSubcategories}{" "}
                    {t("ypokatigories")} {totalProducts.toLocaleString(locale)}{" "}
                    {t("kodikoi")}
                  </p>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-px bg-k-line">
                  {brands.map((brand) => (
                    <Link
                      key={brand.id}
                      href={`/brands/${brand.slug}`}
                      onClick={(e) => follow(e, `/brands/${brand.slug}`)}
                      className="flex min-h-[68px] flex-col items-center justify-center gap-1 bg-white px-3 py-3"
                      prefetch={false}
                    >
                      <span className="t-brand-name text-k-ink">
                        {brand.name}
                      </span>
                      <span className="t-brand-count text-k-text-5">
                        {brand.productCount.toLocaleString(locale)}{" "}
                        {upGreek(t("kod"))}
                      </span>
                    </Link>
                  ))}
                </div>
              )}

              <div className="border-t border-k-line">
              {secondary.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={(e) => follow(e, link.href)}
                  className={`t-nav flex min-h-11 items-center gap-2 px-4 ${
                    link.accent ? "text-k-red" : "text-k-ink"
                  }`}
                  prefetch={false}
                >
                  {link.accent && (
                    <span className="block h-[5px] w-[5px] bg-k-red" />
                  )}
                  {link.label}
                </Link>
              ))}
              </div>
            </div>

            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">
              <Link
                href="/eisodos"
                onClick={(e) => follow(e, "/eisodos")}
                className="t-btn-sm flex min-h-12 items-center justify-center bg-k-ink text-white"
                prefetch={false}
              >
                {upGreek(t("syndesi_logariasmoy"))}
              </Link>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
