import { NextResponse, type NextRequest } from "next/server";
import {
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhooks/hdc-signature";
import { sendOrderStatusEmail } from "@/lib/mail/order-status-email";

/**
 * Το HDCtool μας λέει ότι άλλαξε η κατάσταση μιας παραγγελίας.
 *
 * ── Γιατί ταξιδεύει η ΟΝΟΜΑΣΙΑ και όχι μόνο ο κωδικός ──────────────────────
 *
 * Η λίστα καταστάσεων (`FINSTATES`) ζει στο SoftOne και συγχρονίζεται στο
 * HDCtool. Το e-shop δεν την έχει και δεν πρέπει να την αποκτήσει: τρίτο
 * αντίγραφο μιας λίστας που αλλάζει στο ERP είναι τρίτη ευκαιρία να διαφωνήσει.
 * Ο κωδικός έρχεται μαζί για την καταγραφή· το κείμενο που διαβάζει ο πελάτης
 * είναι ό,τι λέει το ERP.
 *
 * ── Ξεχωριστή διαδρομή από τον κατάλογο ────────────────────────────────────
 *
 * Το `/api/webhooks/hdctool` ελέγχει `seq`/`prevSeq` για να εντοπίσει χαμένη
 * παράδοση — μια αλυσίδα που έχει νόημα για ροή αλλαγών προϊόντων και κανένα
 * για ένα μεμονωμένο γεγονός παραγγελίας. Ίδια υπογραφή, ίδιο μυστικό, άλλη
 * διαδρομή.
 *
 * ── Το email δεν επαναλαμβάνεται με επανάληψη της κλήσης ───────────────────
 *
 * Δεν υπάρχει κλείδωμα εδώ, και είναι συνειδητό: το HDCtool στέλνει ΜΟΝΟ όταν
 * η κατάσταση όντως άλλαξε και μόνο αφού την επαληθεύσει διαβάζοντας το
 * παραστατικό. Αν κάποτε χρειαστεί επανάληψη, θα προστεθεί κλειδί γεγονότος —
 * όχι εικασία για το τι θεωρείται διπλό.
 */

export const runtime = "nodejs";

type Payload = {
  orderNumber?: string;
  statusCode?: number;
  statusName?: string;
};

export async function POST(request: NextRequest) {
  /* Ίδιο μυστικό με τη ροή καταλόγου — βλ. `/api/webhooks/hdctool`. */
  const secret = process.env.HDCTOOL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "HDCTOOL_WEBHOOK_SECRET δεν είναι ρυθμισμένο." },
      { status: 503 },
    );
  }

  /* Τα ΩΜΑ bytes πρώτα. Η υπογραφή είναι πάνω σε αυτά — ένα `await json()` πριν
     τον έλεγχο επαναδημιουργεί το σώμα και η υπογραφή δεν ταιριάζει ποτέ. */
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
  const statusName = payload.statusName?.trim();
  if (!orderNumber || !statusName) {
    return NextResponse.json(
      { ok: false, error: "orderNumber και statusName απαιτούνται" },
      { status: 400 },
    );
  }

  const sent = await sendOrderStatusEmail(orderNumber, statusName);
  if (!sent.ok) {
    console.error(`[hdctool/order-status] ${orderNumber}: ${sent.error}`);
    /* 200 με `ok: false`: η αλλαγή κατάστασης ΕΓΙΝΕ στο ERP και δεν αναιρείται
       επειδή δεν έφυγε email. Ένα 500 θα έκανε το HDCtool να ξαναπροσπαθήσει
       μια δουλειά που δεν είναι δική του να επαναλάβει. */
    return NextResponse.json({ ok: false, error: sent.error });
  }

  console.log(`[hdctool/order-status] ${orderNumber} → ${statusName} (${sent.id})`);
  return NextResponse.json({ ok: true, id: sent.id });
}
