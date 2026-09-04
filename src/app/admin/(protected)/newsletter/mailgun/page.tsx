import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { RANGES, fetchMailgunStats, type RangeId } from "@/lib/newsletter/mailgun-stats";
import { cn } from "@/lib/utils";
import {
  DailyChart,
  Funnel,
  Legend,
  METRIC,
  Ring,
  Sparkline,
  StatBadge,
  type MetricKey,
} from "@/components/admin/newsletter/Charts";

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
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-px bg-neutral-200">
            {["csv", "json"].map((f) => (
              <a
                key={f}
                href={`/admin/newsletter/mailgun/export?range=${range}&format=${f}`}
                className="bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-600 hover:bg-neutral-50"
              >
                {f.toUpperCase()}
              </a>
            ))}
          </div>
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
          <Kpi
            metric="sent"
            value={nf.format(t.sent)}
            note="μηνύματα που δεχτήκαμε να στείλουμε"
            series={stats.days.map((d) => d.sent)}
          />
          <Kpi
            metric="delivered"
            value={nf.format(t.delivered)}
            note={`${pct(t.delivered, t.sent)} των απεσταλμένων`}
            series={stats.days.map((d) => d.delivered)}
            badge={
              t.sent > 0
                ? t.delivered / t.sent >= 0.95
                  ? { tone: "good" as const, text: "υγιές" }
                  : { tone: "warn" as const, text: "χαμηλό" }
                : undefined
            }
          />
          <Kpi
            metric="opened"
            value={nf.format(t.openedUnique)}
            note={`${pct(t.openedUnique, t.delivered)} · ${nf.format(t.openedTotal)} ανοίγματα συνολικά`}
            series={stats.days.map((d) => d.opened)}
          />
          <Kpi
            metric="clicked"
            value={nf.format(t.clickedUnique)}
            note={`${pct(t.clickedUnique, t.delivered)} · ${pct(t.clickedUnique, t.openedUnique)} όσων άνοιξαν`}
            series={stats.days.map((d) => d.clicked)}
          />
        </div>

        <div className="mt-5 grid gap-6 border-t border-neutral-100 pt-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="mb-3 text-[12px] font-semibold">Η διαδρομή ενός μηνύματος</p>
            <Funnel
              steps={[
                { key: "sent", value: t.sent, of: t.sent },
                { key: "delivered", value: t.delivered, of: t.sent },
                { key: "opened", value: t.openedUnique, of: t.sent, note: "μοναδικοί παραλήπτες, όχι ανοίγματα" },
                { key: "clicked", value: t.clickedUnique, of: t.sent },
              ]}
            />
          </div>
          <div className="space-y-4">
            <Ring
              value={t.delivered}
              of={t.sent}
              color={METRIC.delivered.color}
              label="Παραδοσιμότητα"
              sub="Κάτω από 95% σημαίνει πρόβλημα λίστας ή φήμης."
            />
            <Ring
              value={t.openedUnique}
              of={t.delivered}
              color={METRIC.opened.color}
              label="Ποσοστό ανοίγματος"
              sub="Μέσος όρος λιανικής στην Ελλάδα: 20–30%."
            />
            <Ring
              value={t.clickedUnique}
              of={t.openedUnique}
              color={METRIC.clicked.color}
              label="Κλικ ανά άνοιγμα"
              sub="Πόσο έπεισε το περιεχόμενο όποιον το άνοιξε."
            />
          </div>
        </div>
      </Panel>

      <Panel
        title="Προβλήματα παράδοσης"
        description="Οι μόνιμες αποτυχίες βλάπτουν τη φήμη του domain και επηρεάζουν κάθε επόμενη αποστολή. Οι προσωρινές συνήθως λύνονται μόνες τους."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            metric="failed"
            value={nf.format(t.failedPermanent)}
            note={`${pct(t.failedPermanent, t.sent)} — ανύπαρκτες ή μπλοκαρισμένες διευθύνσεις`}
            series={stats.days.map((d) => d.failed)}
            badge={t.failedPermanent > 0 ? { tone: "warn", text: "προσοχή" } : { tone: "good", text: "καθαρό" }}
          />
          <Kpi
            metric="unsubscribed"
            value={nf.format(t.unsubscribed)}
            note={`${pct(t.unsubscribed, t.delivered)} όσων παραδόθηκαν`}
          />
          <div className="border border-neutral-200 bg-white">
            <div className="h-1 bg-neutral-300" />
            <div className="p-4">
              <div className="font-mono text-[26px] leading-none font-semibold tabular-nums">
                {nf.format(t.failedTemporary)}
              </div>
              <div className="mt-1.5 text-[12px] font-medium">Προσωρινές αποτυχίες</div>
              <div className="mt-0.5 text-[11px] text-neutral-500">ο παραλήπτης δοκιμάζεται ξανά</div>
            </div>
          </div>
          <div className="border border-neutral-200 bg-white">
            <div
              className="h-1"
              style={{
                background:
                  t.delivered > 0 && t.complained / t.delivered > 0.001 ? METRIC.failed.color : "#059669",
              }}
            />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-mono text-[26px] leading-none font-semibold tabular-nums">
                  {nf.format(t.complained)}
                </div>
                <StatBadge tone={t.delivered > 0 && t.complained / t.delivered > 0.001 ? "bad" : "good"}>
                  {t.delivered > 0 && t.complained / t.delivered > 0.001 ? "πάνω από το όριο" : "εντός"}
                </StatBadge>
              </div>
              <div className="mt-1.5 text-[12px] font-medium">Παράπονα spam</div>
              {/*
                Το 0,1% είναι το όριο που δηλώνουν Gmail και Yahoo. Πάνω από αυτό
                αρχίζουν να ρίχνουν αλληλογραφία του domain — και δεν το λένε.
              */}
              <div className="mt-0.5 text-[11px] text-neutral-500">
                {pct(t.complained, t.delivered)} — όριο ανοχής 0,1%
              </div>
            </div>
          </div>
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

      <Panel title="Πορεία στο διάστημα" description="Οι σειρές είναι εμφωλευμένες: κάθε κλικ είναι και άνοιγμα, κάθε άνοιγμα είναι και παράδοση.">
        <DailyChart days={stats.days} series={["sent", "delivered", "opened", "clicked"] as MetricKey[]} />
        <div className="mt-2">
          <Legend items={["sent", "delivered", "opened", "clicked"] as MetricKey[]} />
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

