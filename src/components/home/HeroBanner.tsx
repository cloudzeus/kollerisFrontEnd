import { useTranslations } from "next-intl";
import { getLocale } from "next-intl/server";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Hero plus the two promo tiles beside it.
 *
 * Handoff: mobile 390 is a 420px block with a top-to-bottom gradient, copy
 * pinned to the bottom and one full-width CTA; the promo tiles drop off
 * entirely. Desktop 1440 is 520px with a left-to-right gradient and the two
 * tiles in a 400px column.
 *
 * Copy comes from the CMS via `copy`, which the page resolves. The component
 * stays pure: it renders what it is given, and the fallback to the original
 * wording lives in the content registry rather than here, so there is one place
 * that knows what the site said before anyone edited it.
 *
 * Everything numeric is live from the projection, never editable — a count that
 * marketing could type would drift from the catalogue within a day.
 */
export async function HeroBanner({
  productCount,
  brandCount,
  featuredTiles,
  copy,
  aside,
}: {
  productCount: number;
  brandCount: number;
  copy: Record<string, string>;
  /**
   * The `home.aside` zone. Rendered by the page and passed in, because a server
   * component that fetched its own zone would make this component impossible to
   * render anywhere else — and the two promo tiles it replaces were the reason
   * the zone system exists.
   */
  aside?: React.ReactNode;
  featuredTiles: Array<{
    eyebrow: string;
    title: string;
    body: string;
    href: string;
    image: string | null;
    dark?: boolean;
  }>;
}) {
  const locale = await getLocale();
  const t = useTranslations("home.HeroBanner");
  const formatted = productCount.toLocaleString(locale);

  // The mobile lead is the one line marketing can write with live figures in
  // it. Anything else would mean either a stale number or no number at all.
  const leadMobile = (copy.leadMobile ?? "")
    .replace("{products}", formatted)
    .replace("{brands}", String(brandCount));

  return (
    <section className="shell-w grid gap-0.5 bg-k-line lg:grid-cols-[1fr_400px]">
      <div className="relative h-[420px] overflow-hidden bg-k-ink lg:h-[520px]">
        <video
          src="https://cdn.kolleris.com/engineer-walking-past-shipyard-during-sunset-2026-01-22-16-56-28-utc.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-60 lg:opacity-[0.62]"
        />
        {/* Mobile: vertical scrim so bottom-pinned copy stays legible. */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(16,16,18,.55)_0%,rgba(16,16,18,.9)_72%)] lg:bg-[linear-gradient(90deg,rgba(16,16,18,.92)_0%,rgba(16,16,18,.62)_52%,rgba(16,16,18,.25)_100%)]" />

        <div className="relative flex h-full flex-col justify-end gap-4 px-5 py-[26px] lg:justify-center lg:gap-[26px] lg:px-16 lg:py-15">
          <p className="t-eyebrow flex items-center gap-[11px] text-k-red">
            <span className="hidden h-[1.5px] w-[26px] bg-k-red lg:block" />
            {upGreek(copy.eyebrow)} · {copy.since}
          </p>

          <h1 className="t-h1 max-w-[640px] text-balance text-white">
            {upGreek(copy.title)}
            <br />
            <span className="text-k-red">{upGreek(copy.titleSecond)}</span>
          </h1>

          <p className="t-lead max-w-[460px] text-white/74">
            <span className="lg:hidden">{leadMobile}</span>
            <span className="hidden lg:inline">{copy.lead}</span>
          </p>

          <div className="flex flex-col gap-3.5 lg:mt-1.5 lg:flex-row lg:items-center">
            <Link
              href="/katalogos"
              className="t-btn bg-k-red py-[15px] text-center text-white transition-colors hover:bg-k-red-hover lg:px-[30px] lg:py-4"
            >
              {upGreek(copy.ctaPrimary)} →
            </Link>
            <Link
              href="/katalogos"
              className="t-btn-outline hidden border-[1.5px] border-white/34 px-7 py-[15px] text-white transition-colors hover:border-white lg:block"
            >
              {upGreek(copy.ctaSecondary)} {formatted}+ {upGreek(t("kodikon"))}
            </Link>
          </div>
        </div>
      </div>

      {/*
        Promo tiles — desktop only, per the handoff.

        Rebuilt as a two-column grid. They were absolutely positioned before:
        a 180px image pinned at `right: -16px` inside a 400px tile, over copy
        capped at 230px. In a 340px content box those two overlap by ~84px, so
        the title ran underneath the product and the image was clipped by the
        tile's own `overflow-hidden`. A grid cannot overlap, which is the point.
      */}
      {/* The zone wins when it holds anything. The hardcoded tiles stay as the
          fallback, so an empty zone is not an empty column and the page looks
          the same the day the builder ships as the day before. */}
      {aside ? (
        <div className="hidden grid-rows-2 gap-0.5 lg:grid">{aside}</div>
      ) : (
        <div className="hidden grid-rows-2 gap-0.5 lg:grid">
          {featuredTiles.map((tile) => (
          <article
            key={tile.title}
            className={`group/tile grid grid-cols-[1fr_128px] items-stretch gap-4 overflow-hidden p-[26px] transition-colors ${
              tile.dark ? "bg-k-ink hover:bg-k-ink-deep" : "bg-k-surface-3 hover:bg-white"
            }`}
          >
            <div className="flex min-w-0 flex-col">
              <span
                className={`t-badge inline-block self-start px-[9px] py-[5px] ${
                  tile.dark ? "border border-white/30 text-white/80" : "bg-k-red text-white"
                }`}
              >
                {tile.eyebrow}
              </span>

              <p
                className={`t-tile-title mt-3 whitespace-pre-line ${
                  tile.dark ? "text-white" : "text-k-ink"
                }`}
              >
                {tile.title}
              </p>

              <p
                className={`t-body-sm mt-1.5 line-clamp-2 ${
                  tile.dark ? "text-white/60" : "text-k-text-3"
                }`}
              >
                {tile.body}
              </p>

              <Link
                href={tile.href}
                className={`t-link-mono mt-auto self-start border-b-[1.5px] border-k-red pt-3 pb-[3px] transition-colors ${
                  tile.dark ? "text-white hover:text-k-red" : "text-k-ink hover:text-k-red"
                }`}
              >
                {upGreek(t("deite_ta"))} →
              </Link>
            </div>

            {tile.image ? (
              <span className="flex items-center justify-center self-center">
                <Image
                  src={tile.image}
                  alt=""
                  width={256}
                  height={256}
                  className="block h-[124px] w-[124px] object-contain transition-transform duration-300 ease-out group-hover/tile:scale-105"
                />
              </span>
            ) : (
              <span aria-hidden />
            )}
          </article>
          ))}
        </div>
      )}
    </section>
  );
}
