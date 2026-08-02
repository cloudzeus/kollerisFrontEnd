import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ProductCard } from "@/components/product/ProductCard";
import type { ProductCardData } from "@/lib/catalog/queries";
import { SectionHeading } from "./SectionHeading";
import { upGreek } from "@/lib/greek";

/**
 * Featured-products band.
 *
 * Handoff: 2 columns / 12px gap on mobile, 4 columns / 16px gap on desktop.
 * The design shows carousel arrows on desktop; this renders the full 8-up grid
 * instead, because a carousel that hides half the products behind a click is
 * worse here and the arrows would force the whole band to hydrate.
 */
export function FeaturedProducts({ products }: { products: ProductCardData[] }) {
  const t = useTranslations("home.FeaturedProducts");
  if (products.length === 0) return null;

  return (
    <section className="border-t border-k-line bg-k-surface-3 shell-x py-7 lg:pt-16 lg:pb-[70px]">
      <SectionHeading
        eyebrow="Επιλεγμένοι κωδικοί"
        title={t("ta_pio_dimofili_ergaleia")}
        action={{ href: "/katalogos", label: "Δείτε όλα τα προϊόντα" }}
      >
        <p className="t-stat-label mt-2 text-k-text-4">{upGreek(t("oles_oi_times_me_fpa"))}</p>
      </SectionHeading>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      <div className="mt-6 flex justify-center lg:mt-[34px]">
        <Link
          href="/katalogos"
          className="t-btn-sm border-[1.5px] border-k-ink px-[34px] py-[15px] text-k-ink transition-colors hover:bg-k-ink hover:text-white"
        >
          {upGreek(t("deite_ola_ta_proionta"))} →
        </Link>
      </div>
    </section>
  );
}
