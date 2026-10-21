import "server-only";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { internalOrderRecipients } from "@/lib/mail/order-internal-email";
import { siteOrigin } from "@/lib/seo/urls";
import { findShippingMethod } from "@/lib/cart/options";
import { localityLine } from "@/lib/shipping/countries";
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
function parentSentence(parent: ParentFacts): string {
  const shipping =
    parent.shippingMethod === "pickup"
      ? "παραλαβή από το κατάστημα"
      : Number(parent.shippingGross) === 0
        ? "με δωρεάν μεταφορικά"
        : `μαζί με μεταφορικά ${money(parent.shippingGross)}`;
  return parent.paymentStatus === "PAID"
    ? `Τα διαθέσιμα είδη του καλαθιού σας πληρώθηκαν στην παραγγελία ${parent.orderNumber}: ${money(parent.totalGross)} ${shipping}.`
    : `Τα διαθέσιμα είδη του καλαθιού σας είναι η παραγγελία ${parent.orderNumber}: ${money(parent.totalGross)} ${shipping}, ${
        parent.paymentMethod === "bank" ? "που πληρώνετε με τραπεζική κατάθεση" : "που πληρώνετε τώρα"
      }.`;
}

const BADGE: Record<RequestEmailKind, { text: string; color: string; bg: string }> = {
  received: { text: "Σε επεξεργασια", color: "#9A6700", bg: "#FFF4D6" },
  offer: { text: "Προταση", color: "#1F7A45", bg: "#E3F4EA" },
  reminder: { text: "Προταση", color: "#1F7A45", bg: "#E3F4EA" },
  rejected: { text: "Δεν εξυπηρετειται", color: "#C42A26", bg: "#FDECEB" },
  expired: { text: "Εληξε", color: "#5F6061", bg: "#EFEFEF" },
};

