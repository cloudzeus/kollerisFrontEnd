import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { parseSweepParams, sweepLogLine, sweepPendingPayments } from "@/lib/payment/payment-sweep";

/**
 * Έλεγχος εκκρεμών πληρωμών στη Viva, κατά παραγγελία.
 *
 * ── Δεν είναι ο χρονιστής ─────────────────────────────────────────────────
 *
 * Ο τακτικός έλεγχος τρέχει ΜΕΣΑ στον server: το `src/instrumentation.ts`
 * ξεκινά το `startPaymentSweepSchedule()` (βλ.
 * `src/lib/payment/payment-sweep-schedule.ts`), που κάθε ~15 λεπτά ρωτά τη
 * Viva για όσες παραγγελίες περιμένουν ακόμη τα χρήματά τους. Ένα μόνο
 * αντίγραφο σαρώνει ανά γύρο — κλείδωμα στη βάση. Ρυθμίσεις:
 * `PAYMENT_SWEEP_ENABLED` (on/off), `PAYMENT_SWEEP_INTERVAL_MIN` (5–120).
 * Δεν χρειάζεται καμία προγραμματισμένη εργασία στον Coolify.
 *
 * Αυτό εδώ είναι για όταν κάποιος θέλει απάντηση ΤΩΡΑ — από script, από
 * monitoring, ή για μία συγκεκριμένη παραγγελία:
 *
 *     curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *          "https://kolleris.com/api/payments/recheck?order=KOL-20261004-0001"
 *
 * Παράμετροι: `order` (μία παραγγελία, οποιασδήποτε ηλικίας), `days` (1–60,
 * προεπιλογή 10), `limit` (1–200, προεπιλογή 50). GET ή POST.
 *
 * ── Χωρίς μυστικό, δεν τρέχει ────────────────────────────────────────────
 *
 * Το ίδιο `CRON_SECRET` με το `/api/cron/orders` — ένα μυστικό για τις
 * μηχανικές κλήσεις του καταστήματος. Αν δεν έχει οριστεί, 503 αντί για
 * ανοιχτό endpoint: αυτό σημειώνει παραγγελίες πληρωμένες και στέλνει email.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest, secret: string): boolean {
  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const a = Buffer.from(offered);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET δεν είναι ρυθμισμένο." },
      { status: 503 },
    );
  }
  if (!authorised(request, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await sweepPendingPayments({
    ...parseSweepParams(request.nextUrl.searchParams),
    // Room under maxDuration for the last order's follow-ups.
    budgetMs: 40_000,
    actor: "payment-sweep:api",
  });

  // 200 even with per-order errors: they are in the body, and a caller that
  // retries the whole sweep because one order failed helps nobody.
  if (result.ok) console.info(sweepLogLine(result));
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
