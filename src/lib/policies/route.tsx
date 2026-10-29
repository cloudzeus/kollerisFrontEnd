import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PolicyLayout } from "@/components/policies/PolicyLayout";
import { Zone } from "@/components/zones/Zone";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";
import { getPolicyContent } from "@/lib/policies/content";
import { getPolicyBody } from "@/lib/policies/overrides";
import { htmlToText } from "@/lib/content/sanitize-html";
import type { PolicySlug } from "@/lib/policies/types";
import { alternatesFor } from "@/lib/seo/urls";

/**
 * One route factory for all six legal pages.
 *
 * Each `page.tsx` under `/oroi-chrisis`, `/aporrito`, etc. is a two-line file
 * that calls this with its own slug and path — the chrome-fetching and
 * metadata boilerplate every other page repeats is written once here instead
 * of six times, which is also what keeps the six pages from drifting apart in
 * how they load categories or brands.
 */
export function createPolicyRoute(slug: PolicySlug, path: string) {
  async function generateMetadata({
    params,
  }: {
    params: Promise<{ locale: Locale }>;
  }): Promise<Metadata> {
    const { locale } = await params;
    const content = getPolicyContent(slug, locale);
    const bodyHtml = await getPolicyBody(slug, locale);
    // When an operator has rewritten the page, the description follows what they
    // wrote; otherwise the intro doubles as the description where one exists, and
    // pages without one fall back to the title — still an honest description.
    const description = bodyHtml
      ? htmlToText(bodyHtml).slice(0, 200) || content.title
      : content.intro ?? content.title;
    return {
      alternates: alternatesFor(path, locale),
      title: content.title,
      description,
      // Legal boilerplate has no place competing for a search snippet.
      robots: { index: false, follow: true },
    };
  }

  async function PolicyRoute({
    params,
  }: {
    params: Promise<{ locale: Locale }>;
  }) {
    const { locale } = await params;
    setRequestLocale(locale);

    const [t, menuTree, brands, stats, rootCategories, miniCart, bodyHtml] =
      await Promise.all([
        getTranslations({ locale, namespace: "policies" }),
        getMenuTree(locale),
        getTopBrands(locale),
        getCatalogueStats(),
        getRootCategories(locale),
        getMiniCart(locale),
        getPolicyBody(slug, locale),
      ]);

    const content = getPolicyContent(slug, locale);

    return (
      <>
        <SiteChrome
          locale={locale}
          cart={miniCart}
          categories={menuTree}
          brands={brands}
          stats={stats}
        />
        <Zone id="policy.top" locale={locale} />
        <PolicyLayout
          content={content}
          locale={locale}
          homeLabel={t("archiki")}
          contactLabel={t("miliste_mas")}
          updatedLabel={t("teleftaia_enimerosi")}
          bodyHtml={bodyHtml}
        />
        {/* Μία ζώνη για ΟΛΕΣ τις θεσμικές σελίδες — όροι, απόρρητο, αποστολή,
            επιστροφές, εγγυήσεις, τρόποι πληρωμής. Ξεχωριστή ζώνη ανά σελίδα θα
            ήταν έξι κουτιά που ο συντάκτης θα συμπλήρωνε με το ίδιο πράγμα. */}
        <Zone id="policy.below" locale={locale} />
        <SiteFooter categories={rootCategories} />
      </>
    );
  }

  return { generateMetadata, PolicyRoute };
}
