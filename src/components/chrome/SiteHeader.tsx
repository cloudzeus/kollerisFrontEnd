import { useTranslations } from "next-intl";
import Image from "next/image";
import { MiniCart } from "@/components/cart/MiniCart";
import { MobileMenu } from "@/components/chrome/MobileMenu";
import { SearchSuggest } from "@/components/chrome/SearchSuggest";
import { Link } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import type { MiniCartSummary } from "@/lib/cart/options";
import type { BrandTile, MenuCategory } from "@/lib/catalog/queries";
import { upGreek } from "@/lib/greek";

/**
 * `stroke="currentColor"`, όχι καρφωμένο μαύρο.
 *
 * Το ίδιο εικονίδιο κάθεται τώρα και σε σκούρο header και σε λευκή γραμμή
 * κινητού. Με σταθερό #1A1A1C ήταν αόρατο στο σκούρο — και το είδα ακριβώς έτσι
 * την πρώτη φορά που άλλαξε το φόντο.
 */
function AccountIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
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
  const t = useTranslations("chrome.SiteHeader");
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
        <div className="flex items-center gap-3.5 border-b border-k-header-line bg-k-header px-4 py-3 text-k-on-dark">
          <MobileMenu
            categories={categories}
            brands={brands}
            totalCategories={totalCategories}
            totalSubcategories={totalSubcategories}
            totalProducts={totalProducts}
          />

          <Link href="/" className="mr-auto">
            {/* Το πρωτότυπο: κόκκινο σήμα, λευκά γράμματα, χωρίς φόντο. Το
                γκρι του αρχείου είναι φτιαγμένο για λευκό χαρτί και σε σκούρα
                μπάρα διαβάζεται μόλις· η ολόλευκη εκδοχή έχανε το χρώμα. */}
            <Image
              src="/brand/kolleris-row-duo.svg"
              alt="Kolleris"
              width={396}
              height={69}
              priority
              unoptimized
              className="block h-[26px] w-auto"
            />
          </Link>

          <Link href="/eisodos" aria-label={t("logariasmos")}>
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
          aria-label={t("glossa")}
          className="flex items-center justify-end gap-2 border-b border-k-line bg-white px-4 py-2.5"
        >
          <span className="t-account-label text-k-text-4">
            {upGreek(t("glossa"))}
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
      {/*
        Σκούρο, όχι λευκό.
        ────────────────────────────────────────────────────────────────────
        Το λευκό header έκανε τη σελίδα να ξεκινά με 96px κενού. Το σκούρο
        κρατά το ίδιο ύψος αλλά διαβάζεται ως πλαίσιο: ό,τι είναι μέσα του
        είναι εργαλείο πλοήγησης, ό,τι είναι από κάτω είναι το κατάστημα.

        Πρακτικά κερδίζει και το hero: η βίντεο-εικόνα από κάτω είναι σκούρα,
        και ένα λευκό header έκοβε τη σελίδα στα δύο ακριβώς στο σημείο που
        θέλουμε να συνεχίζει.
      */}
      <div className="header-main shell-x hidden h-24 items-center gap-8 border-b border-k-header-line bg-k-header text-k-on-dark lg:flex">
        <Link href="/" className="shrink-0">
          <Image
            src="/brand/kolleris-row-duo.svg"
            alt="Kolleris"
            width={396}
            height={69}
            priority
            unoptimized
            className="header-logo block h-[44px] w-auto"
          />
        </Link>

        <SearchSuggest
          locale={locale}
          categories={suggestCategories}
          tone="dark"
          hint={`${totalProducts.toLocaleString(locale)}+ ${upGreek(t("kodikoi"))}`}
        />

        <div className="flex shrink-0 items-center gap-[26px]">
          {/*
            «Σύνδεση», όχι «Σύνδεση B2B».
            ────────────────────────────────────────────────────────────────
            Η φόρμα στο /eisodos δέχεται όλους — ο τύπος λογαριασμού είναι ήδη
            γνωστός στο σύστημα (`AccountUser.accountType`) και καθορίζει τι
            βλέπει κανείς ΜΕΤΑ τη σύνδεση, όχι από πού μπαίνει. Η ετικέτα «B2B»
            έλεγε σε κάθε ιδιώτη ότι δεν τον αφορά, τη στιγμή που το ίδιο κουμπί
            ήταν η μοναδική είσοδος στο προφίλ του.
          */}
          <Link
            href="/eisodos"
            className="group/acc flex items-center gap-2.5 text-k-on-dark transition-colors hover:text-k-red"
          >
            <AccountIcon />
            <span className="block">
              <span className="t-account-label block text-k-on-dark-3">
                {upGreek(t("logariasmos"))}
              </span>
              <span className="t-account-value mt-0.5 block transition-colors group-hover/acc:text-k-red">
                {t("syndesi_logariasmoy")}
              </span>
            </span>
          </Link>

          <span className="h-[34px] w-px bg-k-header-line" />

          <MiniCart cart={cart} />
        </div>
      </div>
    </>
  );
}
