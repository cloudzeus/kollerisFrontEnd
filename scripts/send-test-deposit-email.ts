/**
 * One €0.50 bank-transfer order, end to end, to a chosen address.
 *
 * Exercises the whole path in one go rather than mocking any of it: a real
 * Order row, a real Viva payment order, and the real `sendOrderEmail`. That is
 * the point — the three things that can silently be misconfigured (Viva
 * credentials, Mailgun credentials, the bank details) each fail differently,
 * and only a run that touches all three tells you which.
 *
 * It is a script and not a button because it writes an order that nobody
 * bought. Run deliberately:
 *
 *   NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env \
 *     scripts/send-test-deposit-email.ts gkozyris@i4ria.com
 *
 * The order is marked TEST in its notes and its line name, so anybody who finds
 * it in the admin list knows what it is without asking.
 */

import { prisma } from "../src/lib/prisma";
import { createPaymentOrder, isVivaConfigured } from "../src/lib/payment/viva";
import { sendOrderEmail } from "../src/lib/mail/order-email";

const AMOUNT = 0.5;
const VAT_RATE = 24;

function token(): string {
  return Array.from({ length: 32 }, () =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(
      Math.floor(Math.random() * 62),
    ),
  ).join("");
}

async function main() {
  const to = process.argv[2];
  if (!to) throw new Error("Usage: send-test-deposit-email.ts <email>");

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `KOL-TEST-${day}-`;
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  const seq = last ? Number(last.orderNumber.slice(prefix.length)) + 1 : 1;
  const orderNumber = `${prefix}${String(seq).padStart(2, "0")}`;

  // Net back out of the gross, the same way the cart does it, so the VAT line
  // in the email adds up instead of being a plausible-looking number.
  const net = Math.round((AMOUNT / (1 + VAT_RATE / 100)) * 100) / 100;

  const order = await prisma.order.create({
    data: {
      orderNumber,
      guestToken: token(),
      email: to,
      phone: "+302104220239",
      firstName: "Δοκιμή",
      lastName: "Κατάθεσης",
      shipLine1: "Κ. Μαυρομιχάλη 4",
      shipCity: "Πειραιάς",
      shipPostcode: "18545",
      shipRegion: "Πειραιώς",
      shipAdminRegion: "Αττικής",
      shippingMethod: "courier",
      paymentMethod: "bank",
      paymentStatus: "PENDING",
      status: "CONFIRMED",
      subtotalNet: net,
      subtotalGross: AMOUNT,
      shippingNet: 0,
      shippingGross: 0,
      vatAmount: Math.round((AMOUNT - net) * 100) / 100,
      totalGross: AMOUNT,
      notes: "TEST — δοκιμαστική παραγγελία για έλεγχο email κατάθεσης. Δεν αποστέλλεται.",
      lines: {
        create: [
          {
            sku: "TEST-050",
            name: "Δοκιμαστική χρέωση ελέγχου",
            quantity: 1,
            unitNet: net,
            unitGross: AMOUNT,
            vatRate: VAT_RATE,
            lineNet: net,
            lineGross: AMOUNT,
          },
        ],
      },
    },
    select: { id: true, orderNumber: true },
  });
  console.log(`order        ${order.orderNumber}  ${AMOUNT.toFixed(2)} €`);

  if (!isVivaConfigured()) {
    console.log("viva         NOT CONFIGURED — the email will fall back to the order number");
  } else {
    const payment = await createPaymentOrder({
      amountGross: AMOUNT,
      orderNumber: order.orderNumber,
      description: `Kolleris ${order.orderNumber} (δοκιμή)`,
      locale: "el",
      customer: { email: to, fullName: "Δοκιμή Κατάθεσης" },
      expiryMinutes: 7 * 24 * 60,
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { vivaOrderCode: payment.orderCode },
    });
    console.log(`viva code    ${payment.orderCode}`);
    console.log(`viva link    ${payment.checkoutUrl}`);
  }

  const sent = await sendOrderEmail(order.orderNumber);
  console.log(sent.ok ? `mail         sent → ${to}  (${sent.id})` : `mail         FAILED — ${sent.error}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
