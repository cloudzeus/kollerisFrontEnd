import { NextResponse, type NextRequest } from "next/server";
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
    return NextResponse.redirect(new URL("/kalathi", request.url));
  }

  await setCartCookie(token);
  await prisma.cart.update({ where: { id: cart.id }, data: { lastSeenAt: new Date() } });

  return NextResponse.redirect(new URL("/kalathi", request.url));
}
