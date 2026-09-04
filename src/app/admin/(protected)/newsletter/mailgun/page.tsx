import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { RANGES, fetchMailgunStats, type RangeId } from "@/lib/newsletter/mailgun-stats";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("el-GR");

/** Ποσοστό με ρητό παρονομαστή — «84%» χωρίς «από τι» δεν σημαίνει τίποτα. */
function pct(part: number, whole: number): string {
  if (whole <= 0) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

export default async function MailgunPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "engagement");

  const params = await searchParams;
  const range = (RANGES.some((r) => r.id === params.range) ? params.range : "30d") as RangeId;
  const result = await fetchMailgunStats(range);

  return (
    <PageShell
      title="MailGun"
      description="Στατιστικά αποστολών από τον λογαριασμό Mailgun. Αφορούν ΚΑΘΕ email του καταστήματος — παραγγελίες, λογαριασμοί, newsletter — όχι μόνο τις καμπάνιες."
      actions={
        <div className="flex gap-px bg-neutral-200">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={`/admin/newsletter/mailgun?range=${r.id}`}
              className={cn(
                "px-3 py-1.5 text-[12px] font-medium",
                r.id === range ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 hover:bg-neutral-50",
              )}
            >
              {r.label}
            </Link>
          ))}
        </div>
      }
    >
      {!result.ok ? (
        <Panel title="Δεν ήταν δυνατή η ανάγνωση">
          <p className="text-[13px] text-red-600">{result.error}</p>
        </Panel>
      ) : (
        <MailgunReport range={range} stats={result.stats} />
      )}
    </PageShell>
  );
}

