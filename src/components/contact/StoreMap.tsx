import { getTranslations } from "next-intl/server";
import { upGreek } from "@/lib/greek";

/**
 * Where the shop is, as a picture.
 *
 * No map library, no canvas, no third-party JavaScript and no cookies, so there
 * is nothing here to ask consent about. A contact page has to answer "where is
 * it", and a picture of the street answers that.
 *
 * Composed from tiles because neither vendor's static-map endpoint is enabled
 * on these accounts: MapTiler returns 403 and Google says the API is not
 * activated on the project. Tiles work, and a static map is a grid of tiles
 * with the right offset. If Static Maps is switched on later this becomes one
 * `<img>`.
 */

const TILE = 512;
const ZOOM = 16;
/** Κ. Μαυρομιχάλη 4, Πειραιάς, from MapTiler's own geocoder. */
const SHOP = { lon: 23.642506, lat: 37.949726 };

/** The frame the customer sees, in tile pixels. */
const VIEW = { w: 1536, h: 640 };

/** Web Mercator: longitude and latitude to a pixel on the world at this zoom. */
function worldPixel(lon: number, lat: number) {
  const scale = 2 ** ZOOM * TILE;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale,
  };
}

export async function StoreMap() {
  if (!process.env.MAPTILER_API_KEY) return null;
  const t = await getTranslations("epikoinonia.StoreMap");

  const centre = worldPixel(SHOP.lon, SHOP.lat);
  // Top-left of the frame, in world pixels, so the shop lands in the middle.
  const left = centre.x - VIEW.w / 2;
  const top = centre.y - VIEW.h / 2;

  const firstX = Math.floor(left / TILE);
  const firstY = Math.floor(top / TILE);
  // How far the first tile hangs off the top-left corner of the frame.
  const offsetX = firstX * TILE - left;
  const offsetY = firstY * TILE - top;

  const cols = Math.ceil((VIEW.w - offsetX) / TILE);
  const rows = Math.ceil((VIEW.h - offsetY) / TILE);

  const tiles = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      x: firstX + col,
      y: firstY + row,
      left: offsetX + col * TILE,
      top: offsetY + row * TILE,
    })),
  ).flat();

  return (
    <section className="reveal border-b border-k-line bg-white">
      <div className="shell-x py-9 lg:py-12">
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
              className="absolute max-w-none"
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
            className="absolute top-1/2 left-1/2 block h-4 w-4 -translate-x-1/2 -translate-y-1/2 border-2 border-white bg-k-red shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
          />
        </div>

        <p className="t-brand-count mt-3.5 text-k-text-3">
          {upGreek(t("attribution"))}
        </p>
      </div>
    </section>
  );
}
