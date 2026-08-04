import { NextResponse } from "next/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { suggestAddresses } from "@/lib/geo/maptiler";

/**
 * Address suggestions for the checkout field.
 *
 * A route handler rather than a call from the browser, so the MapTiler key
 * stays on this side. A geocoding key in client JavaScript is a key anyone can
 * read and spend.
 *
 * Answers are cached briefly and shared: two customers typing "Μαυρομιχ" want
 * the same list, and the field fires on nearly every keystroke.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = params.get("q") ?? "";
  const asked = params.get("locale") ?? routing.defaultLocale;
  const locale = hasLocale(routing.locales, asked) ? asked : routing.defaultLocale;

  const suggestions = await suggestAddresses(query, locale);

  return NextResponse.json(
    { suggestions },
    {
      headers: {
        // Streets do not move. A minute of shared cache takes most of the
        // repeat traffic off the geocoder without anyone noticing.
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    },
  );
}
