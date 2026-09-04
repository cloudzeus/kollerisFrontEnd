import { getTranslations } from "next-intl/server";
import { upGreek } from "@/lib/greek";
import { TILE, VIEW, ZOOM, frameTiles } from "@/lib/geo/shop";

/**
 * Where the shop is, and what it costs to park there.
 *
 * The map alone left 400px of white beside it doing nothing, which read as an
 * unfinished row rather than as restraint. What fills it is not decoration: free
 * parking is a real reason to drive to Piraeus instead of ordering elsewhere,
 * and it was previously one grey nine-pixel line under the map.
 *
 * The panel is ink, not another white card, for two reasons. The page already
 * speaks that language (`band-ink` is used for the hero, the breadcrumb and the
 * footer), so it is not a new idea. And a dark block beside a greyscale map
 * makes the pair read as composed, where a grey map next to white read as a
 * mistake.
 *
 * Colour comes from the red the brand already owns. Not green, which is spoken
 * for: it means in-stock and open-now everywhere else on the site, and a green
 * "free" badge here would quietly break that. One accent, used with conviction,
 * beats a second accent used decoratively.
 *
 * No icons, deliberately. The storefront has none: it is a typographic system
 * with rules and one red, and a parking glyph next to it would be the only
 * pictogram on the page. Size and colour carry the emphasis instead.
 */
export async function StoreMap() {
  if (!process.env.MAPTILER_API_KEY) return null;
  const t = await getTranslations("epikoinonia.StoreMap");
  const tiles = frameTiles();

  const terms = [
    { title: t("parking_pickup"), body: t("parking_pickup_body") },
    { title: t("parking_receipt"), body: t("parking_receipt_body") },
  ];

  return (
    <section className="reveal border-b border-k-line bg-white">
      <div className="shell-x py-7 lg:py-9">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-stretch lg:gap-8">
          {/* The map, quiet on purpose. See lib/geo/shop.ts for zoom and frame. */}
          <div>
            <div
              className="relative overflow-hidden bg-k-surface-3"
              style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}
              role="img"
              aria-label={t("alt")}
            >
              {/* Percentages, not pixels: the frame is fluid and the tiles have
                  to scale with it rather than sit at a fixed size. */}
              {tiles.map((tile) => (
                <img
                  key={`${tile.x}-${tile.y}`}
                  src={`/api/map/tile/${ZOOM}/${tile.x}/${tile.y}`}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="absolute max-w-none grayscale contrast-[1.12] brightness-[0.97]"
                  style={{
                    left: `${(tile.left / VIEW.w) * 100}%`,
                    top: `${(tile.top / VIEW.h) * 100}%`,
                    width: `${(TILE / VIEW.w) * 100}%`,
                  }}
                />
              ))}

              {/* The shop. Centred by construction, so no arithmetic here. */}
              <span
                aria-hidden
                className="absolute top-1/2 left-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-k-red shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
              />
            </div>

            <p className="t-brand-count mt-2 text-k-text-4">{t("attribution")}</p>
          </div>

          {/*
            Stretched to the map's height and laid out top-and-bottom, so the
            column is filled by the content rather than by padding.
          */}
          <div className="band-ink flex flex-col justify-between gap-7 p-6 lg:p-8">
            <div>
              <p className="font-display t-display text-[26px] leading-[1.05] lg:text-[32px]">
                <span className="text-k-red">{upGreek(t("parking_free"))}</span>{" "}
                <span className="text-white">{upGreek(t("parking_word"))}</span>
              </p>
              <p className="t-usp-body mt-2 max-w-[46ch] text-k-text-6">
                {t("parking_where")}
              </p>
            </div>

            {/*
              Two terms, so two rows and exactly one hairline between them. A
              border on every row is the spec-table reflex and there is no table
              here.
            */}
            <dl className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              {terms.map((term, index) => (
                <div
                  key={term.title}
                  className={
                    index === 1
                      ? "border-t border-white/12 pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6"
                      : ""
                  }
                >
                  <dt className="t-stat-label text-k-red uppercase">
                    {upGreek(term.title)}
                  </dt>
                  <dd className="t-usp-body mt-1.5 text-white/85">{term.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}
