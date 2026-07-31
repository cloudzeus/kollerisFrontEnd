import Image from "next/image";
import { MiniCart } from "@/components/cart/MiniCart";
import { MobileMenu } from "@/components/chrome/MobileMenu";
import { SearchSuggest } from "@/components/chrome/SearchSuggest";
import { Link } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import type { MiniCartSummary } from "@/lib/cart/options";
import type { BrandTile, MenuCategory } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

function AccountIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1A1A1C"
      strokeWidth="1.7"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

/**
 * Logo + search + account + cart.
 *
 * Two layouts, per the handoff. Mobile 390 puts the burger, logo, account and
 * cart on one 12/16px row and the search on its own row below; desktop 1440 is
 * a single 96px row. Shrink-on-scroll and the search-suggest dropdown are
 * client islands added with the search phase — the shell here is server-rendered
 * so it is in the first paint.
 */
export function SiteHeader({
  locale,
  cart,
  categories,
  brands,
  totalCategories,
  totalSubcategories,
  totalProducts,
}: {
  locale: Locale;
  cart: MiniCartSummary | null;
  categories: MenuCategory[];
  brands: BrandTile[];
  totalCategories: number;
  totalSubcategories: number;
  totalProducts: number;
}) {
  // Plain, serialisable shape for the client island — the menu tree carries
  // children, counts and images the search scope has no use for.
  const suggestCategories = categories.slice(0, 12).map((category) => ({
    slug: category.slug,
    name: category.name,
  }));

  return (
    <>
      {/* ── Mobile ─────────────────────────────────────────────── */}
      <div className="lg:hidden">
        <div className="flex items-center gap-3.5 border-b border-k-line bg-white px-4 py-3">
          <MobileMenu
            categories={categories}
            brands={brands}
            totalCategories={totalCategories}
            totalSubcategories={totalSubcategories}
            totalProducts={totalProducts}
          />

          <Link href="/" className="mr-auto">
            <Image
              src="/brand/kolleris-logo.svg"
              alt="Kolleris"
              width={104}
              height={21}
              priority
              className="block h-auto w-[104px]"
            />
          </Link>

          <Link href="/eisodos" aria-label="Λογαριασμός">
            <AccountIcon size={19} />
          </Link>

          <MiniCart cart={cart} variant="mobile" />
        </div>

        <div className="border-b border-k-line bg-white px-4 py-3">
          <SearchSuggest
            locale={locale}
            categories={suggestCategories}
            variant="mobile"
          />
        </div>

        <nav
          aria-label="Γλώσσα"
          className="flex items-center justify-end gap-2 border-b border-k-line bg-white px-4 py-2.5"
        >
          <span className="t-account-label text-k-text-4">
            {upGreek("Γλώσσα")}
          </span>
          <div className="flex border border-k-line-2">
            {routing.locales.map((code) => (
              <Link
                key={code}
                href="/"
                locale={code}
                aria-current={code === locale ? "true" : undefined}
                className={`t-lang px-2.5 py-[5px] transition-colors ${
                  code === locale ? "bg-k-red text-white" : "text-k-text-3"
                }`}
              >
                {LOCALE_LABELS[code]}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      {/* ── Desktop ────────────────────────────────────────────── */}
      <div className="header-main shell-x hidden h-24 items-center gap-9 border-b border-k-line bg-white lg:flex">
        <Link href="/" className="shrink-0">
          <Image
            src="/brand/kolleris-logo.svg"
            alt="Kolleris"
            width={158}
            height={32}
            priority
            className="header-logo block h-auto w-[158px]"
          />
        </Link>

        <SearchSuggest locale={locale} categories={suggestCategories} />

        <div className="flex shrink-0 items-center gap-[26px]">
          <Link
            href="/eisodos"
            className="group/acc flex items-center gap-2.5 transition-colors hover:text-k-red"
          >
            <AccountIcon />
            <span className="block">
              <span className="t-account-label block text-k-text-4">
                {upGreek("Λογαριασμός")}
              </span>
              <span className="t-account-value mt-0.5 block text-k-ink transition-colors group-hover/acc:text-k-red">
                Σύνδεση B2B
              </span>
            </span>
          </Link>

          <span className="h-[34px] w-px bg-k-line" />

          <MiniCart cart={cart} />
        </div>
      </div>
    </>
  );
}
