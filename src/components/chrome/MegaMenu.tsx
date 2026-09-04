"use client";

import { useLocale } from "next-intl";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import { logoScaleStyle } from "@/lib/catalog/brand-logo";
import { Link } from "@/i18n/navigation";
import type {
  BrandTile,
  MenuCategory,
  ProductCardData,
} from "@/lib/catalog/queries";
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

type Panel = "categories" | "brands" | null;

/** Roots shown in the panel; the remainder sit behind the footer link. */
const MEGA_CATEGORY_LIMIT = 12;
/** Children shown per root. */
const MEGA_CHILD_LIMIT = 4;

/** Balance the roots across N columns by product count, biggest first. */
function distribute(items: MenuCategory[], columns: number): MenuCategory[][] {
  const buckets: MenuCategory[][] = Array.from({ length: columns }, () => []);
  const weights = new Array(columns).fill(0);
  for (const item of items) {
    let lightest = 0;
    for (let i = 1; i < columns; i++)
      if (weights[i] < weights[lightest]) lightest = i;
    buckets[lightest].push(item);
    // A root's visual height is its own row plus one per child shown.
    weights[lightest] += 1 + Math.min(item.children.length, MEGA_CHILD_LIMIT);
  }
  return buckets;
}

/**
 * Desktop mega-menus for ΚΑΤΗΓΟΡΙΕΣ and BRANDS.
 *
 * Opens on hover per the handoff, but is built on real buttons with
 * `aria-expanded` so it is reachable by keyboard and screen readers too —
 * hover alone would make the entire catalogue navigation mouse-only.
 *
 * Closing is deferred by a short timer: the pointer has to cross a 1px gap
 * between the tab and the panel, and closing instantly on `mouseleave` makes
 * the menu impossible to enter.
 */
