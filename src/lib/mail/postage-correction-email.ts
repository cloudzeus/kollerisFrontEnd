import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { PAYMENT_METHODS } from "@/lib/cart/options";
import { siteOrigin } from "@/lib/seo/urls";
import { emailLocale, formatMoney, formatStamp, paymentLabelEn, pick, type EmailLocale } from "@/lib/mail/email-locale";

/**
 * «Συγγνώμη για το λάθος» — the corrected price, and a way to pay it.
 *
 * Sent by an operator after the postage of an unpaid order was re-priced. It
 * owns the mistake in plain words, shows the old figures struck through next to
 * the new ones, and links to `/api/payment/pay/…`, which opens a Viva payment
 * for whatever the order holds at the moment of the click — so the button
 * still works when the email is read the next day.
 */



export async function sendPostageCorrectionEmail(
  orderNumber: string,
  correction: { previousShippingGross: number; previousTotalGross: number; message?: string },
  options: { locale?: EmailLocale } = {},
) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) return { ok: false as const, error: "Η παραγγελία δεν βρέθηκε." };

  const locale = emailLocale(order, options.locale);
  const t = pick(locale);
  const money = (value: number) => formatMoney(locale, value);
  const stamp = (date: Date) => formatStamp(locale, date, false);

  const payUrl = `${siteOrigin()}/api/payment/pay/${order.orderNumber}?t=${order.guestToken}`;
  const method =
    locale === "en"
      ? paymentLabelEn(order.paymentMethod)
      : (PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label ?? order.paymentMethod);
  const message = correction.message?.trim().slice(0, 1500) || "";

  return sendTemplateMail({
    to: order.email,
    templateId: "order-price-correction",
    locale,
    subject: t(`Διόρθωση τιμής — παραγγελία ${order.orderNumber}`, `Price correction — order ${order.orderNumber}`),
    preheader: t(
      `Υπολογίσαμε λάθος τα μεταφορικά. Νέο σύνολο ${money(Number(order.totalGross))} — δεν έγινε καμία χρέωση.`,
      `We calculated the shipping wrongly. New total ${money(Number(order.totalGross))} — you have not been charged.`,
    ),
    context: order.orderNumber,
    data: {
      recipient: { first_name: order.firstName, last_name: order.lastName, email: order.email },
      order: {
        number: order.orderNumber,
        date: stamp(order.createdAt),
        subtotal: money(Number(order.subtotalGross)),
      },
      correction: {
        previous_shipping: money(correction.previousShippingGross),
        shipping: money(Number(order.shippingGross)),
        previous_total: money(correction.previousTotalGross),
        total: money(Number(order.totalGross)),
        message,
      },
      payment: { method, pay_url: payUrl },
    },
    text: [
      t(`Διόρθωση τιμής — παραγγελία ${order.orderNumber}`, `Price correction — order ${order.orderNumber}`),
      "",
      t(
        `${order.firstName}, υπολογίσαμε λάθος τα μεταφορικά της παραγγελίας σας: ${money(correction.previousShippingGross)} αντί για ${money(Number(order.shippingGross))}. Το λάθος ήταν δικό μας και σας ζητούμε συγγνώμη.`,
        `${order.firstName}, we calculated the shipping of your order wrongly: ${money(correction.previousShippingGross)} instead of ${money(Number(order.shippingGross))}. The mistake was ours and we apologise.`,
      ),
      t("Δεν έγινε καμία χρέωση στην κάρτα σας.", "Your card has not been charged."),
      ...(message ? ["", message] : []),
      "",
      `${t("Προϊόντα", "Products")}: ${money(Number(order.subtotalGross))}`,
      `${t("Μεταφορικά", "Shipping")}: ${money(Number(order.shippingGross))} (${t("αντί", "instead of")} ${money(correction.previousShippingGross)})`,
      `${t("Νέο σύνολο", "New total")}: ${money(Number(order.totalGross))} (${t("αντί", "instead of")} ${money(correction.previousTotalGross)})`,
      "",
      `${t("Ολοκλήρωση πληρωμής", "Complete payment")}: ${payUrl}`,
      "",
      t(
        "Χρειάζεστε βοήθεια; +30 210 411 1355 (Δευ–Παρ 08:00–17:00) ή απαντήστε σε αυτό το email.",
        "Need help? +30 210 411 1355 (Mon–Fri 08:00–17:00) or reply to this email.",
      ),
    ].join("\n"),
  });
}
