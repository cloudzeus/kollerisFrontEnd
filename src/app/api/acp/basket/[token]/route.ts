import { NextResponse, type NextRequest } from "next/server";
import { siteOrigin, siteOriginConfigured } from "@/lib/seo/urls";
import { prisma } from "@/lib/prisma";
import { setCartCookie } from "@/lib/cart/cart";

/**
 * Adopting an agent-built basket.
 *
 * The storefront cart lives in a cookie and an agent has none. This is the
 * hand-over: the customer opens the link, the token becomes their cart cookie,
 * and from that moment it is an ordinary basket with nothing agent-shaped left
 * in it.
 *
 * A GET because it arrives as a link in a chat window, and a link is a GET
 * whatever anyone intends. That makes it guessable in principle, which is why
 * the token is 32 random bytes: adopting one exposes a basket and nothing else,
 * no name, no address, no payment method.
 *
 * Lands on the basket rather than the payment step. Somebody who did not
 * assemble this themselves should see what is in it before they are asked for
 * a postcode.
 */
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const cart = await prisma.cart.findUnique({
    where: { token },
    select: { id: true, lines: { select: { id: true }, take: 1 } },
  });

  // An unknown or emptied token goes to the basket page rather than a 404: the
  // customer clicked a link they were sent, and a dead end helps nobody.
  if (!cart || cart.lines.length === 0) {
    return NextResponse.redirect(new URL("/kalathi", basketBase(request)));
  }

  await setCartCookie(token);
  await prisma.cart.update({ where: { id: cart.id }, data: { lastSeenAt: new Date() } });

  return NextResponse.redirect(new URL("/kalathi", basketBase(request)));
}

/**
 * Same reason as the payment return: behind the proxy `request.url` is the
 * address the Node process is bound to, so a redirect built from it sends the
 * customer to `https://0.0.0.0:3000`. Configured origin first; `request.url`
 * only where nothing is configured, which is development.
 */
function basketBase(request: { url: string }): string {
  return siteOriginConfigured() ? siteOrigin() : request.url;
}
