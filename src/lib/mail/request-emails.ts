import "server-only";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { internalOrderRecipients } from "@/lib/mail/order-internal-email";
import { siteOrigin } from "@/lib/seo/urls";
import { findShippingMethod } from "@/lib/cart/options";
import { localityLine } from "@/lib/shipping/countries";
import {
  emailLocale,
  formatMoney,
  formatStamp,
  pick,
  shippingLabelEn,
  type EmailLocale,
} from "@/lib/mail/email-locale";
import {
  REQUEST_ANSWER_HOURS,
  compareOffer,
  offerShippingNet,
  priceLines,
  readSnapshot,
  readStoredOffer,
  requestPath,
  type ComparisonRow,
} from "@/lib/requests/model";

/**
 * The back-order request emails (docs/backorder-requests.md §7).
 *
 *   received   «Λάβαμε το αίτημά σας — θα επιβεβαιωθεί εντός 24 ωρών»
 *   offer      the offer is ready, with the link
 *   reminder   the one reminder, 24 hours into an unanswered offer
 *   rejected   the shop cannot supply it, with the reason
 *   expired    the offer ran out
 *   internal   to the shop, when a request arrives
 *
 * One template (`order-request`) for all of them: they are the same email —
 * a status, a few sentences, the lines, a button — with different words. Greek
 * only, like every other transactional email of this shop; the button opens the
 * page in the language the customer used.
 *
 * ── The link is the credential ─────────────────────────────────────────────
 *
 * `/aitima/{token}` opens without a login. Every customer email here goes out
 * with Mailgun tracking OFF, so the link is not rewritten through Mailgun's
 * redirect host and the token never sits in somebody else's click log.
 */

export type RequestEmailKind = "received" | "offer" | "reminder" | "rejected" | "expired";

export type RequestMailOutcome = { ok: true; id: string } | { ok: false; error: string };

const money = (value: unknown) => `${Number(value).toFixed(2).replace(".", ",")} €`;

