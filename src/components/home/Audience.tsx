import { Droplets, Factory, Ship, Wrench, Zap } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";
import { SectionHeading } from "./SectionHeading";

const AUDIENCES = [
  { key: "naytiliakes", slug: "ergaleia-cheiros", Icon: Ship },
  { key: "ergostasia", slug: "mesa-atomikis-prostasias-odopoiia", Icon: Factory },
  { key: "synergeia", slug: "exoplismos-synergeiou", Icon: Wrench },
  { key: "ilektrologoi", slug: "exoplismos-ilektrologon-ilektronikon-fotismos", Icon: Zap },
  { key: "ydraylikoi", slug: "ergaleia-kai-exartimata-ydraylikon", Icon: Droplets },
] as const;

export const AUDIENCE_SLUGS = AUDIENCES.map((a) => a.slug);

export async function Audience({ categoryLinks }: { categoryLinks: Record<string, string> }) {
  const t = await getTranslations("home.Audience");
  const audiences = AUDIENCES.filter((a) => categoryLinks[a.slug]);
  if (audiences.length === 0) return null;

  return (
    <section className="border-t border-k-line bg-white shell-x py-7 lg:py-14">
      <SectionHeading eyebrow={t("eyebrow")} title={t("titlos")} />
      <ul className="grid grid-cols-2 gap-px border border-k-line bg-k-line md:grid-cols-5">
        {audiences.map(({ key, slug, Icon }) => (
          <li key={key} className="bg-white last:col-span-2 md:last:col-span-1">
            <Link
              href={`/katalogos/${slug}`}
              prefetch={false}
              className="flex h-full min-h-[120px] flex-col gap-3 p-4 transition-colors hover:bg-k-surface-2 lg:p-5"
            >
              <Icon aria-hidden size={20} strokeWidth={1.5} className="text-k-red" />
              <span className="t-tile-title text-k-ink">{t(key)}</span>
              <span className="t-cat-name mt-auto text-k-text-3">{upGreek(categoryLinks[slug])}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
