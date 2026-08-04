import { getTranslations } from "next-intl/server";
import { upGreek } from "@/lib/greek";
import { TILE, VIEW, ZOOM, frameTiles } from "@/lib/geo/shop";

/**
 * Where the shop is, as a picture.
 *
 * No map library, no canvas, no third-party JavaScript and no cookies, so there
 * is nothing here to ask consent about. Composed from tiles because neither
 * vendor's static-map endpoint is enabled on these accounts, and a static map
 * is a grid of tiles with the right offset.
 *
 * It used to be a full-width band 560px tall: a fifth of the whole contact
 * page, spent on an address written in full directly above it. At that width
 * and zoom 16 it showed half of Piraeus, so the shop was a small red dot among
 * competing labels for other companies, and it was by some distance the loudest
 * thing on a page that is otherwise black, white and one red. It answered "here
 * is the city" and looked like a banner.
 *
 * Three changes, each with a reason:
 *
 *   smaller   420px wide instead of 1345 — a locator, not a band
 *   closer    zoom 17 shows the block; 16 showed the district
 *   greyscale the tiles carry no colour, so the only colour in the frame is the
 *             marker. The eye lands on the shop instead of on a petrol station.
 *
 * The marker keeps the brand red because it is the one thing here worth
 * pointing at.
 */
export async function StoreMap() {
  if (!process.env.MAPTILER_API_KEY) return null;
  const t = await getTranslations("epikoinonia.StoreMap");
  const photos = await getTranslations("epikoinonia.StorePhotos");
  const tiles = frameTiles();

  return (
    <section className="reveal border-b border-k-line bg-white">
      <div className="shell-x py-7 lg:py-9">
        {/*
          The caption sits under the map at the map's own width, not beside it.
          Given its own column it became a two-line paragraph floating alone in
          400px of white, which reads as a layout accident rather than as
          restraint. The empty space to the right is deliberate; an orphaned
          sentence in the middle of it is not.
        */}
        <div className="max-w-[420px]">
          <div
            className="relative overflow-hidden bg-k-surface-3"
            style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}
            role="img"
            aria-label={t("alt")}
          >
            {/* Percentages, not pixels: the frame is fluid and the tiles have to
                scale with it rather than sit at a fixed size. */}
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

          {/*
            The one fact about arriving that is not already in the details bar
            above. It was written for the photographs section, which does not
            render until those files exist, so it has been sitting unused.
          */}
          <p className="t-brand-count mt-3 text-k-text-3">
            {upGreek(photos("parking"))}
            <span className="mt-1 block text-k-text-4">{t("attribution")}</span>
          </p>
        </div>
      </div>
    </section>
  );
}
