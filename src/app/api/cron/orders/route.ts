import { NextRequest, NextResponse } from "next/server";
import { sweepOrders } from "@/lib/orders/delivery-sweep";

/**
 * Η μοναδική χρονοπρογραμματισμένη εργασία του καταστήματος.
 *
 * ── Γιατί route και όχι εσωτερικός χρονιστής ──────────────────────────────
 *
 * Το κατάστημα τρέχει σε πολλαπλά αντίγραφα πίσω από τον Coolify. Ένας
 * `setInterval` μέσα στη διεργασία θα έτρεχε μία φορά ΑΝΑ ΑΝΤΙΓΡΑΦΟ, δηλαδή ο
 * ίδιος πελάτης θα έπαιρνε το ίδιο email τόσες φορές όσα και τα αντίγραφα —
 * και ο αριθμός τους αλλάζει χωρίς να το μάθει κανείς. Ένα endpoint που
 * καλείται από έναν εξωτερικό χρονιστή τρέχει μία φορά, όποτε κι αν κλιμακωθεί
 * το κατάστημα.
 *
 * ── Πώς ρυθμίζεται ───────────────────────────────────────────────────────
 *
 * Ορίστε `CRON_SECRET` στο περιβάλλον και προγραμματίστε στον Coolify:
 *
 *     curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *          https://web.kolleris.com/api/cron/orders
 *
 * Κάθε 30 λεπτά αρκεί: η ACS δεν σαρώνει συχνότερα, και η αίτηση αξιολόγησης
 * μετράει σε ημέρες.
 *
 * ── Χωρίς μυστικό, δεν τρέχει ────────────────────────────────────────────
 *
 * Αν το `CRON_SECRET` δεν έχει οριστεί, το endpoint απαντά 503 αντί να τρέξει
 * ανοιχτό. Μια σάρωση που στέλνει email σε πελάτες δεν είναι κάτι που αφήνεται
 * εκτεθειμένο επειδή ξεχάστηκε μια μεταβλητή.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET δεν είναι ρυθμισμένο." },
      { status: 503 },
    );
  }

  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (offered !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const report = await sweepOrders();

  /*
   * Τα σφάλματα επιστρέφονται ΚΑΙ καταγράφονται, αλλά η απάντηση μένει 200:
   * ένα voucher που δεν απάντησε δεν είναι λόγος να θεωρήσει ο χρονιστής ότι
   * απέτυχε ολόκληρο το πέρασμα και να το ξαναπαίξει από την αρχή.
   */
  if (report.errors.length > 0) {
    console.error(`[cron:orders] ${report.errors.length} σφάλματα`, report.errors);
  }
  console.info(
    `[cron:orders] ελέγχθηκαν ${report.checked} · παραδόθηκαν ${report.delivered} · ` +
      `αιτήσεις αξιολόγησης ${report.reviewsRequested}`,
  );

  return NextResponse.json({ ok: true, ...report });
}
