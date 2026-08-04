import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import { PolicyLayout } from "@/components/policies/PolicyLayout";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import { getCatalogueStats, getMenuTree, getRootCategories, getTopBrands } from "@/lib/catalog/queries";
import { getPolicyContent } from "@/lib/policies/content";
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
    return {
      alternates: alternatesFor(path, locale),
      title: content.title,
      // The intro doubles as the meta description where one exists; policy
      // pages without one (payment, shipping, returns, warranty) fall back to
      // the title, which is still an honest description of the page.
      description: content.intro ?? content.title,
      // Legal boilerplate has no place competing for a search snippet.
      robots: { index: false, follow: true },
    };
  }

  async function PolicyRoute({ params }: { params: Promise<{ locale: Locale }> }) {
    const { locale } = await params;
    setRequestLocale(locale);

    const [t, menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
      getTranslations({ locale, namespace: "policies" }),
      getMenuTree(locale),
      getTopBrands(locale, 16),
      getCatalogueStats(),
      getRootCategories(locale),
      getMiniCart(locale),
    ]);

    const content = getPolicyContent(slug, locale);

    return (
      <>
        <SiteChrome locale={locale} cart={miniCart} categories={menuTree} brands={brands} stats={stats} />
        <PolicyLayout
          content={content}
          homeLabel={t("archiki")}
          contactLabel={t("miliste_mas")}
          updatedLabel={t("teleftaia_enimerosi")}
        />
        <SiteFooter categories={rootCategories} />
      </>
    );
  }

  return { generateMetadata, PolicyRoute };
}
