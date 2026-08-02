import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { BrandTile } from "@/lib/catalog/queries";
import { SectionHeading } from "./SectionHeading";
import { upGreek } from "@/lib/greek";

/**
 * Brand wall — live brands ordered by how many listed products each has, with
 * the real count under the name. Brands with zero listed products are filtered
 * out in `getTopBrands`, per the spec's rule for the Brands page.
 *
 * Handoff: 8 columns / 92px cells on desktop. Mobile 390 has no brand wall in
 * the handoff, so this collapses to a 3-up grid rather than inventing one.
 */
export function BrandWall({
  brands,
  totalBrands,
}: {
  brands: BrandTile[];
  totalBrands: number;
}) {
  const t = useTranslations("home.BrandWall");
  if (brands.length === 0) return null;

  return (
    <section className="border-t border-k-line bg-white shell-x py-7 lg:pt-15 lg:pb-16">
      <SectionHeading
        center
        eyebrow="Exclusive partnerships"
        title={t("ta_brands_poy_antiprosopeyoyme")}
      >
        <p className="t-news-body mt-3 text-k-text-3">
          {totalBrands} {t("brands_me_energa_proionta_mia")}
        </p>
      </SectionHeading>

      <div className="grid grid-cols-3 gap-px border border-k-line bg-k-line sm:grid-cols-4 lg:grid-cols-8">
        {brands.map((brand) => (
          <Link
            key={brand.id}
            href={`/brands/${brand.slug}`}
            className="flex h-[104px] flex-col items-center justify-center gap-1.5 bg-white px-3 transition-colors hover:bg-k-surface-2 lg:h-[116px]"
          >
            {brand.logo ? (
              /* Square source art — see the note in MegaMenu. */
              <Image
                src={brand.logo}
                alt={brand.name}
                width={176}
                height={176}
                className="block h-[72px] w-[72px] object-contain lg:h-[88px] lg:w-[88px]"
              />
            ) : (
              <span className="t-brand-name text-k-text-2">{brand.name}</span>
            )}
            <span className="t-brand-count text-k-text-6">
              {brand.productCount.toLocaleString("el-GR")} {upGreek(t("kod"))}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-3.5 flex justify-center">
        <Link
          href="/brands"
          className="t-link-mono border-b-[1.5px] border-k-red pb-[3px] text-k-ink transition-colors hover:text-k-red"
        >
          {upGreek(`Όλα τα ${totalBrands} brands`)} →
        </Link>
      </div>
    </section>
  );
}
