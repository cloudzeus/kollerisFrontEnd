import { HeaderShell } from "@/components/chrome/HeaderShell";
import { MainNav } from "@/components/chrome/MainNav";
import { SiteHeader } from "@/components/chrome/SiteHeader";
import { UtilityBar } from "@/components/chrome/UtilityBar";
import type { Locale } from "@/i18n/routing";
import type { MiniCartSummary } from "@/lib/cart/options";
import type { BrandTile, MenuCategory, ProductCardData } from "@/lib/catalog/queries";

/**
 * The whole top of the page — utility bar, header, nav — as one server
 * component inside the sticky shell.
 *
 * Nine pages were each wiring the same three components with the same six
 * props. That is nine places to forget the sticky wrapper, and it is exactly
 * how a header ends up behaving differently on the cart than on the catalogue.
 *
 * `HeaderShell` is the only client part and it takes these as children, so the
 * mega-menu, the search field and the mini-cart are all still server-rendered
 * into the first paint.
 */
export function SiteChrome({
  locale,
  cart,
  categories,
  brands,
  stats,
  featured = null,
}: {
  locale: Locale;
  cart: MiniCartSummary | null;
  categories: MenuCategory[];
  brands: BrandTile[];
  stats: {
    products: number;
    brands: number;
    categories: number;
    subcategories: number;
  };
  featured?: ProductCardData | null;
}) {
  return (
    <HeaderShell>
      <UtilityBar locale={locale} />
      <SiteHeader
        locale={locale}
        cart={cart}
        categories={categories}
        brands={brands}
        totalCategories={stats.categories}
        totalSubcategories={stats.subcategories}
        totalProducts={stats.products}
      />
      <MainNav
        categories={categories}
        brands={brands}
        featured={featured}
        totalCategories={stats.categories}
        totalSubcategories={stats.subcategories}
        totalProducts={stats.products}
        totalBrands={stats.brands}
      />
    </HeaderShell>
  );
}
