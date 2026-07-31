import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertCan } from "@/lib/rbac";
import { upGreek } from "@/lib/greek";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: "text-k-green",
  PARTIAL: "text-k-amber",
  FAILED: "text-k-red",
  RUNNING: "text-k-blue",
};

function when(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("el-GR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Athens",
  }).format(date);
}

/** Admin screen 5 — HDCtool sync monitor. Every catalogue page depends on this. */
export default async function SyncPage() {
  const session = await auth();
  // Hiding the nav item is not authorisation.
  assertCan(session?.user.role, "sync");

  const [states, runs, products, categories, brands] = await Promise.all([
    prisma.syncState.findMany({ orderBy: { channel: "asc" } }),
    prisma.syncRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 15,
      include: { state: { select: { channel: true } } },
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.category.count(),
    prisma.brand.count(),
  ]);

  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold tracking-tight text-k-ink">
        {upGreek("Συγχρονισμός")}
      </h1>
      <p className="mt-2 text-k-text-2">
        Προβολή καταλόγου από το HDCtool. Η αρχική και ο κατάλογος διαβάζουν
        αποκλειστικά από εδώ.
      </p>

      <div className="mt-8 grid gap-px border border-k-line bg-k-line sm:grid-cols-3">
        {[
          { label: "Ενεργά προϊόντα", value: products },
          { label: "Κατηγορίες", value: categories },
          { label: "Brands", value: brands },
        ].map((stat) => (
          <div key={stat.label} className="bg-white p-6">
            <p className="text-xs tracking-wider text-k-text-4">
              {upGreek(stat.label)}
            </p>
            <p className="numeral mt-2 text-3xl text-k-ink">
              {stat.value.toLocaleString("el-GR")}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-10 text-xs tracking-widest text-k-text-4">
        {upGreek("Κανάλια")}
      </h2>
      <table className="mt-3 w-full border border-k-line bg-white text-sm">
        <thead>
          <tr className="border-b border-k-line text-left text-xs tracking-wider text-k-text-4">
            <th className="p-3 font-medium">ΚΑΝΑΛΙ</th>
            <th className="p-3 font-medium">ΚΑΤΑΣΤΑΣΗ</th>
            <th className="p-3 font-medium">ΤΕΛΕΥΤΑΙΑ ΕΚΤΕΛΕΣΗ</th>
            <th className="p-3 font-medium">ΤΕΛΕΥΤΑΙΑ ΕΠΙΤΥΧΙΑ</th>
          </tr>
        </thead>
        <tbody>
          {states.map((state) => (
            <tr key={state.id} className="border-b border-k-line-3 last:border-0">
              <td className="numeral p-3 text-k-ink">{state.channel}</td>
              <td
                className={`numeral p-3 ${STATUS_STYLE[state.lastStatus ?? ""] ?? "text-k-text-4"}`}
              >
                {state.lastStatus ?? "—"}
              </td>
              <td className="numeral p-3 text-k-text-2">{when(state.lastRunAt)}</td>
              <td className="numeral p-3 text-k-text-2">{when(state.lastSuccessAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-10 text-xs tracking-widest text-k-text-4">
        {upGreek("Πρόσφατες εκτελέσεις")}
      </h2>
      <table className="mt-3 w-full border border-k-line bg-white text-sm">
        <thead>
          <tr className="border-b border-k-line text-left text-xs tracking-wider text-k-text-4">
            <th className="p-3 font-medium">ΚΑΝΑΛΙ</th>
            <th className="p-3 font-medium">ΚΑΤΑΣΤΑΣΗ</th>
            <th className="p-3 font-medium text-right">ΕΓΓΡΑΦΕΣ</th>
            <th className="p-3 font-medium text-right">ΝΕΕΣ</th>
            <th className="p-3 font-medium text-right">ΕΝΗΜΕΡΩΣΕΙΣ</th>
            <th className="p-3 font-medium text-right">ΣΦΑΛΜΑΤΑ</th>
            <th className="p-3 font-medium">ΕΝΑΡΞΗ</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-k-line-3 last:border-0">
              <td className="numeral p-3 text-k-ink">{run.state.channel}</td>
              <td className={`numeral p-3 ${STATUS_STYLE[run.status] ?? ""}`}>
                {run.status}
              </td>
              <td className="numeral p-3 text-right text-k-text-2">{run.processed}</td>
              <td className="numeral p-3 text-right text-k-text-2">{run.created}</td>
              <td className="numeral p-3 text-right text-k-text-2">{run.updated}</td>
              <td
                className={`numeral p-3 text-right ${run.failed > 0 ? "text-k-red" : "text-k-text-2"}`}
              >
                {run.failed}
              </td>
              <td className="numeral p-3 text-k-text-2">{when(run.startedAt)}</td>
            </tr>
          ))}
          {runs.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-k-text-4">
                Καμία εκτέλεση ακόμη.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-6 text-xs text-k-text-4">
        Εκτέλεση:{" "}
        <code className="numeral bg-k-surface-3 px-1.5 py-0.5">
          npx tsx --env-file=.env scripts/sync-catalog.ts
        </code>
      </p>
    </div>
  );
}
