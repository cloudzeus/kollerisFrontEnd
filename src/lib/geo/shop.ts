/**
 * Where the shop is, and how much of the map around it we serve.
 *
 * One module because two things need to agree and used to do so by hand: the
 * component decides which tiles to request, and the route decides which tiles
 * it is willing to fetch. The route's bounds were written as literals
 * (`x: [37069, 37073]`) computed once for zoom 16 — so changing the zoom broke
 * every tile with a 404 and nothing said why. Both now derive from the numbers
 * below.
 */

/** Κ. Μαυρομιχάλη 4, Πειραιάς — from MapTiler's own geocoder. */
export const SHOP = { lon: 23.642506, lat: 37.949726 } as const;

/**
 * Close enough to read the street, not so close the block loses context.
 *
 * Was 16, which at full storefront width showed most of Piraeus: the shop was a
 * dot among other companies' pins, and the map answered "here is the city"
 * rather than "here is the door".
 */
export const ZOOM = 17;

export const TILE = 512;

/**
 * The frame, in tile pixels. Rendered at half this width in CSS, so the tiles
 * land at 2x like every other image on the site.
 */
export const VIEW = { w: 840, h: 560 } as const;

/** Web Mercator: longitude and latitude to a pixel on the world at this zoom. */
export function worldPixel(lon: number, lat: number, zoom = ZOOM) {
  const scale = 2 ** zoom * TILE;
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * scale,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * scale,
  };
}

/** The tiles that compose the frame, positioned so the shop lands in the middle. */
export function frameTiles() {
  const centre = worldPixel(SHOP.lon, SHOP.lat);
  const left = centre.x - VIEW.w / 2;
  const top = centre.y - VIEW.h / 2;

  const firstX = Math.floor(left / TILE);
  const firstY = Math.floor(top / TILE);
  // How far the first tile hangs off the top-left corner of the frame.
  const offsetX = firstX * TILE - left;
  const offsetY = firstY * TILE - top;

  const cols = Math.ceil((VIEW.w - offsetX) / TILE);
  const rows = Math.ceil((VIEW.h - offsetY) / TILE);

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      x: firstX + col,
      y: firstY + row,
      left: offsetX + col * TILE,
      top: offsetY + row * TILE,
    })),
  ).flat();
}

/**
 * What the tile route will serve.
 *
 * Derived from the frame rather than stated, so it cannot fall out of step with
 * it. Bounded at all because an unbounded tile proxy is a free map service
 * billed to us.
 */
export function tileBounds() {
  const tiles = frameTiles();
  const xs = tiles.map((t) => t.x);
  const ys = tiles.map((t) => t.y);
  return {
    zoom: ZOOM,
    x: [Math.min(...xs), Math.max(...xs)] as const,
    y: [Math.min(...ys), Math.max(...ys)] as const,
  };
}
