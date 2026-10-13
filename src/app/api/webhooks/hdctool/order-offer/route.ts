import { NextResponse, type NextRequest } from "next/server";
import {
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhooks/hdc-signature";
import { offerWebhookSchema } from "@/lib/requests/model";
import { applyOfferWebhook } from "@/lib/requests/service";

/**
 * Το HDCtool απαντά σε αίτημα «Κατόπιν παραγγελίας»: πρόταση ή απόρριψη.
 *
 * Συμβόλαιο: docs/backorder-requests.md §4. Ίδια υπογραφή, ίδιο μυστικό και
 * ίδια σειρά ελέγχων με τα αδέρφια `order-status` / `order-shipped`: ωμά bytes,
 * έλεγχος υπογραφής, και ΜΕΤΑ το JSON. Το σώμα ελέγχεται με zod — μια πρόταση
 * καθορίζει ποσό που θα χρεωθεί, άρα ό,τι δεν είναι ακριβώς στο σχήμα
 * απορρίπτεται με 400 αντί να μαντευτεί.
 *
 * Idempotent ανά (orderNumber, offerVersion): η ίδια έκδοση ξανά απαντά
 * `duplicate`, παλαιότερη απαντά `ignored: stale_offer_version` — και οι δύο
 * με 200, χωρίς αλλαγή και χωρίς δεύτερο email.
 */

export const runtime = "nodejs";

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

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Άκυρο JSON" }, { status: 400 });
  }

  const parsed = offerWebhookSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_body",
        issues: parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  const result = await applyOfferWebhook(parsed.data);
  console.log(
    `[hdctool/order-offer] ${parsed.data.orderNumber} v${parsed.data.offerVersion} ${parsed.data.decision} → ${result.status} ${JSON.stringify(result.body)}`,
  );
  return NextResponse.json(result.body, { status: result.status });
}
