import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { handleSeoFix } from "@/lib/seo/seo-fix-protocol";
import { seoFixStore } from "@/lib/seo/seo-page-override";
import {
  verifySignature,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/webhooks/hdc-signature";

/** HDCtool reads, applies or undoes the SEO text of one page. Same signature and secret as `order-status`. */

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const secret = process.env.HDCTOOL_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "HDCTOOL_WEBHOOK_SECRET δεν είναι ρυθμισμένο." },
      { status: 503 },
    );
  }

  // Raw bytes first: the signature covers them, not a re-serialised body.
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

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Άκυρο JSON" }, { status: 400 });
  }

  const result = await handleSeoFix(payload, seoFixStore);
  // `previous` only comes back from a write. The whole tree, because pages live under `[locale]`.
  if (result.status === 200 && "previous" in result.body) revalidatePath("/", "layout");
  return NextResponse.json(result.body, { status: result.status });
}
