import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { RANGES, fetchMailgunStats, type RangeId } from "@/lib/newsletter/mailgun-stats";

/**
 * Εξαγωγή των στατιστικών σε CSV ή JSON.
 *
 * CSV με BOM και ελληνικές κεφαλίδες: το Excel σε ελληνικά Windows διαβάζει
 * UTF-8 ΜΟΝΟ αν βρει BOM — χωρίς αυτό, κάθε «Απεσταλμένα» ανοίγει ως
 * «Î‘Ï€ÎµÏƒÏ„Î±Î»Î¼Î­Î½Î±» και το αρχείο μοιάζει χαλασμένο.
 *
 * Διαχωριστικό «;» για τον ίδιο λόγο: στα ελληνικά τοπικά ρυθμισμένα Excel το
 * κόμμα είναι δεκαδικό σύμβολο, και ένα CSV με κόμματα μπαίνει ολόκληρο σε μία
 * στήλη.
 */
export async function GET(request: Request) {
  const session = await auth();
  assertCan(session?.user.role, "engagement");

  const url = new URL(request.url);
  const range = (RANGES.some((r) => r.id === url.searchParams.get("range"))
    ? url.searchParams.get("range")
    : "30d") as RangeId;
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";

  const result = await fetchMailgunStats(range);
  if (!result.ok) {
    return new Response(JSON.stringify({ error: result.error }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const { stats } = result;
  const stamp = new Date().toISOString().slice(0, 10);
  const base = `mailgun-${stats.domain}-${range}-${stamp}`;

  if (format === "json") {
    return new Response(JSON.stringify(stats, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.json"`,
      },
    });
  }

  const head = ["Ημερομηνία", "Απεσταλμένα", "Παραδόθηκαν", "Άνοιξαν", "Κλικ", "Απέτυχαν"];
  const lines = [
    head.join(";"),
    ...stats.days.map((d) =>
      [
        new Date(d.date).toISOString().slice(0, 10),
        d.sent,
        d.delivered,
        d.opened,
        d.clicked,
        d.failed,
      ].join(";"),
    ),
    "",
    `Σύνολα;${stats.totals.sent};${stats.totals.delivered};${stats.totals.openedUnique};${stats.totals.clickedUnique};${stats.totals.failedPermanent + stats.totals.failedTemporary}`,
    `Domain;${stats.domain}`,
    `Διάστημα;${range}`,
    `Μοναδικά ανοίγματα;${stats.totals.openedUnique};Συνολικά ανοίγματα;${stats.totals.openedTotal}`,
    `Διαγραφές;${stats.totals.unsubscribed};Παράπονα spam;${stats.totals.complained}`,
  ];

  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
    },
  });
}