/**
 * Κάρτα μετρικής: αριθμός, τάση, και το χρώμα της μετρικής ως λωρίδα.
 *
 * Η λωρίδα δεν είναι διακόσμηση — είναι το ίδιο χρώμα που έχει η μετρική στη
 * χοάνη και στο ημερήσιο διάγραμμα, ώστε το μάτι να συνδέει κάρτα και καμπύλη
 * χωρίς λεζάντα.
 */
function Kpi({
  metric,
  value,
  note,
  series,
  badge,
}: {
  metric: MetricKey;
  value: string;
  note?: string;
  series?: number[];
  badge?: { tone: "good" | "warn" | "bad"; text: string };
}) {
  const m = METRIC[metric];
  return (
    <div className="border border-neutral-200 bg-white">
      <div className="h-1" style={{ background: m.color }} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="font-mono text-[26px] leading-none font-semibold tabular-nums">{value}</div>
          {badge && <StatBadge tone={badge.tone}>{badge.text}</StatBadge>}
        </div>
        <div className="mt-1.5 text-[12px] font-medium">{m.label}</div>
        {note && <div className="mt-0.5 text-[11px] leading-snug text-neutral-500">{note}</div>}
        {series && series.length > 1 && (
          <div className="mt-2">
            <Sparkline values={series} color={m.color} />
          </div>
        )}
      </div>
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