function stamp(date: Date): string {
  const p = new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Athens",
    hourCycle: "h23",
  }).formatToParts(date);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}.${g("month")}.${g("year")}, ${g("hour")}:${g("minute")}`;
}

async function loadRequest(orderNumber: string) {
  return prisma.order.findUnique({
    where: { orderNumber },
    include: { lines: true },
  });
}

type LoadedRequest = NonNullable<Awaited<ReturnType<typeof loadRequest>>>;

/**
 * The paid half of a split cart, as the request emails mention it: number,
 * amount, postage, and whether the money is in yet (the «received» email goes
 * out at checkout, before the customer reaches Viva).
 */
export type ParentFacts = {
  orderNumber: string;
  totalGross: unknown;
  shippingGross: unknown;
  shippingMethod: string;
  paymentMethod: string;
  paymentStatus: string;
};

async function loadParent(order: { parentOrderNumber: string | null }): Promise<ParentFacts | null> {
  if (!order.parentOrderNumber) return null;
  return prisma.order.findUnique({
    where: { orderNumber: order.parentOrderNumber },
    select: {
      orderNumber: true,
      totalGross: true,
      shippingGross: true,
      shippingMethod: true,
      paymentMethod: true,
      paymentStatus: true,
    },
  });
}

/** «… KOL-…: 62,00 € μαζί με μεταφορικά 4,96 €» — the paid half, in one sentence. */
function parentSentence(parent: ParentFacts, locale: EmailLocale = "el"): string {
  const t = pick(locale);
  const money = (value: unknown) => formatMoney(locale, value);
  const shipping =
    parent.shippingMethod === "pickup"
      ? t("παραλαβή από το κατάστημα", "collection from the shop")
      : Number(parent.shippingGross) === 0
        ? t("με δωρεάν μεταφορικά", "with free shipping")
        : t(`μαζί με μεταφορικά ${money(parent.shippingGross)}`, `plus ${money(parent.shippingGross)} shipping`);
  return parent.paymentStatus === "PAID"
    ? t(
        `Τα διαθέσιμα είδη του καλαθιού σας πληρώθηκαν στην παραγγελία ${parent.orderNumber}: ${money(parent.totalGross)} ${shipping}.`,
        `The available items of your basket were paid in order ${parent.orderNumber}: ${money(parent.totalGross)}, ${shipping}.`,
      )
    : t(
        `Τα διαθέσιμα είδη του καλαθιού σας είναι η παραγγελία ${parent.orderNumber}: ${money(parent.totalGross)} ${shipping}, ${
          parent.paymentMethod === "bank" ? "που πληρώνετε με τραπεζική κατάθεση" : "που πληρώνετε τώρα"
        }.`,
        `The available items of your basket are order ${parent.orderNumber}: ${money(parent.totalGross)}, ${shipping}, ${
          parent.paymentMethod === "bank" ? "which you pay by bank transfer" : "which you pay now"
        }.`,
      );
}

const BADGE: Record<RequestEmailKind, { text: string; en: string; color: string; bg: string }> = {
  received: { text: "Σε επεξεργασια", en: "Processing", color: "#9A6700", bg: "#FFF4D6" },
  offer: { text: "Προταση", en: "Offer", color: "#1F7A45", bg: "#E3F4EA" },
  reminder: { text: "Προταση", en: "Offer", color: "#1F7A45", bg: "#E3F4EA" },
  rejected: { text: "Δεν εξυπηρετειται", en: "Cannot be served", color: "#C42A26", bg: "#FDECEB" },
  expired: { text: "Εληξε", en: "Expired", color: "#5F6061", bg: "#EFEFEF" },
};

function comparisonItem(row: ComparisonRow, locale: EmailLocale = "el") {
  const t = pick(locale);
  const money = (value: unknown) => formatMoney(locale, value);
  const unitGross = (unitNet: number, vatRate: number) => unitNet * (1 + vatRate / 100);
  if (row.kind === "removed") {
    const r = row.requested;
    return {
      tag: t("Δεν διατίθεται", "Not available"),
      name: r.name,
      sku: r.sku,
      detail: t(`${r.qty} τεμ.`, `${r.qty} pcs`),
      amount: money(unitGross(r.unitNet, r.vatRate) * r.qty),
      struck: true,
      was: "",
    };
  }
  const o = row.offered;
  const line = priceLines([o], 0).lines[0];
  const base = {
    name: o.name,
    sku: o.sku,
    detail: `${t(`${o.qty} τεμ.`, `${o.qty} pcs`)} × ${money(line.unitGross)}${o.leadTimeText ? ` · ${o.leadTimeText}` : ""}`,
    amount: money(line.lineGross),
    struck: false,
  };
  if (row.kind === "alternative") {
    return { ...base, tag: t("Εναλλακτικο", "Alternative"), was: row.requested ? `${t("Αντί για", "Instead of")}: ${row.requested.name}` : "" };
  }
  if (row.kind === "added") return { ...base, tag: t("Προσθηκη", "Added"), was: "" };
  if (row.kind === "modified") {
    const r = row.requested;
    const was = [
      row.qtyChanged ? t(`ζητήσατε ${r.qty} τεμ.`, `you asked for ${r.qty} pcs`) : "",
      row.priceChanged ? t(`ενδεικτική τιμή ${money(unitGross(r.unitNet, r.vatRate))}`, `indicative price ${money(unitGross(r.unitNet, r.vatRate))}`) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return { ...base, tag: t("Αλλαγη", "Changed"), was: was ? `${t("Αρχικά", "Originally")}: ${was}` : "" };
  }
  return { ...base, tag: "", was: "" };
}

/** Everything every request email needs, from the order row. Exported for the tests. */
export function requestEmailView(
  order: LoadedRequest,
  kind: RequestEmailKind,
  /** The paid half of a split cart, when there is one (`parentOrderNumber`). */
  parent: ParentFacts | null = null,
  options: { locale?: EmailLocale } = {},
) {
  const snapshot = readSnapshot(order.requestLines);
  /* R-EMAIL-EN: English abroad except Cyprus. The link keeps the language the customer asked from, unless the email is English. */
  const mailLocale = emailLocale(order, options.locale);
  const t = pick(mailLocale);
  const money = (value: unknown) => formatMoney(mailLocale, value);
  const stamp = (date: Date) => formatStamp(mailLocale, date);
  const locale = mailLocale === "en" ? "en" : (snapshot?.locale ?? "el");
  const link = order.requestToken ? `${siteOrigin()}${requestPath(locale, order.requestToken)}` : siteOrigin();
  const offer = readStoredOffer(order.offerJson);
  const requested = snapshot?.lines ?? [];

  const base = {
    subject: "",
    eyebrow: "",
    title: "",
    number: order.orderNumber,
    date: stamp(order.requestedAt ?? order.createdAt),
    badge: mailLocale === "en" ? BADGE[kind].en : BADGE[kind].text,
    badge_color: BADGE[kind].color,
    badge_bg: BADGE[kind].bg,
    paragraphs: [] as string[],
    note: "",
    note_label: "",
    facts: [] as Array<{ label: string; value: string }>,
    items_title: "",
    items: [] as Array<ReturnType<typeof comparisonItem>>,
    totals: [] as Array<{ label: string; value: string }>,
    total: null as { label: string; value: string } | null,
    cta: { url: link, label: t("Δείτε το αίτημα", "View the request"), hint: "" },
  };
  const name = order.firstName;

  if (kind === "received") {
    const priced = priceLines(requested, 0);
    return {
      ...base,
      subject: t(
        `Λάβαμε το αίτημά σας ${order.orderNumber} — θα επιβεβαιωθεί εντός ${REQUEST_ANSWER_HOURS} ωρών`,
        `We received your request ${order.orderNumber} — we will confirm within ${REQUEST_ANSWER_HOURS} hours`,
      ),
      eyebrow: t("Κατοπιν παραγγελιας / Αιτημα", "On order / Request"),
      title: t("Λάβαμε το αίτημά σας", "We received your request"),
      paragraphs: [
        t(
          `${name}, λάβαμε το αίτημά σας για προϊόντα που δεν υπάρχουν αυτή τη στιγμή στην αποθήκη μας. Θα σας απαντήσουμε εντός ${REQUEST_ANSWER_HOURS} ωρών με τελική τιμή, διαθεσιμότητα και χρόνο παράδοσης.`,
          `${name}, we received your request for products that are not in our warehouse right now. We will reply within ${REQUEST_ANSWER_HOURS} hours with a final price, availability and delivery time.`,
        ),
        t(
          "Δεν έγινε καμία χρέωση. Πληρώνετε μόνο αν αποδεχτείτε την πρότασή μας, από τον σύνδεσμο που θα σας στείλουμε.",
          "You have not been charged. You only pay if you accept our offer, from the link we will send you.",
        ),
        ...(parent
          ? [
              parentSentence(parent, mailLocale),
              t(
                "Τα προϊόντα αυτού του αιτήματος θα σταλούν χωριστά, σε δεύτερη αποστολή· τα μεταφορικά τους θα τα δείτε στην πρόταση.",
                "The products of this request will ship separately, as a second shipment; you will see their shipping cost in the offer.",
              ),
            ]
          : order.parentOrderNumber
            ? [
                t(
                  `Τα διαθέσιμα προϊόντα του καλαθιού σας προχωρούν κανονικά με την παραγγελία ${order.parentOrderNumber}.`,
                  `The available products of your basket go ahead as normal with order ${order.parentOrderNumber}.`,
                ),
              ]
            : []),
      ],
      facts: parent
        ? [
            { label: t("Πληρωτεο τωρα", "To pay now"), value: `${parent.orderNumber} · ${money(parent.totalGross)}` },
            {
              label: t("Αυτο το αιτημα", "This request"),
              value: t("Χωρίς χρέωση τώρα · 2η αποστολή", "No charge now · 2nd shipment"),
            },
          ]
        : [],
      items_title: t("Τι ζητήσατε", "What you asked for"),
      items: requested.map((r) => ({
        tag: "",
        name: r.name,
        sku: r.sku,
        detail: t(`${r.qty} τεμ.`, `${r.qty} pcs`),
        amount: money(r.unitNet * (1 + r.vatRate / 100) * r.qty),
        struck: false,
        was: "",
      })),
      totals: [
        {
          label: parent ? t("Μεταφορικα 2ης αποστολης", "Shipping of the 2nd shipment") : t("Μεταφορικα", "Shipping"),
          value: t("Με την πρόταση", "With the offer"),
        },
      ],
      total: { label: t("Ενδεικτικη αξια", "Indicative value"), value: money(priced.subtotalGross) },
      cta: {
        url: link,
        label: t("Δείτε το αίτημα", "View the request"),
        hint: t("Ο σύνδεσμος είναι προσωπικός — μην τον προωθήσετε.", "The link is personal — please do not forward it."),
      },
    };
  }

  if (kind === "rejected") {
    const reason = offer?.decision === "reject" ? offer.reason : null;
    return {
      ...base,
      subject: t(
        `Το αίτημα ${order.orderNumber} δεν μπορεί να εξυπηρετηθεί`,
        `Request ${order.orderNumber} cannot be served`,
      ),
      eyebrow: t("Κατοπιν παραγγελιας / Απαντηση", "On order / Answer"),
      title: t("Λυπούμαστε", "We are sorry"),
      paragraphs: [
        t(
          `${name}, δυστυχώς δεν μπορούμε να εξυπηρετήσουμε το αίτημά σας ${order.orderNumber}. Δεν έγινε καμία χρέωση.`,
          `${name}, unfortunately we cannot serve your request ${order.orderNumber}. You have not been charged.`,
        ),
        t(
          "Αν θέλετε να συζητήσουμε κάποια εναλλακτική, απαντήστε σε αυτό το email ή καλέστε μας.",
          "If you would like to discuss an alternative, reply to this email or call us.",
        ),
      ],
      note: reason ?? "",
      note_label: reason ? t("Αιτιολογια", "Reason") : "",
    };
  }

  if (kind === "expired") {
    return {
      ...base,
      subject: t(
        `Η πρόταση για το αίτημα ${order.orderNumber} έληξε`,
        `The offer for request ${order.orderNumber} has expired`,
      ),
      eyebrow: t("Κατοπιν παραγγελιας / Ληξη", "On order / Expiry"),
      title: t("Η πρόταση έληξε", "The offer has expired"),
      paragraphs: [
        t(
          `${name}, η πρότασή μας για το αίτημα ${order.orderNumber} έληξε χωρίς να ολοκληρωθεί. Δεν έγινε καμία χρέωση.`,
          `${name}, our offer for request ${order.orderNumber} expired without being completed. You have not been charged.`,
        ),
        t(
          "Αν ενδιαφέρεστε ακόμη, επικοινωνήστε μαζί μας και θα σας ενημερώσουμε για τη νέα διαθεσιμότητα και τιμή.",
          "If you are still interested, contact us and we will tell you the new availability and price.",
        ),
      ],
    };
  }

  // offer · reminder
  if (offer?.decision !== "offer") return null;
  const rows = compareOffer(requested, offer.lines);
  const shippingNet = offerShippingNet(offer);
  const totals = priceLines(offer.lines, shippingNet ?? 0);
  const expires = order.offerExpiresAt ?? new Date(offer.expiresAt);
  const shippingLabel =
    mailLocale === "en"
      ? shippingLabelEn(order.shippingMethod)
      : (findShippingMethod(order.shippingMethod)?.label ?? order.shippingMethod);
  const reminder = kind === "reminder";

  return {
    ...base,
    subject: reminder
      ? t(
          `Υπενθύμιση: η πρότασή μας για το αίτημα ${order.orderNumber} σας περιμένει`,
          `Reminder: our offer for request ${order.orderNumber} is waiting for you`,
        )
      : t(
          `Η πρότασή μας για το αίτημα ${order.orderNumber} είναι έτοιμη`,
          `Our offer for request ${order.orderNumber} is ready`,
        ),
    eyebrow: reminder
      ? t("Κατοπιν παραγγελιας / Υπενθυμιση", "On order / Reminder")
      : t("Κατοπιν παραγγελιας / Προταση", "On order / Offer"),
    title: reminder
      ? t("Η πρότασή μας σας περιμένει", "Our offer is waiting for you")
      : t("Η πρότασή μας είναι έτοιμη", "Our offer is ready"),
    paragraphs: [
      reminder
        ? t(
            `${name}, η πρότασή μας για το αίτημα ${order.orderNumber} ισχύει έως ${stamp(expires)}. Μετά από αυτό τα προϊόντα δεν θα είναι πια δεσμευμένα για εσάς.`,
            `${name}, our offer for request ${order.orderNumber} is valid until ${stamp(expires)}. After that the products will no longer be reserved for you.`,
          )
        : t(
            `${name}, ετοιμάσαμε την πρότασή μας για το αίτημά σας ${order.orderNumber}. Ελέγξτε τα προϊόντα, τις τιμές και τον χρόνο παράδοσης και, αν σας καλύπτουν, ολοκληρώστε με πληρωμή.`,
            `${name}, we have prepared our offer for your request ${order.orderNumber}. Please check the products, prices and delivery time and, if they suit you, complete it with payment.`,
          ),
      ...(order.parentOrderNumber
        ? [
            t(
              `Αυτή είναι η δεύτερη αποστολή του καλαθιού σας: τα διαθέσιμα είδη προχώρησαν χωριστά με την παραγγελία ${order.parentOrderNumber}. Τα μεταφορικά παρακάτω αφορούν μόνο αυτή την αποστολή και χρεώνονται χωριστά.`,
              `This is the second shipment of your basket: the available items went ahead separately with order ${order.parentOrderNumber}. The shipping cost below is for this shipment only and is charged separately.`,
            ),
          ]
        : []),
    ],
    note: offer.note ?? "",
    note_label: offer.note ? t("Σημειωση απο το καταστημα", "Note from the shop") : "",
    facts: [
      ...(offer.leadTimeText ? [{ label: t("Χρονος παραδοσης", "Delivery time"), value: offer.leadTimeText }] : []),
      { label: t("Αποστολη", "Shipping"), value: shippingLabel },
      { label: t("Ισχυει εως", "Valid until"), value: stamp(expires) },
    ],
    items_title: t("Η προταση", "The offer"),
    items: rows.map((row) => comparisonItem(row, mailLocale)),
    totals: [
      { label: t("Καθαρη αξια", "Net value"), value: money(totals.subtotalNet) },
      {
        label: order.parentOrderNumber ? t("Μεταφορικα 2ης αποστολης", "Shipping of the 2nd shipment") : t("Μεταφορικα", "Shipping"),
        value:
          shippingNet == null
            ? t("Στη σελίδα", "On the page")
            : totals.shippingGross === 0
              ? t("Δωρεάν", "Free")
              : money(totals.shippingGross),
      },
      { label: t("ΦΠΑ", "VAT"), value: money(totals.vatAmount) },
    ],
    total: { label: t("Συνολο", "Total"), value: money(totals.totalGross) },
    cta: {
      url: link,
      label: t("Αποδοχή & πληρωμή", "Accept & pay"),
      hint: t(
        `Η πρόταση ισχύει έως ${stamp(expires)}. Από την ίδια σελίδα μπορείτε και να την απορρίψετε.`,
        `The offer is valid until ${stamp(expires)}. From the same page you can also decline it.`,
      ),
    },
  };
}

function plainText(view: NonNullable<ReturnType<typeof requestEmailView>>, locale: EmailLocale = "el"): string {
  const t = pick(locale);
  return [
    view.title,
    "",
    ...view.paragraphs,
    ...(view.note ? ["", `${view.note_label || t("Σημείωση", "Note")}: ${view.note}`] : []),
    ...(view.facts.length ? ["", ...view.facts.map((f) => `${f.label}: ${f.value}`)] : []),
    ...(view.items.length
      ? [
          "",
          ...view.items.map(
            (i) =>
              `${i.struck ? t("[δεν διατίθεται] ", "[not available] ") : i.tag ? `[${i.tag}] ` : ""}${i.name} (${i.sku}) — ${i.detail} — ${i.amount}${i.was ? ` (${i.was})` : ""}`,
          ),
        ]
      : []),
    ...(view.total ? ["", `${view.total.label}: ${view.total.value}`] : []),
    "",
    `${view.cta.label}: ${view.cta.url}`,
  ].join("\n");
}

export async function sendRequestEmail(
  kind: RequestEmailKind,
  orderNumber: string,
  options: { locale?: EmailLocale } = {},
): Promise<RequestMailOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };
  try {
    const order = await loadRequest(orderNumber);
    if (!order || !order.requestStatus) return { ok: false, error: "Το αίτημα δεν βρέθηκε." };
    const locale = emailLocale(order, options.locale);
    const view = requestEmailView(order, kind, await loadParent(order), { locale });
    if (!view) return { ok: false, error: "Δεν υπάρχει πρόταση για αποστολή." };

    const html = await renderTemplate(
      "order-request",
      {
        preheader: view.paragraphs[0] ?? view.title,
        recipient: { first_name: order.firstName, last_name: order.lastName, email: order.email },
        req: view,
      },
      { locale },
    );
    const result = await sendMail({
      to: order.email,
      subject: view.subject,
      html,
      text: plainText(view, locale),
      replyTo: process.env.MAIL_REPLY_TO,
      tracking: false,
    });
    if (!result.ok) {
      console.error(`[mail:order-request:${kind}] ${orderNumber}: ${result.error}`);
      return { ok: false, error: result.error };
    }
    return { ok: true, id: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mail:order-request:${kind}] ${orderNumber}: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * To the shop, when a request arrives. The decision is made in HDCtool, so this
 * is the heads-up and the contact details — not a to-do in the eshop admin.
 */
export async function sendInternalRequestEmail(orderNumber: string): Promise<RequestMailOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };
  try {
    const order = await loadRequest(orderNumber);
    if (!order || !order.requestStatus) return { ok: false, error: "Το αίτημα δεν βρέθηκε." };
    const requested = readSnapshot(order.requestLines)?.lines ?? [];
    const priced = priceLines(requested, 0);
    const parent = await loadParent(order);
    const admin = `${siteOrigin()}/admin/orders/${encodeURIComponent(order.orderNumber)}`;
    const shippingLabel = findShippingMethod(order.shippingMethod)?.label ?? order.shippingMethod;

    const view = {
      subject: `Νέο αίτημα κατόπιν παραγγελίας ${order.orderNumber} — ${money(priced.subtotalGross)}${
        order.parentOrderNumber ? ` · τα διαθέσιμα στην ${order.parentOrderNumber}` : ""
      }`,
      eyebrow: "Εσωτερικο / Κατοπιν παραγγελιας",
      title: "Νέο αίτημα",
      number: order.orderNumber,
      date: stamp(order.requestedAt ?? order.createdAt),
      badge: "Απαντηση εντος 24 ωρων",
      badge_color: "#9A6700",
      badge_bg: "#FFF4D6",
      paragraphs: [
        `Ο πελάτης ζητά προϊόντα που δεν υπάρχουν (ή δεν επαρκούν) στην αποθήκη. Η πρόταση ή η απόρριψη γίνεται από το HDCtool, στην οθόνη αιτημάτων — ο πελάτης έχει υποσχεθεί απάντηση εντός ${REQUEST_ANSWER_HOURS} ωρών.`,
        ...(parent
          ? [
              `Μοιρασμένο καλάθι: τα διαθέσιμα προϊόντα του ίδιου καλαθιού έγιναν η παραγγελία ${parent.orderNumber} (${money(parent.totalGross)}, μεταφορικά ${money(parent.shippingGross)}, ${parent.paymentStatus === "PAID" ? "πληρωμένη" : "εκκρεμεί πληρωμή"}). Αυτό το αίτημα στέλνεται χωριστά· τα μεταφορικά του ορίζονται με την πρόταση.`,
            ]
          : order.parentOrderNumber
            ? [`Τα διαθέσιμα προϊόντα του ίδιου καλαθιού έγιναν η παραγγελία ${order.parentOrderNumber}.`]
            : []),
      ],
      note: order.notes?.trim() ?? "",
      note_label: order.notes?.trim() ? "Σχολια πελατη" : "",
      facts: [
        { label: "Πελατης", value: `${order.firstName} ${order.lastName}`.trim() },
        { label: "Email", value: order.email },
        { label: "Τηλεφωνο", value: order.phone },
        { label: "Διευθυνση", value: `${order.shipLine1}${order.shipLine2 ? `, ${order.shipLine2}` : ""}, ${localityLine(order.shipPostcode, order.shipCity, order.shipCountry)}` },
        { label: "Αποστολη", value: shippingLabel },
        ...(order.wantsInvoice
          ? [{ label: "Τιμολογιο", value: `${order.companyName ?? "—"} · ΑΦΜ ${order.vatNumber ?? "—"}` }]
          : []),
      ],
      items_title: "Ζητουμενα",
      items: requested.map((r) => ({
        tag: r.stockAtRequest != null && r.stockAtRequest > 0 ? `Αποθεμα ${r.stockAtRequest}` : "Χωρις αποθεμα",
        name: r.name,
        sku: r.sku,
        detail: `${r.qty} τεμ.${r.mtrl != null ? ` · MTRL ${r.mtrl}` : ""}`,
        amount: money(r.unitNet * (1 + r.vatRate / 100) * r.qty),
        struck: false,
        was: "",
      })),
      totals: [],
      total: { label: "Ενδεικτικη αξια", value: money(priced.subtotalGross) },
      cta: { url: admin, label: "Άνοιγμα στη διαχείριση", hint: "" },
    };

    const html = await renderTemplate("order-request", { preheader: view.paragraphs[0], req: view });
    const result = await sendMail({
      to: internalOrderRecipients(),
      subject: view.subject,
      html,
      text: plainText(view),
      replyTo: order.email,
    });
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, id: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mail:order-request:internal] ${orderNumber}: ${message}`);
    return { ok: false, error: message };
  }
}
