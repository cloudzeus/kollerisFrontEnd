import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { CategoryTile } from "@/lib/catalog/queries";
import { SectionHeading } from "./SectionHeading";
import { upGreek } from "@/lib/greek";

/**
 * "ΑΓΟΡΑ ΑΝΑ ΚΑΤΗΓΟΡΙΑ" — live from the projection: names, images, real SKU
 * counts and real subcategory counts.
 *
 * Handoff: 2 columns / 150px tiles / 54px icons on mobile, 4 columns / 196px
 * tiles / 76px icons on desktop. Mobile also drops the subcategory line.
 *
 * Categories with no listed products are filtered out in `getRootCategories` —
 * the ERP tree carries several, and a tile reading "0 ΚΩΔ." is worse than none.
 */
export function CategoryGrid({
  categories,
  totalCategories,
}: {
  categories: CategoryTile[];
  totalCategories: number;
}) {
  const t = useTranslations("home.CategoryGrid");
  if (categories.length === 0) return null;

  return (
    <section className="bg-white shell-x py-7 lg:pt-16 lg:pb-17">
      <SectionHeading
        eyebrow={t("to_plires_inventory")}
        title={t("agora_ana_katigoria")}
        action={{ href: "/katalogos", label: t("oles_oi_katigories", { totalCategories: totalCategories }) }}
      />

      <div className="grid grid-cols-2 gap-px border border-k-line bg-k-line md:grid-cols-3 lg:grid-cols-4">
        {categories.map((category, index) => (
          <Link
            key={category.id}
            href={`/katalogos/${category.slug}`}
            className="flex min-h-[150px] flex-col justify-between gap-2.5 bg-white p-4 transition-colors hover:bg-k-surface-2 lg:min-h-[196px] lg:gap-4 lg:p-6"
          >
            <div className="flex items-start justify-between">
              <span className="t-cat-num text-k-red">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="t-cat-count text-k-text-4">
                {category.productCount.toLocaleString("el-GR")} {upGreek(t("kod"))}
              </span>
            </div>

            {category.image ? (
              <Image
                src={category.image}
                alt=""
                width={76}
                height={76}
                className="block h-[54px] w-[54px] object-contain lg:h-[76px] lg:w-[76px]"
              />
            ) : (
              <span className="block h-[54px] w-[54px] bg-k-surface-3 lg:h-[76px] lg:w-[76px]" />
            )}

            <div>
              <p className="t-cat-name text-k-ink">{upGreek(category.name)}</p>
              <p className="t-cat-subs mt-[5px] hidden text-k-text-4 lg:block">
                {category.childCount} {t("ypokatigories")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
