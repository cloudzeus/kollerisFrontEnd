import { NextResponse, type NextRequest } from "next/server";
import { getSuggestions, SUGGEST_MIN_LENGTH } from "@/lib/catalog/suggest";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Header search suggestions.
 *
 * A route handler rather than a server action: this is a GET that fires on
 * every keystroke, and only a GET can be cached, aborted cleanly by the browser
 * on the next character, and replayed from the back/forward cache.
 *
 * The catalogue changes once a day, so the same query is worth caching for a
 * minute at the edge — a shop-floor customer typing "τρυπανι" letter by letter
 * generates seven requests whose answers are stable.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim() ?? "";

  const requested = params.get("locale");
  const locale: Locale = routing.locales.includes(requested as Locale)
    ? (requested as Locale)
    : routing.defaultLocale;

  if (query.length < SUGGEST_MIN_LENGTH) {
    return NextResponse.json({
      query,
      exact: null,
      products: [],
      categories: [],
      brands: [],
      totalProducts: 0,
    });
  }

  try {
    const result = await getSuggestions(query, locale);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    console.error("[suggest]", error);
    return NextResponse.json({ error: "suggest_failed" }, { status: 500 });
  }
}
