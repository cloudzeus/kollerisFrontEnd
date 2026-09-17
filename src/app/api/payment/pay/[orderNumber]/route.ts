import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPaymentOrder, isVivaConfigured } from "@/lib/payment/viva";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * A payment link that does not expire.
 *
 * A Viva payment order lives for minutes to hours; an email is opened the next
 * morning. So an email links here instead, and the Viva order is created at
 * the moment of the click — for the amount the order holds NOW, which after a
 * price correction is the corrected one.
 *
 * The guest token is the authorisation, exactly as on the confirmation page.
 * A paid, cancelled or unknown order never reaches Viva.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const token = request.nextUrl.searchParams.get("t");
  const origin = siteOrigin();

  const order = await prisma.order.findUnique({
    where: { orderNumber: decodeURIComponent(orderNumber) },
    select: {
      id: true,
      orderNumber: true,
      guestToken: true,
      status: true,
      paymentStatus: true,
      totalGross: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
    },
  });

  if (!order || !token || token !== order.guestToken) {
    return NextResponse.redirect(`${origin}/`, 303);
  }

  const confirmation = `${origin}/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`;
  const payable =
    order.paymentStatus !== "PAID" && (order.status === "PENDING_PAYMENT" || order.status === "FAILED");
  if (!payable || !isVivaConfigured()) return NextResponse.redirect(confirmation, 303);

  try {
    const payment = await createPaymentOrder({
      amountGross: Number(order.totalGross),
      orderNumber: order.orderNumber,
      description: `Kolleris ${order.orderNumber}`,
      locale: "el",
      customer: {
        email: order.email,
        fullName: `${order.firstName} ${order.lastName}`,
        phone: order.phone,
      },
      notifyCustomer: false,
    });
    await prisma.order.update({
      where: { id: order.id },
      // FAILED goes back to waiting: this click is a new attempt.
      data: { vivaOrderCode: payment.orderCode, status: "PENDING_PAYMENT" },
    });
    return NextResponse.redirect(payment.checkoutUrl, 303);
  } catch (error) {
    console.error(`[payment-link] ${order.orderNumber}`, error);
    return NextResponse.redirect(confirmation, 303);
  }
}
