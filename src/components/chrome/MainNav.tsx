import { useTranslations } from "next-intl";
import { MegaMenu } from "@/components/chrome/MegaMenu";
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

/**
 * Primary navigation. Desktop only — the mobile handoff replaces it with the
 * burger drawer in `SiteHeader`, so rendering it at 390px would duplicate
 * navigation the design does not have.
 *
 * `relative` on the bar is what the mega-menu panels anchor to: they are
 * `absolute inset-x-0 top-full`, so they span the full width of the nav rather
 * than of the tab that opened them.
 */
export function MainNav({
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
  const t = useTranslations("chrome.MainNav");
  const links = [
    { href: "/katalogos", label: upGreek(t("katalogos")) },
    { href: "/nees-afixeis", label: upGreek(t("nees_afixeis")) },
  ];

  /*
   * Οι τρεις μεγαλύτερες μάρκες, ονομαστικά, δίπλα στις κατηγορίες.
   *
   * Έτσι τις έχει το design, και ο λόγος φαίνεται στα ερωτήματα αναζήτησης: οι
   * επαγγελματίες δεν ψάχνουν «κατσαβίδια», ψάχνουν «Wera». Το `/brands` από
   * μόνο του είναι ένα ακόμη κλικ πριν από το όνομα που έχουν ήδη στο μυαλό.
   *
   * ΔΕΝ είναι χειροκίνητη λίστα: έρχονται ταξινομημένες κατά πλήθος προϊόντων
   * από το `getTopBrands`, οπότε αν αύριο η KNIPEX περάσει τη MILWAUKEE, το nav
   * το ακολουθεί. Χειρόγραφα ονόματα εδώ θα έδειχναν μάρκα που σταματήσαμε να
   * φέρνουμε.
   */
  const featuredBrands = brands.slice(0, 3);

  const secondary = [
    { href: "/etaireia", label: upGreek(t("i_etaireia")) },
    { href: "/epikoinonia", label: upGreek(t("epikoinonia")) },
    { href: "/blog", label: "BLOG" },
  ] as const;

  return (
    <nav
      aria-label={t("kyria_ploigisi")}
      className="relative z-20 hidden border-b border-k-header-line bg-k-header lg:block"
    >
      <div className="shell-x flex items-stretch justify-between">
        <div className="flex items-stretch">
          <MegaMenu
            categories={categories}
            brands={brands}
            featured={featured}
            totalCategories={totalCategories}
            totalSubcategories={totalSubcategories}
            totalProducts={totalProducts}
            totalBrands={totalBrands}
          />

          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="t-nav-cond flex h-[46px] items-center px-[18px] text-k-on-dark-2 transition-colors hover:text-white"
              prefetch={false}
            >
              {link.label}
            </Link>
          ))}

          {featuredBrands.map((brand) => (
            <Link
              key={brand.id}
              href={`/brands/${brand.slug}`}
              className="t-nav-cond hidden h-[46px] items-center px-[18px] text-k-on-dark-2 transition-colors hover:text-white xl:flex"
              prefetch={false}
            >
              {upGreek(brand.name)}
            </Link>
          ))}

          <Link
            href="/prosfores"
            className="t-nav-cond flex h-[46px] items-center gap-[7px] px-[18px] text-k-red hover:text-k-red-hover"
            prefetch={false}
          >
            <span className="block h-[5px] w-[5px] bg-k-red" />
            {upGreek(t("prosfores"))}
          </Link>
        </div>

        <div className="flex items-center gap-5">
          {secondary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="t-nav-cond text-k-on-dark-3 transition-colors hover:text-white"
              prefetch={false}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
