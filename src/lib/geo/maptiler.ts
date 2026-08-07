import "server-only";
import type { Locale } from "@/i18n/routing";

/**
 * Maps and address lookup.
 *
 * One vendor for both, chosen by testing rather than reputation. Asked for
 * "Μαυρομιχάλη 4 Πειραι", Google Places returns a cleaner ranking but no
 * postcode — that needs a second Place Details call, billed separately. MapTiler
 * returns the postcode, the municipality and the coordinates in the same
 * response, and the checkout cannot price a delivery without the postcode.
 *
 * `GOOGLE_MAPS_API_KEY` and `GEOCODE_API` stay in `.env` as fallbacks. If Greek
 * coverage ever proves thin, Google is the better geocoder and the swap is this
 * one file.
 *
 * `server-only`: every call goes through a route handler, so the key never
 * reaches a browser. A key in client JavaScript is a key anyone can spend.
 */

const KEY = process.env.MAPTILER_API_KEY;
const GEOCODE = "https://api.maptiler.com/geocoding";

export type AddressSuggestion = {
  /** What the customer reads in the list. */
  label: string;
  /** Street and number, ready for the address line. */
  line1: string;
  city: string;
  /** Five digits, no space. Greek postcodes arrive as "185 45". */
  postcode: string;
  /** Νομός — the regional unit. "Πειραιώς", "Θεσσαλονίκης". */
  region: string;
  /** Περιφέρεια — the administrative region above it. "Αττικής". */
  adminRegion: string;
};

/** The first context entry of a given kind. MapTiler ids are `kind.number`. */
const context = (feature: MapTilerFeature, kind: string): string =>
  feature.context?.find((c) => c.id.startsWith(`${kind}.`))?.text ?? "";

/**
 * Which MapTiler context level is which Greek administrative unit.
 *
 * Not guessable from the names, and getting it wrong is silent — every value is
 * a plausible-looking Greek place name, so a field filled from the wrong level
 * looks filled rather than wrong. For «Μαυρομιχάλη 4, Πειραιάς» MapTiler answers:
 *
 *   county    → Περιφερειακή Ενότητα Πειραιώς   ← the ΝΟΜΟΣ
 *   subregion → Περιφέρεια Αττικής              ← the ΠΕΡΙΦΕΡΕΙΑ
 *   region    → Αποκεντρωμένη Διοίκηση Αττικής  ← neither; not an address field
 *
 * This is what the previous mapping got wrong: it read `subregion` into the
 * field labelled Νομός, so picking a suggestion in Piraeus wrote "Περιφέρεια
 * Αττικής" under «Νομός» — the right country, the wrong administrative level,
 * and nothing on screen to say so.
 */
const NOMOS = "county";
const PERIFEREIA = "subregion";

/**
 * Drop the prefix that repeats the field's own label.
 *
 * The field says «Νομός» and the value says "Περιφερειακή Ενότητα Πειραιώς";
 * together they read as a sentence nobody writes on an envelope. Stripped, the
 * form reads Νομός: Πειραιώς — which is how it is written by hand. A value that
 * arrives without the prefix is left exactly as it came.
 */
const shorten = (value: string): string =>
  value
    // «Μητροπολιτική Ενότητα» is what Athens and Thessaloniki come back as —
    // found by asking for a Thessaloniki street, not by reading a spec.
    .replace(/^(Μητροπολιτική Ενότητα|Περιφερειακή Ενότητα|Περιφέρεια|Νομός|Νομ\.)\s+/u, "")
    .trim();

type MapTilerFeature = {
  place_name?: string;
  text?: string;
  address?: string;
  center?: [number, number];
  context?: Array<{ id: string; text: string }>;
};

/**
 * Address suggestions for a partly-typed query.
 *
 * Scoped to Greece and to the language being shopped in. Returns an empty list
 * rather than throwing: a checkout field that cannot suggest must still accept
 * what the customer types, so a geocoder having a bad day is not their problem.
 */
export async function suggestAddresses(
  query: string,
  locale: Locale,
): Promise<AddressSuggestion[]> {
  const q = query.trim();
  // Three characters is where suggestions stop being noise, and it keeps a
  // keystroke-per-request field from spending the quota on "Μα".
  if (!KEY || q.length < 3) return [];

  const url =
    `${GEOCODE}/${encodeURIComponent(q)}.json` +
    `?key=${KEY}&country=gr&language=${locale}&autocomplete=true&limit=6&types=address,street`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return [];
    const data = (await response.json()) as { features?: MapTilerFeature[] };

    return (data.features ?? []).flatMap((feature) => {
      const street = feature.text?.trim() ?? "";
      if (!street) return [];
      const number = feature.address?.trim();
      const postcode = context(feature, "postal_code").replace(/\s+/g, "");
      const city = context(feature, "municipality") || context(feature, "place");

      return [
        {
          label: feature.place_name ?? street,
          line1: number ? `${street} ${number}` : street,
          city,
          postcode,
          region: shorten(context(feature, NOMOS)),
          adminRegion: shorten(context(feature, PERIFEREIA)),
        },
      ];
    });
  } catch {
    // Timeout or network. Same answer as no matches: the field still works.
    return [];
  }
}

/**
 * A picture of a place on the map.
 *
 * The static API on purpose: an interactive map means third-party JavaScript,
 * a canvas, tile requests as the customer pans, and a consent conversation
 * about all of it. A contact page needs to answer "where is it", and an image
 * answers that with one request and no cookies.
 */
export function staticMapUrl({
  lon,
  lat,
  width = 1200,
  height = 600,
  zoom = 15,
}: {
  lon: number;
  lat: number;
  width?: number;
  height?: number;
  zoom?: number;
}): string | null {
  if (!KEY) return null;
  // `@2x` for the same reason every other image here is served at 2x.
  return (
    `https://api.maptiler.com/maps/streets-v2/static/${lon},${lat},${zoom}/${width}x${height}@2x.png` +
    `?key=${KEY}&markers=${lon},${lat}`
  );
}
