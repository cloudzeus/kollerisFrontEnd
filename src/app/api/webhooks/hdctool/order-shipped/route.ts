import { NextResponse, type NextRequest } from "next/server";
import {
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhooks/hdc-signature";
import { prisma } from "@/lib/prisma";
import { sendShippedEmail } from "@/lib/mail/order-shipped-email";

/**
 * Το HDCtool μας λέει ότι εκδόθηκε αποστολικό ACS.
 *
 * ── Γιατί δεν το βγάζει πια το e-shop ──────────────────────────────────────
 *
 * Το έβγαζε, και το HDCtool το έβγαζε επίσης. Αποτέλεσμα, μετρημένο στη
 * ζωντανή βάση: η παραγγελία KOL-20260907-0001 πήρε ΔΥΟ αποστολικά για ένα
 * δέμα — 9805563515 από εδώ και 9805602995 από το HDCtool. Δύο ετικέτες, δύο
 * χρεώσεις, και ο πελάτης ενημερωμένος για τη μία.
 *
 * Η ACS τα βλέπει όλα από το HDCtool: εκεί γίνονται οι λίστες παραλαβής, εκεί
 * κοστολογείται το δέμα, εκεί ζουν οι παραγγελίες Skroutz και Magento που
 * φεύγουν με το ίδιο δρομολόγιο. Ένας εκδότης, και είναι αυτός.
 *
 * ── Γιατί το email φεύγει ΑΠΟ ΕΔΩ ──────────────────────────────────────────
 *
 * Το HDCtool έχει Mailgun και ξέρει να στέλνει. Αυτό που δεν έχει είναι η
 * σχεδίαση — τα templates, το λογότυπο, ο τρόπος που γράφονται τα ποσά. Το ίδιο
 * σκεπτικό με το `order-status`: το γεγονός ταξιδεύει, το μήνυμα συντάσσεται
 * εκεί όπου ζει η σχεδίαση.
 *
 * ── Επανάληψη δεν στέλνει δεύτερο email ────────────────────────────────────
 *
 * Το email φεύγει μόνο όταν η κατάσταση ΠΡΟΧΩΡΗΣΕ. Μια παραγγελία που έχει ήδη
 * το ίδιο αποστολικό επιστρέφει νωρίς, οπότε μια επανάληψη της κλήσης —
 * δικτυακή αποτυχία, χειροκίνητο ξαναπάτημα — δεν ξαναειδοποιεί κανέναν.
 */

export const runtime = "nodejs";

type Payload = {
  orderNumber?: string;
  voucherNo?: string;
  pickupDate?: string | null;
};

export async function POST(request: NextRequest) {
  const secret = process.env.HDCTOOL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "HDCTOOL_WEBHOOK_SECRET δεν είναι ρυθμισμένο." },
      { status: 503 },
    );
  }

  /* Τα ΩΜΑ bytes πρώτα — η υπογραφή είναι πάνω σε αυτά. */
  const rawBody = await request.text();
  const verified = verifySignature({
    rawBody,
    secret,
    signature: request.headers.get(SIGNATURE_HEADER),
    timestamp: request.headers.get(TIMESTAMP_HEADER),
  });
  if (!verified.ok) {
    return NextResponse.json({ ok: false, error: verified.reason }, { status: 401 });
  }

  let payload: Payload;
  try {
    payload = JSON.parse(rawBody) as Payload;
  } catch {
    return NextResponse.json({ ok: false, error: "Άκυρο JSON" }, { status: 400 });
  }

  const orderNumber = payload.orderNumber?.trim();
  const voucherNo = payload.voucherNo?.trim();
  if (!orderNumber || !voucherNo) {
    return NextResponse.json(
      { ok: false, error: "orderNumber και voucherNo απαιτούνται" },
      { status: 400 },
    );
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { id: true, orderNumber: true, status: true, acsVoucherNo: true },
  });
  if (!order) {
    return NextResponse.json({ ok: false, error: "Δεν βρέθηκε η παραγγελία" }, { status: 404 });
  }

  /* Ήδη γνωστό αποστολικό: τίποτα να γραφτεί, κανένα email να ξανασταλεί. */
  if (order.acsVoucherNo === voucherNo) {
    return NextResponse.json({ ok: true, alreadyKnown: true, voucherNo });
  }

  /*
   * ΜΟΝΟ προς τα εμπρός. Ακυρωμένη ή επιστραφείσα παραγγελία δεν γίνεται
   * απεσταλμένη επειδή τυπώθηκε ετικέτα — ίδιος κανόνας με την παλιά διαδρομή.
   */
  const advances = order.status === "CONFIRMED" || order.status === "PENDING_PAYMENT";
  const nextStatus = advances ? "SHIPPED" : order.status;

  await prisma.order.update({
    where: { id: order.id },
    data: {
      acsVoucherNo: voucherNo,
      acsPickupDate: payload.pickupDate?.trim() || undefined,
      status: nextStatus,
      shippedAt: advances ? new Date() : undefined,
      history: {
        create: {
          status: nextStatus,
          actor: "hdctool",
          note: `ACS voucher ${voucherNo}`,
        },
      },
    },
  });

  if (!advances) {
    console.log(`[hdctool/order-shipped] ${orderNumber}: κρατήθηκε ${voucherNo}, κατάσταση ${order.status}`);
    return NextResponse.json({ ok: true, voucherNo, emailed: false, status: nextStatus });
  }

  const mail = await sendShippedEmail(order.orderNumber, voucherNo);
  if (!mail?.ok) {
    /* 200 με `emailed: false`: το δέμα ΕΦΥΓΕ και η ετικέτα τυπώθηκε, ό,τι κι αν
       πει το Mailgun. Ένα 500 θα έβαζε το HDCtool να ξαναεκδώσει αποστολικό. */
    console.error(`[hdctool/order-shipped] ${orderNumber}: το email απέτυχε`);
    return NextResponse.json({ ok: true, voucherNo, emailed: false, status: nextStatus });
  }

  console.log(`[hdctool/order-shipped] ${orderNumber} → ${voucherNo}, email εστάλη`);
  return NextResponse.json({ ok: true, voucherNo, emailed: true, status: nextStatus });
}