export function MegaMenu({
  categories,
  brands,
  featured,
  totalCategories,
  totalSubcategories,
  totalProducts,
  totalBrands,
}: {
  categories: MenuCategory[];
  brands: BrandTile[];
  featured: ProductCardData | null;
  totalCategories: number;
  totalSubcategories: number;
  totalProducts: number;
  totalBrands: number;
}) {
  const locale = useLocale();
  const t = useTranslations("chrome.MegaMenu");
  const [open, setOpen] = useState<Panel>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const show = useCallback(
    (panel: Panel) => {
      cancelClose();
      setOpen(panel);
    },
    [cancelClose],
  );

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(null), 120);
  }, [cancelClose]);

  /**
   * Showing all 23 roots with five children each made the panel ~890px tall —
   * past the fold on a 900px screen, with the footer row unreachable. The
   * handoff's panel is a shortlist; the full tree is one click away via the
   * footer link.
   */
  const shortlist = categories.slice(0, MEGA_CATEGORY_LIMIT);
  const indexOf = new Map(shortlist.map((c, i) => [c.id, i + 1]));
  const columns = distribute(shortlist, 4);

  return (
    <div
      className="flex items-stretch"
      onMouseLeave={scheduleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(null);
      }}
    >
      {/* ── ΚΑΤΗΓΟΡΙΕΣ ─────────────────────────────────────────── */}
      <div className="static" onMouseEnter={() => show("categories")}>
        <button
          type="button"
          aria-expanded={open === "categories"}
          aria-haspopup="true"
          onClick={() => setOpen(open === "categories" ? null : "categories")}
          onFocus={() => show("categories")}
          /*
            Ο ενεργοποιητής των κατηγοριών είναι ΚΟΚΚΙΝΟ ΚΕΙΜΕΝΟ, όχι κόκκινο
            πλακίδιο. Σε λευκή μπάρα το πλακίδιο ήταν το άγκυρο σημείο· σε
            σκούρα μπάρα γίνεται μπάλωμα, και το κόκκινο πάνω στο σκούρο έχει
            ήδη αρκετή ένταση για να τραβήξει το μάτι χωρίς φόντο.
          */
          className={`t-nav-cond flex h-[46px] items-center gap-1.5 px-[18px] transition-colors ${
            open === "categories" ? "text-k-red-hover" : "text-k-red"
          }`}
        >
          {upGreek(t("katigories"))}
          <span className="text-[9px]">▾</span>
        </button>

        {open === "categories" && (
          <div
            className="shell-x absolute inset-x-0 top-full z-30 max-h-[calc(100vh-var(--header-h)-46px)] overflow-y-auto border-t border-k-line bg-white shadow-[0_18px_40px_rgba(0,0,0,.10)]"
            onMouseEnter={cancelClose}
          >
            <div className="grid grid-cols-[repeat(4,1fr)_300px]">
              {columns.map((column, i) => (
                <div
                  key={i}
                  className="border-r border-[#F0F0F2] py-[26px] pr-[26px]"
                >
                  {column.map((category) => (
                    <div key={category.id} className="mb-[22px] last:mb-0">
                      <div className="mb-[9px] flex items-baseline gap-2">
                        <span className="t-cat-num text-k-red">
                          {String(indexOf.get(category.id) ?? 0).padStart(
                            2,
                            "0",
                          )}
                        </span>
                        <Link
                          href={`/katalogos/${category.slug}`}
                          className="text-[11.5px] leading-[1.3] font-bold tracking-[0.05em] text-k-ink transition-colors hover:text-k-red"
                          prefetch={false}
                        >
                          {upGreek(category.name)}
                        </Link>
                      </div>
                      <div className="flex flex-col gap-[5px]">
                        {category.children
                          .slice(0, MEGA_CHILD_LIMIT)
                          .map((child) => (
                            <Link
                              key={child.id}
                              href={`/katalogos/${category.slug}?sub=${child.slug}`}
                              className="text-[12px] leading-[1.4] text-k-text-3 transition-colors hover:text-k-red"
                              prefetch={false}
                            >
                              {child.name}
                            </Link>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}

              {/* Featured product tile */}
              <div className="py-[26px] pl-[26px]">
                <p className="t-account-label mb-3 text-k-text-4">
                  {upGreek(t("proteinomeno"))}
                </p>
                {featured ? (
                  <div className="flex flex-col gap-3.5 bg-k-surface-3 p-5">
                    {featured.image && (
                      <Image
                        src={featured.image}
                        alt={featured.name}
                        width={260}
                        height={150}
                        className="block h-[150px] w-full object-contain"
                      />
                    )}
                    <div>
                      <p className="t-cat-num text-k-red">
                        {featured.brandName}
                      </p>
                      <p className="mt-[5px] line-clamp-2 text-[13px] leading-[1.35] font-semibold text-k-ink">
                        {featured.name}
                      </p>
                      <p className="t-card-was mt-1 text-k-text-4">
                        {featured.sku}
                      </p>
                    </div>
                    <Link
                      href={`/proion/${featured.slug}`}
                      className="t-link-mono self-start border-b-[1.5px] border-k-red pb-0.5 text-k-ink"
                      prefetch={false}
                    >
                      {upGreek(t("deite_to"))} →
                    </Link>
                  </div>
                ) : (
                  <div className="h-[150px] bg-k-surface-3" />
                )}
              </div>
            </div>

            <div className="mt-1 flex items-center justify-between border-t border-[#F0F0F2] py-4">
              <p className="text-[12px] text-k-text-3">
                {totalCategories} {t("vasikes_katigories")} {totalSubcategories}{" "}
                {t("ypokatigories")} {totalProducts.toLocaleString(locale)}{" "}
                {t("kodikoi")}
              </p>
              <Link
                href="/katalogos"
                className="t-link-mono text-k-ink hover:text-k-red"
                prefetch={false}
              >
                {upGreek(t("oles_oi_katigories"))} →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── BRANDS ─────────────────────────────────────────────── */}
      <div className="static" onMouseEnter={() => show("brands")}>
        <button
          type="button"
          aria-expanded={open === "brands"}
          aria-haspopup="true"
          onClick={() => setOpen(open === "brands" ? null : "brands")}
          onFocus={() => show("brands")}
          /*
            `text-k-ink` εδώ σήμαινε ΑΟΡΑΤΟ.
            ────────────────────────────────────────────────────────────────
            Το κουμπί υπήρχε πάντα· απλώς ήταν σκούρο κείμενο, και όταν η μπάρα
            έγινε σκούρα εξαφανίστηκε τελείως. Ο πελάτης το ανέφερε ως «λείπει
            το link με τα brands» — δεν έλειπε, ήταν γραμμένο με το χρώμα του
            φόντου.

            Ο κανόνας που βγαίνει: χρώμα κειμένου δηλωμένο απόλυτα μέσα σε
            component που μπορεί να αλλάξει φόντο είναι βόμβα με χρονοδιακόπτη.
            Ό,τι κάθεται στο chrome μιλά πια σε `k-on-dark-*`.
          */
          className={`t-nav-cond flex h-[46px] items-center gap-1.5 px-[18px] transition-colors ${
            open === "brands"
              ? "text-white"
              : "text-k-on-dark-2 hover:text-white"
          }`}
        >
          BRANDS
          <span className="text-[9px]">▾</span>
        </button>

        {open === "brands" && (
          <div
            className="shell-x absolute inset-x-0 top-full z-30 border-t border-k-line bg-white py-[26px] shadow-[0_18px_40px_rgba(0,0,0,.10)]"
            onMouseEnter={cancelClose}
          >
            <div className="mb-[18px] flex items-baseline justify-between">
              <p className="text-[12px] font-bold tracking-[0.06em] text-k-ink">
                {upGreek(t("antiprosopeyomena_brands"))}
              </p>
              <Link
                href="/brands"
                className="t-link-mono text-k-ink hover:text-k-red"
                prefetch={false}
              >
                {upGreek(t("ola_ta", { totalBrands: totalBrands }))} →
              </Link>
            </div>
            <div className="grid grid-cols-6 gap-px border border-k-line bg-k-line">
              {brands.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.slug}`}
                  className="group relative flex h-[76px] items-center justify-center bg-white px-4 outline-1 -outline-offset-1 outline-transparent transition-[outline-color] hover:outline-k-red"
                  prefetch={false}
                >
                  {brand.logo ? (
                    /*
                     * HDCtool stores τα λογότυπα ως 256×256 τετράγωνα με το
                     * σήμα letterboxed μέσα σε διαφανή περιθώρια — γι' αυτό το
                     * κελί είναι τετράγωνο: περιορίζοντας το ύψος θα περιόριζε
                     * τα περιθώρια, όχι το σήμα.
                     *
                     * ── Κανένας επαναχρωματισμός στο hover ──────────────────
                     *
                     * Το κελί σκούραινε και το λογότυπο περνούσε από
                     * `brightness-0 invert`, που κάνει ΚΑΘΕ ορατό εικονοστοιχείο
                     * λευκό. Δουλεύει μόνο για σήματα πάνω σε διαφάνεια. Από τα
                     * 43 λογότυπα του καταλόγου, 10 έχουν συμπαγές φόντο
                     * (MAKITA, METABO, LOCTITE, LEATHERMAN, CISA, FERODO,
                     * IZELTAS, GRACO, BULLE, Bosch Accessories) — μετρημένο,
                     * 0% διαφανή εικονοστοιχεία. Αυτά γίνονταν λευκό πλακίδιο
                     * και το σήμα εξαφανιζόταν.
                     *
                     * Και ανεξάρτητα από αυτό: ένα λογότυπο μάρκας δεν
                     * επαναχρωματίζεται. Είναι ξένο σήμα με δικούς του κανόνες,
                     * και το ίδιο το design system το λέει ρητά για το δικό μας.
                     *
                     * Το hover το δηλώνει το κόκκινο περίγραμμα — η γλώσσα του
                     * συστήματος — και το πλακίδιο μένει λευκό.
                     */
                    <Image
                      src={brand.logo}
                      alt={brand.name}
                      width={128}
                      height={128}
                      style={logoScaleStyle(brand.slug)}
                      className="block h-16 w-16 object-contain"
                    />
                  ) : (
                    <span className="text-[12px] font-semibold tracking-[0.04em] text-k-text-2 transition-colors group-hover:text-k-red">
                      {brand.name}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
