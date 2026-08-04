import { NextResponse, type NextRequest } from "next/server";
import { identifyCaller, takeToken, isAcpConfigured } from "@/lib/acp/auth";
import { buildBasket, type BasketItem } from "@/lib/acp/basket";

/**
 * Agentic Commerce Protocol: hand a basket back to a person.
 *
 * The agent aggregates what the customer wants and posts it here. It gets a URL
 * and nothing else — no card fields, no payment intent, no total it could
 * misquote. Opening that URL adopts the basket into a normal session, and the
 * customer finishes on the checkout that already exists, where the postcode
 * gives the postage and the basket re-checks availability against live stock.
 *
 * That division is the point: the agent is good at working out what to buy and
 * has no business handling money.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isAcpConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const caller = identifyCaller(request);
  if (!caller) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const verdict = takeToken(caller);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "rate_limited", retry_after_seconds: verdict.retryAfter },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
    );
  }

  let body: { items?: BasketItem[] };
  try {
    body = (await request.json()) as { items?: BasketItem[] };
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "items_required" }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? request.nextUrl.origin;
  const result = await buildBasket(body.items, origin);

  if ("error" in result) {
    return NextResponse.json(result, { status: 400 });
  }

  console.log(
    `[acp] ${caller.name} basket ${result.cart_token.slice(0, 8)}… ` +
      `${result.added.length} lines, ${result.not_found.length} unmatched`,
  );

  return NextResponse.json(
    {
      ...result,
      next_step:
        "Send the customer to checkout_url. Shipping and final availability are " +
        "calculated there, from the delivery postcode and live stock.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
