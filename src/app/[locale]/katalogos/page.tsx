import { getLocale } from "next-intl/server";
import { pageMeta } from "@/lib/seo/urls";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Image from "next/image";
import { setRequestLocale } from "next-intl/server";
import { SectionHead } from "@/components/chrome/SectionHead";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { CategoryPicker } from "@/components/catalogue/CategoryPicker";
import { TaxonomyFinder } from "@/components/catalogue/TaxonomyFinder";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueIndex,
  type CatalogueRoot,
} from "@/lib/catalog/catalogue-index";
import type { CatalogueNode } from "@/lib/catalog/catalogue-index-types";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";
import { Zone } from "@/components/zones/Zone";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "katalogos.page" });
  const title = t("titlos_katalogos");
  const description = t("perigrafi_oles_oi_katigories_ergaleion");
  return {
    /* Canonical, γλώσσες και Open Graph μαζί: το `openGraph` κληρονομείται
       ολόκληρο από όποια σελίδα δεν ορίζει δικό της, οπότε 12 από 16 σελίδες
       μοιράζονταν με τον τίτλο της αρχικής. */
    ...pageMeta({ path: "/katalogos", locale, title, description }),
    title,
    description,
  };
}

/**
 * Catalogue index.
 *
 * The taxonomy is genuinely a maze — 490 nodes hold stock across three levels —
 * and it is lopsided: ΕΡΓΑΛΕΙΑ ΧΕΙΡΟΣ alone is 72% of the catalogue while five
 * categories have under six products each. So this page refuses the obvious
 * layout, a grid of 23 equal tiles, because equal tiles would give a category
 * with one product the same weight as one with 3.797.
 *
 * Four devices instead:
 *
 *  1. A FINDER over all 490 nodes with their paths — the only thing that helps
 *     someone who knows the word but not the branch.
 *  2. A FEATURE tile for the dominant category, opened up with its eight
 *     biggest subcategories so the level can be skipped entirely.
 *  3. STANDARD tiles for the working middle, each carrying its top four
 *     children for the same reason.
 *  4. A compact LIST for the tail, which as full tiles would be 5 squares of
 *     white around a single product.
 */