function comparisonItem(row: ComparisonRow) {
  const unitGross = (unitNet: number, vatRate: number) => unitNet * (1 + vatRate / 100);
  if (row.kind === "removed") {
    const r = row.requested;
    return {
      tag: "Δεν διατίθεται",
      name: r.name,
      sku: r.sku,
      detail: `${r.qty} τεμ.`,
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
    detail: `${o.qty} τεμ. × ${money(line.unitGross)}${o.leadTimeText ? ` · ${o.leadTimeText}` : ""}`,
    amount: money(line.lineGross),
    struck: false,
  };
  if (row.kind === "alternative") {
    return { ...base, tag: "Εναλλακτικο", was: row.requested ? `Αντί για: ${row.requested.name}` : "" };
  }
  if (row.kind === "added") return { ...base, tag: "Προσθηκη", was: "" };
  if (row.kind === "modified") {
    const r = row.requested;
    const was = [
      row.qtyChanged ? `ζητήσατε ${r.qty} τεμ.` : "",
      row.priceChanged ? `ενδεικτική τιμή ${money(unitGross(r.unitNet, r.vatRate))}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return { ...base, tag: "Αλλαγη", was: was ? `Αρχικά: ${was}` : "" };
  }
  return { ...base, tag: "", was: "" };
}

/** Everything every request email needs, from the order row. Exported for the tests. */
export function requestEmailView(
  order: LoadedRequest,
  kind: RequestEmailKind,
  /** The paid half of a split cart, when there is one (`parentOrderNumber`). */
  parent: ParentFacts | null = null,
) {
  const snapshot = readSnapshot(order.requestLines);
  const locale = snapshot?.locale ?? "el";
  const link = order.requestToken ? `${siteOrigin()}${requestPath(locale, order.requestToken)}` : siteOrigin();
  const offer = readStoredOffer(order.offerJson);
  const requested = snapshot?.lines ?? [];

  const base = {
    subject: "",
    eyebrow: "",
    title: "",
    number: order.orderNumber,
    date: stamp(order.requestedAt ?? order.createdAt),
    badge: BADGE[kind].text,
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
    cta: { url: link, label: "Δείτε το αίτημα", hint: "" },
  };
  const name = order.firstName;

  if (kind === "received") {
    const priced = priceLines(requested, 0);
    return {
      ...base,
      subject: `Λάβαμε το αίτημά σας ${order.orderNumber} — θα επιβεβαιωθεί εντός ${REQUEST_ANSWER_HOURS} ωρών`,
      eyebrow: "Κατοπιν παραγγελιας / Αιτημα",
      title: "Λάβαμε το αίτημά σας",
      paragraphs: [
        `${name}, λάβαμε το αίτημά σας για προϊόντα που δεν υπάρχουν αυτή τη στιγμή στην αποθήκη μας. Θα σας απαντήσουμε εντός ${REQUEST_ANSWER_HOURS} ωρών με τελική τιμή, διαθεσιμότητα και χρόνο παράδοσης.`,
        "Δεν έγινε καμία χρέωση. Πληρώνετε μόνο αν αποδεχτείτε την πρότασή μας, από τον σύνδεσμο που θα σας στείλουμε.",
        ...(parent
          ? [
              parentSentence(parent),
              "Τα προϊόντα αυτού του αιτήματος θα σταλούν χωριστά, σε δεύτερη αποστολή· τα μεταφορικά τους θα τα δείτε στην πρόταση.",
            ]
          : order.parentOrderNumber
            ? [`Τα διαθέσιμα προϊόντα του καλαθιού σας προχωρούν κανονικά με την παραγγελία ${order.parentOrderNumber}.`]
            : []),
      ],
      facts: parent
        ? [
            { label: "Πληρωτεο τωρα", value: `${parent.orderNumber} · ${money(parent.totalGross)}` },
            { label: "Αυτο το αιτημα", value: "Χωρίς χρέωση τώρα · 2η αποστολή" },
          ]
        : [],
      items_title: "Τι ζητήσατε",
      items: requested.map((r) => ({
        tag: "",
        name: r.name,
        sku: r.sku,
        detail: `${r.qty} τεμ.`,
        amount: money(r.unitNet * (1 + r.vatRate / 100) * r.qty),
        struck: false,
        was: "",
      })),
      totals: [{ label: parent ? "Μεταφορικα 2ης αποστολης" : "Μεταφορικα", value: "Με την πρόταση" }],
      total: { label: "Ενδεικτικη αξια", value: money(priced.subtotalGross) },
      cta: { url: link, label: "Δείτε το αίτημα", hint: "Ο σύνδεσμος είναι προσωπικός — μην τον προωθήσετε." },
    };
  }

  if (kind === "rejected") {
    const reason = offer?.decision === "reject" ? offer.reason : null;
    return {
      ...base,
      subject: `Το αίτημα ${order.orderNumber} δεν μπορεί να εξυπηρετηθεί`,
      eyebrow: "Κατοπιν παραγγελιας / Απαντηση",
      title: "Λυπούμαστε",
      paragraphs: [
        `${name}, δυστυχώς δεν μπορούμε να εξυπηρετήσουμε το αίτημά σας ${order.orderNumber}. Δεν έγινε καμία χρέωση.`,
        "Αν θέλετε να συζητήσουμε κάποια εναλλακτική, απαντήστε σε αυτό το email ή καλέστε μας.",
      ],
      note: reason ?? "",
      note_label: reason ? "Αιτιολογια" : "",
    };
  }

  if (kind === "expired") {
    return {
      ...base,
      subject: `Η πρόταση για το αίτημα ${order.orderNumber} έληξε`,
      eyebrow: "Κατοπιν παραγγελιας / Ληξη",
      title: "Η πρόταση έληξε",
      paragraphs: [
        `${name}, η πρότασή μας για το αίτημα ${order.orderNumber} έληξε χωρίς να ολοκληρωθεί. Δεν έγινε καμία χρέωση.`,
        "Αν ενδιαφέρεστε ακόμη, επικοινωνήστε μαζί μας και θα σας ενημερώσουμε για τη νέα διαθεσιμότητα και τιμή.",
      ],
    };
  }

  // offer · reminder
  if (offer?.decision !== "offer") return null;
  const rows = compareOffer(requested, offer.lines);
  const shippingNet = offerShippingNet(offer);
  const totals = priceLines(offer.lines, shippingNet ?? 0);
  const expires = order.offerExpiresAt ?? new Date(offer.expiresAt);
  const shippingLabel = findShippingMethod(order.shippingMethod)?.label ?? order.shippingMethod;
  const reminder = kind === "reminder";

  return {
    ...base,
    subject: reminder
      ? `Υπενθύμιση: η πρότασή μας για το αίτημα ${order.orderNumber} σας περιμένει`
      : `Η πρότασή μας για το αίτημα ${order.orderNumber} είναι έτοιμη`,
    eyebrow: reminder ? "Κατοπιν παραγγελιας / Υπενθυμιση" : "Κατοπιν παραγγελιας / Προταση",
    title: reminder ? "Η πρότασή μας σας περιμένει" : "Η πρότασή μας είναι έτοιμη",
    paragraphs: [
      reminder
        ? `${name}, η πρότασή μας για το αίτημα ${order.orderNumber} ισχύει έως ${stamp(expires)}. Μετά από αυτό τα προϊόντα δεν θα είναι πια δεσμευμένα για εσάς.`
        : `${name}, ετοιμάσαμε την πρότασή μας για το αίτημά σας ${order.orderNumber}. Ελέγξτε τα προϊόντα, τις τιμές και τον χρόνο παράδοσης και, αν σας καλύπτουν, ολοκληρώστε με πληρωμή.`,
      ...(order.parentOrderNumber
        ? [
            `Αυτή είναι η δεύτερη αποστολή του καλαθιού σας: τα διαθέσιμα είδη προχώρησαν χωριστά με την παραγγελία ${order.parentOrderNumber}. Τα μεταφορικά παρακάτω αφορούν μόνο αυτή την αποστολή και χρεώνονται χωριστά.`,
          ]
        : []),
    ],
    note: offer.note ?? "",
    note_label: offer.note ? "Σημειωση απο το καταστημα" : "",
    facts: [
      ...(offer.leadTimeText ? [{ label: "Χρονος παραδοσης", value: offer.leadTimeText }] : []),
      { label: "Αποστολη", value: shippingLabel },
      { label: "Ισχυει εως", value: stamp(expires) },
    ],
    items_title: "Η προταση",
    items: rows.map(comparisonItem),
    totals: [
      { label: "Καθαρη αξια", value: money(totals.subtotalNet) },
      {
        label: order.parentOrderNumber ? "Μεταφορικα 2ης αποστολης" : "Μεταφορικα",
        value: shippingNet == null ? "Στη σελίδα" : totals.shippingGross === 0 ? "Δωρεάν" : money(totals.shippingGross),
      },
      { label: "ΦΠΑ", value: money(totals.vatAmount) },
    ],
    total: { label: "Συνολο", value: money(totals.totalGross) },
    cta: {
      url: link,
      label: "Αποδοχή & πληρωμή",
      hint: `Η πρόταση ισχύει έως ${stamp(expires)}. Από την ίδια σελίδα μπορείτε και να την απορρίψετε.`,
    },
  };
}

function plainText(view: NonNullable<ReturnType<typeof requestEmailView>>): string {
  return [
    view.title,
    "",
    ...view.paragraphs,
    ...(view.note ? ["", `${view.note_label || "Σημείωση"}: ${view.note}`] : []),
    ...(view.facts.length ? ["", ...view.facts.map((f) => `${f.label}: ${f.value}`)] : []),
    ...(view.items.length
      ? [
          "",
          ...view.items.map(
            (i) =>
              `${i.struck ? "[δεν διατίθεται] " : i.tag ? `[${i.tag}] ` : ""}${i.name} (${i.sku}) — ${i.detail} — ${i.amount}${i.was ? ` (${i.was})` : ""}`,
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
): Promise<RequestMailOutcome> {
  if (!mailConfigured()) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };
  try {
    const order = await loadRequest(orderNumber);
    if (!order || !order.requestStatus) return { ok: false, error: "Το αίτημα δεν βρέθηκε." };
    const view = requestEmailView(order, kind, await loadParent(order));
    if (!view) return { ok: false, error: "Δεν υπάρχει πρόταση για αποστολή." };

    const html = await renderTemplate("order-request", {
      preheader: view.paragraphs[0] ?? view.title,
      recipient: { first_name: order.firstName, last_name: order.lastName, email: order.email },
      req: view,
    });
    const result = await sendMail({
      to: order.email,
      subject: view.subject,
      html,
      text: plainText(view),
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
