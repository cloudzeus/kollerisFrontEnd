import { SiteChrome } from "@/components/chrome/SiteChrome";
import { SiteFooter } from "@/components/chrome/SiteFooter";
import type { Locale } from "@/i18n/routing";
import { getMiniCart } from "@/lib/cart/cart";
import {
  getCatalogueStats,
  getMenuTree,
  getRootCategories,
  getTopBrands,
} from "@/lib/catalog/queries";

/**
 * Header, nav and footer for the account area — a SERVER component.
 *
 * Six account pages needed the same forty lines of chrome wiring. Pulling it
 * into one component keeps a nav change from being a six-file edit.
 */
export async function AccountChrome({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [menuTree, brands, stats, rootCategories, miniCart] = await Promise.all([
    getMenuTree(locale),
    getTopBrands(locale, 16),
    getCatalogueStats(),
    getRootCategories(locale),
    getMiniCart(locale),
  ]);

  return (
    <>
      <SiteChrome
        locale={locale}
        cart={miniCart}
        categories={menuTree}
        brands={brands}
        stats={stats}
      />
      {children}
      <SiteFooter categories={rootCategories} />
    </>
  );
}