export default async function CataloguePage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("katalogos.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const [index, menuTree, brands, stats, rootCategories, miniCart] =
    await Promise.all([
      getCatalogueIndex(locale),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
    ]);

  const feature = index.roots.filter((r) => r.tier === "feature");
  const standard = index.roots.filter((r) => r.tier === "standard");
  const tail = index.roots.filter((r) => r.tier === "tail");

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />

      <main id="main">
        <Zone id="catalogue.top" locale={locale} />
        <div className="shell-x bg-k-ink-deep">
          <nav
            aria-label="Breadcrumb"
            className="t-util flex h-11 items-center gap-2.5 text-white/45"
          >
            <Link
              href="/"
              className="text-white/60 hover:text-white"
              prefetch={false}
            >
              {upGreek(t("archiki"))}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek(t("katalogos"))}</span>
          </nav>

          <div className="pt-2.5 pb-8">
            <h1 className="font-display text-[22px] leading-[1.16] t-display text-balance text-white lg:text-[30px]">
              {upGreek(t("olos_o_katalogos"))}
            </h1>
            <p className="mt-3.5 max-w-[660px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              {index.totals.products.toLocaleString(locale)} {t("kodikoi_se")}{" "}
              {index.totals.categories} {t("katigories")} {index.totals.groups}{" "}
              {t("omades_kai")} {index.totals.subgroups}{" "}
              {t("ypokatigories_einai_polla_gi_apos")}
            </p>
          </div>
        </div>

        {/* 1 — Finder */}
        <section className="band-alt border-y border-k-line">
          <div className="shell-x py-6 lg:py-8">
            <TaxonomyFinder nodes={index.all} />
          </div>
        </section>

        {/* 2 — The dominant category, opened up */}
        {feature.length > 0 && (
          <section className="band-base">
            <div className="shell-x py-8 lg:py-12">
              <SectionHead
                eyebrow={t("o_kyrios_ogkos")}
                title={
                  feature.length === 1
                    ? t("ta_toy_katalogoy", { topShare: index.totals.topShare })
                    : t("oi_megales_katigories")
                }
                lead={t("mia_katigoria_krata_ta_perissotera")}
              />
              <div className="mt-7 flex flex-col gap-px border border-k-line bg-k-line lg:mt-9">
                {feature.map((root) => (
                  <FeatureTile key={root.slug} root={root} nodes={index.all} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 3 — The working middle */}
        {standard.length > 0 && (
          <section className="band-alt border-t border-k-line">
            <div className="shell-x py-8 lg:py-12">
              <SectionHead
                eyebrow={t("katigories", { length: standard.length })}
                title={t("oi_ypoloipes_katigories")}
                lead={t("kathe_plakidio_deichnei_tis_tesseris")}
              />
              <div className="mt-7 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-9 lg:grid-cols-3 xl:grid-cols-4">
                {standard.map((root) => (
                  <StandardTile key={root.slug} root={root} nodes={index.all} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* 4 — The tail */}
        {tail.length > 0 && (
          <section className="band-base border-t border-k-line">
            <div className="shell-x py-8 lg:py-12">
              <SectionHead
                eyebrow={t("mikres_katigories")}
                title={t("ligoi_kodikoi_alla_yparchoyn")}
                lead={t("katigories_me_ligoteroys_apo_55")}
              />
              <ul className="mt-7 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-9 lg:grid-cols-3">
                {tail.map((root) => (
                  <li key={root.slug}>
                    <Link
                      href={`/katalogos/${root.slug}`}
                      className="flex items-center justify-between gap-4 bg-white px-4 py-3.5 transition-colors hover:bg-k-surface-2 lg:px-5"
                      prefetch={false}
                    >
                      <span className="t-cat-name min-w-0 flex-1 truncate text-k-ink">
                        {root.name}
                      </span>
                      <span className="t-brand-count shrink-0 font-mono text-k-text-4">
                        {root.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Brands as the other axis into the catalogue */}
        <section className="band-ink band-grid">
          <div className="rule-hazard" />
          <div className="shell-x py-9 lg:py-12">
            <SectionHead
              tone="dark"
              eyebrow={t("o_allos_dromos")}
              title={t("psachnete_me_brand")}
              lead={t("an_xerete_ton_kataskeyasti_alla")}
              meta={
                <Link
                  href="/brands"
                  className="t-btn-sm inline-block bg-k-red px-7 py-4 text-white transition-colors hover:bg-k-red-hover"
                  prefetch={false}
                >
                  {upGreek(t("ola_ta_brands"))} →
                </Link>
              }
            />
          </div>
        </section>
        <Zone id="catalogue.bottom" locale={locale} />
      </main>

      <SiteFooter categories={rootCategories} />
    </>
  );
}

/**
 * The dominant category, laid out wide.
 *
 * Its eight biggest children sit on the tile itself. With 33 groups and 187
 * subgroups under it, the alternative is a tile that says "3.797 κωδικοί" and
 * drops you into a page where you still have to choose.
 */
async function FeatureTile({
  root,
  nodes,
}: {
  root: CatalogueRoot;
  nodes: CatalogueNode[];
}) {
  const locale = await getLocale();
  const t = await getTranslations("katalogos.page");
  return (
    <div className="grid bg-white lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Link
        href={`/katalogos/${root.slug}`}
        className="group/feat flex flex-col justify-between gap-5 border-b border-k-line p-5 transition-colors hover:bg-k-surface-2 lg:border-r lg:border-b-0 lg:p-7"
        prefetch={false}
      >
        <div className="min-w-0">
          <p className="t-eyebrow flex items-center gap-2.5 text-k-red">
            <span aria-hidden className="rule-accent block shrink-0" />
            {upGreek(t("katigoria"))}
          </p>
          <p className="font-display t-display mt-3 text-[19px] leading-[1.2] text-balance text-k-ink transition-colors group-hover/feat:text-k-red lg:text-[24px]">
            {upGreek(root.name)}
          </p>
          <p className="mt-3 text-[12.5px] leading-[1.6] text-k-text-3">
            {root.groupCount} {t("omades")} {root.subgroupCount}{" "}
            {t("ypokatigories")}
          </p>
        </div>

        <div className="flex items-end justify-between gap-4">
          <span>
            <span className="block font-mono text-[30px] leading-none font-semibold text-k-ink lg:text-[38px]">
              {root.count.toLocaleString(locale)}
            </span>
            <span className="t-account-label mt-1.5 block text-k-text-4">
              {upGreek(t("kodikoi"))}
            </span>
          </span>
          {root.image && (
            <Image
              src={root.image}
              alt=""
              width={140}
              height={140}
              className="block h-[76px] w-[76px] shrink-0 object-contain lg:h-[92px] lg:w-[92px]"
            />
          )}
        </div>
      </Link>

      <div className="p-5 lg:p-7">
        <p className="t-account-label text-k-text-4">
          {upGreek(t("pigainete_apeytheias_se"))}
        </p>
        <ul className="mt-3.5 grid gap-px bg-k-line sm:grid-cols-2 xl:grid-cols-4">
          {root.children.map((child) => (
            <li key={child.slug}>
              <Link
                href={`/katalogos/${child.slug}`}
                className="flex h-full flex-col justify-between gap-2 bg-white px-3.5 py-3 transition-colors hover:bg-k-surface-2"
                prefetch={false}
              >
                <span className="text-[12.5px] leading-[1.35] font-medium text-k-ink">
                  {child.name}
                </span>
                <span className="t-brand-count font-mono text-k-text-4">
                  {child.count.toLocaleString(locale)} {upGreek(t("kod"))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {/*
          Opens the rest in place rather than navigating. With 220 children,
          "go to the category page and choose there" costs a page load, and a
          second one to come back if none of them was right.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2.5">
          <CategoryPicker
            root={root.name}
            nodes={nodes}
            label={t("kai_oi_ypoloipes", {
              n: root.groupCount + root.subgroupCount - root.children.length,
            })}
          />
          <Link
            href={`/katalogos/${root.slug}`}
            className="t-brand-count text-k-text-4 underline underline-offset-4 transition-colors hover:text-k-ink"
            prefetch={false}
          >
            {upGreek(t("i_deite_ola_ta_proionta"))} →
          </Link>
        </div>
      </div>
    </div>
  );
}

/** A working-middle category, with its four biggest children inline. */
async function StandardTile({
  root,
  nodes,
}: {
  root: CatalogueRoot;
  nodes: CatalogueNode[];
}) {
  const locale = await getLocale();
  const t = await getTranslations("katalogos.page");
  const remaining =
    root.groupCount + root.subgroupCount - Math.min(4, root.children.length);

  return (
    <div className="flex flex-col bg-white p-4 transition-colors hover:bg-k-surface-2 lg:p-5">
      <Link
        href={`/katalogos/${root.slug}`}
        className="group/tile flex items-start gap-3"
        prefetch={false}
      >
        <span className="min-w-0 flex-1">
          <span className="t-cat-name block text-balance text-k-ink transition-colors group-hover/tile:text-k-red">
            {root.name}
          </span>
          <span className="t-brand-count mt-1.5 block text-k-text-4">
            {root.count.toLocaleString(locale)} {upGreek(t("kod"))} ·{" "}
            {root.subgroupCount || root.groupCount}{" "}
            {upGreek(t("ypokatigories"))}
          </span>
        </span>
        {root.image && (
          <Image
            src={root.image}
            alt=""
            width={96}
            height={96}
            className="block h-11 w-11 shrink-0 object-contain"
          />
        )}
      </Link>

      {root.children.length > 0 && (
        <>
          <ul className="mt-3.5 flex flex-wrap gap-1.5 border-t border-k-line pt-3.5">
            {root.children.slice(0, 4).map((child) => (
              <li key={child.slug}>
                <Link
                  href={`/katalogos/${child.slug}`}
                  className="t-brand-count flex items-center gap-1.5 border border-k-line-2 px-2 py-1.5 text-k-text-3 transition-colors hover:border-k-red hover:bg-k-red hover:text-white"
                  prefetch={false}
                >
                  {upGreek(child.name)}
                  <span className="font-mono opacity-60">{child.count}</span>
                </Link>
              </li>
            ))}
          </ul>

          {remaining > 0 && (
            <div className="mt-3">
              <CategoryPicker
                root={root.name}
                nodes={nodes}
                label={t("akomi", { remaining: remaining })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
