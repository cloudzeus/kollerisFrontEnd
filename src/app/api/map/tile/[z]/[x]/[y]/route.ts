/**
 * One map tile, fetched with our key rather than the visitor's browser.
 *
 * MapTiler puts the key in the query string, so a tile URL in the markup would
 * publish it to everyone who loads the page. This way the browser asks us.
 *
 * MapTiler's static-map endpoint would have done the whole picture in one
 * request, but this account returns 403 for it and Google's equivalent is not
 * enabled on its project either. Tiles work on both, and a static map is only
 * a grid of tiles with the right offset, so that is what this builds.
 */

const KEY = process.env.MAPTILER_API_KEY;
/** Around the shop only. An open tile proxy is a free map service billed to us. */
const ZOOM = 16;
const BOUNDS = { x: [37069, 37073], y: [25288, 25292] } as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;
  const [zn, xn, yn] = [Number(z), Number(x), Number(y)];

  if (!KEY) return new Response("map not configured", { status: 503 });
  if (
    zn !== ZOOM ||
    !(xn >= BOUNDS.x[0] && xn <= BOUNDS.x[1]) ||
    !(yn >= BOUNDS.y[0] && yn <= BOUNDS.y[1])
  ) {
    return new Response("out of bounds", { status: 404 });
  }

  const upstream = await fetch(
    `https://api.maptiler.com/maps/streets-v2/${zn}/${xn}/${yn}.png?key=${KEY}`,
    // The street layout is not news. Hold it for a week.
    { next: { revalidate: 604_800 } },
  );
  if (!upstream.ok) return new Response("tile unavailable", { status: 502 });

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=604800, s-maxage=2592000, immutable",
    },
  });
}