function MailgunReport({
  stats,
}: {
  range: RangeId;
  stats: NonNullable<Awaited<ReturnType<typeof fetchMailgunStats>> & { ok: true }>["stats"];
}) {
  const t = stats.totals;
  const peak = Math.max(1, ...stats.days.map((d) => d.sent));

  return (
    <>
      <Panel
        title={`Domain αποστολής: ${stats.domain}`}
        description="Το web.kolleris.com δεν είναι domain του Mailgun — το κατάστημα στέλνει μέσω kolleris.com. Δεν υπάρχει δεύτερο σύνολο αριθμών που λείπει."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Απεσταλμένα" value={nf.format(t.sent)} note="μηνύματα που δεχτήκαμε να στείλουμε" />
          <Kpi
            label="Παραδόθηκαν"
            value={nf.format(t.delivered)}
            note={`${pct(t.delivered, t.sent)} των απεσταλμένων`}
            tone={t.sent > 0 && t.delivered / t.sent < 0.95 ? "warn" : "good"}
          />
          <Kpi
            label="Άνοιξαν"
            value={nf.format(t.openedUnique)}
            note={`${pct(t.openedUnique, t.delivered)} · ${nf.format(t.openedTotal)} ανοίγματα συνολικά`}
          />
          <Kpi
            label="Έκαναν κλικ"
            value={nf.format(t.clickedUnique)}
            note={`${pct(t.clickedUnique, t.delivered)} · ${pct(t.clickedUnique, t.openedUnique)} όσων άνοιξαν`}
          />
        </div>
      </Panel>

      <Panel
        title="Προβλήματα παράδοσης"
        description="Οι μόνιμες αποτυχίες βλάπτουν τη φήμη του domain και επηρεάζουν κάθε επόμενη αποστολή. Οι προσωρινές συνήθως λύνονται μόνες τους."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            label="Μόνιμες αποτυχίες"
            value={nf.format(t.failedPermanent)}
            note={`${pct(t.failedPermanent, t.sent)} — ανύπαρκτες ή μπλοκαρισμένες διευθύνσεις`}
            tone={t.failedPermanent > 0 ? "warn" : "neutral"}
          />
          <Kpi label="Προσωρινές" value={nf.format(t.failedTemporary)} note="ο παραλήπτης δοκιμάζεται ξανά" />
          <Kpi
            label="Διαγραφές"
            value={nf.format(t.unsubscribed)}
            note={`${pct(t.unsubscribed, t.delivered)} όσων παραδόθηκαν`}
          />
          <Kpi
            label="Παράπονα spam"
            value={nf.format(t.complained)}
            /*
              Το 0,1% είναι το όριο που δηλώνουν Gmail και Yahoo. Πάνω από αυτό
              αρχίζουν να ρίχνουν αλληλογραφία του domain — και δεν το λένε.
            */
            note={`${pct(t.complained, t.delivered)} — όριο ανοχής 0,1%`}
            tone={t.delivered > 0 && t.complained / t.delivered > 0.001 ? "bad" : "good"}
          />
        </div>

        <div className="mt-4 grid gap-3 border-t border-neutral-100 pt-4 sm:grid-cols-2">
          <Line label="Απορρίψεις (bounce)" value={nf.format(t.bounced)} />
          <Line
            label="Μπλοκαρίστηκαν από λίστα αποκλεισμού"
            value={nf.format(t.suppressed)}
            hint="Διευθύνσεις που το Mailgun αρνήθηκε να ξαναδοκιμάσει επειδή είχαν ήδη απορριφθεί, διαγραφεί ή παραπονεθεί."
          />
        </div>
      </Panel>

      <Panel title="Ανά ημέρα" description={`${stats.days.length} ημέρες`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                <th className="py-2 pr-4 font-medium">Ημέρα</th>
                <th className="py-2 pr-4 font-medium">Όγκος</th>
                <th className="py-2 pr-4 text-right font-medium">Απεσταλμένα</th>
                <th className="py-2 pr-4 text-right font-medium">Παραδόθηκαν</th>
                <th className="py-2 pr-4 text-right font-medium">Άνοιξαν</th>
                <th className="py-2 pr-4 text-right font-medium">Κλικ</th>
                <th className="py-2 text-right font-medium">Απέτυχαν</th>
              </tr>
            </thead>
            <tbody>
              {stats.days.map((d) => {
                const idle = d.sent === 0;
                return (
                  <tr key={d.date} className={cn("border-b border-neutral-100", idle && "text-neutral-400")}>
                    <td className="py-2 pr-4 font-mono text-[12px] whitespace-nowrap">
                      {new Date(d.date).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" })}
                    </td>
                    <td className="py-2 pr-4">
                      {/*
                        Μπάρα και όχι διάγραμμα: η ερώτηση εδώ είναι «ποια μέρα
                        έφυγε όγκος», και μια μπάρα ανά γραμμή την απαντά χωρίς
                        δεύτερο στοιχείο να διαβάσει κανείς.
                      */}
                      <span className="block h-1.5 w-full max-w-[160px] bg-neutral-100">
                        <span
                          className="block h-full bg-neutral-800"
                          style={{ width: `${Math.round((d.sent / peak) * 100)}%` }}
                        />
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{d.sent || "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{d.delivered || "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{d.opened || "—"}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{d.clicked || "—"}</td>
                    <td
                      className={cn(
                        "py-2 text-right font-mono tabular-nums",
                        d.failed > 0 && "font-semibold text-red-600",
                      )}
                    >
                      {d.failed || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "border bg-white p-4",
        tone === "good" && "border-l-2 border-l-emerald-600",
        tone === "warn" && "border-l-2 border-l-amber-500",
        tone === "bad" && "border-l-2 border-l-red-600",
        tone === "neutral" && "border-neutral-200",
        tone !== "neutral" && "border-neutral-200",
      )}
    >
      <div className="font-mono text-[26px] leading-none font-semibold tabular-nums">{value}</div>
      <div className="mt-1.5 text-[12px] font-medium">{label}</div>
      {note && <div className="mt-0.5 text-[11px] leading-snug text-neutral-500">{note}</div>}
    </div>
  );
}

function Line({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[13px] text-neutral-600">{label}</span>
        <span className="font-mono text-[15px] font-semibold tabular-nums">{value}</span>
      </div>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">{hint}</p>}
    </div>
  );
}
