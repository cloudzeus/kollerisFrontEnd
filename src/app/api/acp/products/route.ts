import { NextResponse, type NextRequest } from "next/server";
import { identifyCaller, takeToken, isAcpConfigured, ACP_RATE } from "@/lib/acp/auth";
import { searchCatalog } from "@/lib/acp/catalog";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Agentic Commerce Protocol: the catalogue.
 *
 * A GET so it can be cached, retried and reasoned about by anything that speaks
 * HTTP. Answers are shaped for a machine that will quote whatever number it is
 * handed: prices are gross, shipping is stated as excluded, and stock is stated
 * as indicative, in the field names rather than in documentation.
 *
 * Behind a key from the first day. Not because the catalogue is secret — it is
 * on the public web — but because 5.307 products at 416 bytes each is half a
 * megabyte, and an unnamed caller pulling all of it is indistinguishable from a
 * competitor doing the same. A key makes "who is pulling what" answerable, and
 * makes one agent stoppable without stopping the others.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAcpConfigured()) {
    // 503, not 401: nothing is wrong with the request, this end is not set up.
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const caller = identifyCaller(request);
  if (!caller) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const verdict = takeToken(caller);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: verdict.retryAfter },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
    );
  }

  const params = request.nextUrl.searchParams;
  const asked = (params.get("locale") ?? "").toLowerCase();
  const locale: Locale = (routing.locales as readonly string[]).includes(asked)
    ? (asked as Locale)
    : routing.defaultLocale;

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;

  try {
    const result = await searchCatalog({
      q: params.get("q"),
      category: params.get("category"),
      limit: params.get("limit") ? Number(params.get("limit")) : null,
      locale,
      origin,
    });

    console.log(
      `[acp] ${caller.name} q=${params.get("q") ?? "-"} cat=${params.get("category") ?? "-"} → ${result.products.length}/${result.total}`,
    );

    return NextResponse.json(result, {
      headers: {
        // The catalogue moves about 45 products a day. Five minutes of shared
        // cache absorbs an agent asking the same question three ways.
        "Cache-Control": "public, max-age=60, s-maxage=300",
        "X-RateLimit-Limit": String(ACP_RATE.max),
        "X-RateLimit-Remaining": String(verdict.remaining),
      },
    });
  } catch (error) {
    console.error("[acp] search failed", error);
    return NextResponse.json({ error: "search_failed" }, { status: 500 });
  }
}
