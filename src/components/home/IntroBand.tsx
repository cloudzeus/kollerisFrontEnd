import { MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SHOP } from "@/lib/seo/structured-data";

const ENTITIES = [
  { slug: "ergaleia-cheiros", label: "ergaleia_cheiros" },
  { slug: "ergaleia-batarias", label: "ilektrika_batarias" },
  { slug: "eidi-vidopoiias", label: "sidirika" },
] as const;

export const ENTITY_SLUGS = ENTITIES.map((e) => e.slug);

/** Under the hero: what the shop sells, in the words people search for, and where it is. */
export async function IntroBand({
  intro,
  categoryLinks,
}: {
  intro?: string | null;
  categoryLinks: Record<string, string>;
}) {
  const t = await getTranslations("home.IntroBand");
  const entities = ENTITIES.filter((e) => categoryLinks[e.slug]);

  return (
    <section className="shell-x border-b border-k-line bg-white py-4 lg:py-6">
      {intro ? <p className="t-lead mb-4 max-w-[820px] text-k-text-2">{intro}</p> : null}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        {entities.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[length:var(--fs-13)] text-k-text-3">{t("xekiniste_apo")}</span>
            {entities.map((e) => (
              <Link
                key={e.slug}
                href={`/katalogos/${e.slug}`}
                prefetch={false}
                className="inline-flex min-h-11 items-center px-1 text-[length:var(--fs-13)] font-semibold text-k-ink underline underline-offset-4 transition-colors hover:text-k-red"
              >
                {t(e.label)}
              </Link>
            ))}
          </div>
        ) : null}
        <Link
          href="/epikoinonia"
          prefetch={false}
          className="inline-flex min-h-11 items-center gap-2 text-[length:var(--fs-13)] text-k-text-2 transition-colors hover:text-k-red"
        >
          <MapPin aria-hidden size={16} strokeWidth={1.5} className="shrink-0 text-k-red" />
          <span>
            <strong className="font-semibold text-k-ink">{t("athina_peiraias")}</strong>
            {` · ${SHOP.street}, ${SHOP.city} ${SHOP.postcode}`}
          </span>
        </Link>
      </div>
    </section>
  );
}
