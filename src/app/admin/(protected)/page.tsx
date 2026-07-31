import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, TriangleAlert } from "lucide-react";
import { auth } from "@/auth";
import { upGreek } from "@/lib/greek";
import { formatMoney } from "@/lib/format";
import { getDashboard } from "@/lib/admin/dashboard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

const ORDER_STATUS: Record<string, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Αναμονή πληρωμής", className: "bg-k-surface-3 text-k-text-2" },
  CONFIRMED: { label: "Επιβεβαιωμένη", className: "bg-k-ink text-white" },
  SHIPPED: { label: "Απεστάλη", className: "bg-k-blue text-white" },
  DELIVERED: { label: "Παραδόθηκε", className: "bg-k-green text-white" },
  CANCELLED: { label: "Ακυρώθηκε", className: "bg-k-surface-3 text-k-text-3" },
  FAILED: { label: "Απέτυχε", className: "bg-k-red text-white" },
};

/**
 * Admin home.
 *
 * Ordered by what an operator opens it to find out: is anything waiting for me,
 * then how is the shop doing, then the detail.
 *
 * A counter that is zero is not shown at all. An "0 προβλήματα" panel reads as
 * broken; its absence reads as calm, which is what it means.
 */
export default async function AdminDashboard() {
  const session = await auth();
  const data = await getDashboard();

  return (
    <div className="mx-auto max-w-[76rem] px-4 py-8 lg:px-8">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight text-k-ink">
          {upGreek("Επισκόπηση")}
        </h1>
        <p className="mt-1 text-[13px] text-k-text-3">{session?.user.email}</p>
      </header>

      <section className="mt-8" aria-labelledby="attention">
        <h2 id="attention" className="sr-only">
          Χρειάζονται προσοχή
        </h2>

        {data.attention.length === 0 ? (
          <p className="flex items-center gap-2 border border-k-line bg-k-surface-2 px-4 py-3 text-[13px] text-k-text-2">
            <Check className="size-4 text-k-green" aria-hidden />
            Τίποτα δεν περιμένει ενέργεια.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`group flex items-start gap-2.5 border border-l-[3px] border-k-line bg-white px-4 py-3.5 transition-colors hover:bg-k-surface-2 ${
                    item.tone === "urgent" ? "border-l-k-red" : "border-l-k-amber"
                  }`}
                >
                  {item.tone === "urgent" ? (
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-k-red" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-k-amber" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-k-ink">
                      <span className="numeral">{item.count}</span> · {item.label}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-k-text-3">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-k-text-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Παραγγελίες 7 ημερών", value: String(data.orders.last7) },
          { label: "Τζίρος 7 ημερών", value: formatMoney(data.orders.revenue7) },
          { label: "Παραγγελίες 30 ημερών", value: String(data.orders.last30) },
          { label: "Τζίρος 30 ημερών", value: formatMoney(data.orders.revenue30) },
        ].map((stat) => (
          <div key={stat.label} className="bg-white px-4 py-5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-k-text-4">{stat.label}</p>
            <p className="numeral mt-1.5 text-[24px] font-semibold tracking-tight text-k-ink">
              {stat.value}
            </p>
          </div>
        ))}
      </section>
      {data.orders.total === 0 && (
        <p className="mt-2 text-[12px] text-k-text-3">
          Δεν έχει καταχωρηθεί ακόμη παραγγελία — οι αριθμοί γεμίζουν με την πρώτη.
        </p>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="recent">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="recent" className="text-[15px] font-semibold tracking-tight text-k-ink">
              Πρόσφατες παραγγελίες
            </h2>
            <Link
              href="/admin/orders"
              className="text-[12px] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
            >
              Όλες
            </Link>
          </div>

          {data.recent.length === 0 ? (
            <p className="border border-k-line bg-k-surface-2 px-4 py-10 text-center text-[13px] text-k-text-3">
              Καμία παραγγελία ακόμη.
            </p>
          ) : (
            <div className="overflow-x-auto border border-k-line">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Αριθμός</TableHead>
                    <TableHead>Πελάτης</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                    <TableHead className="text-right">Σύνολο</TableHead>
                    <TableHead className="w-12">ERP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent.map((o) => {
                    const s = ORDER_STATUS[o.status] ?? {
                      label: o.status,
                      className: "bg-k-surface-3 text-k-text-2",
                    };
                    return (
                      <TableRow key={o.orderNumber}>
                        <TableCell>
                          <Link
                            href={`/admin/orders/${o.orderNumber}`}
                            className="numeral text-[12.5px] text-k-ink underline-offset-2 hover:underline"
                          >
                            {o.orderNumber}
                          </Link>
                          <span className="numeral mt-0.5 block text-[11px] text-k-text-4">
                            {dt.format(o.createdAt)}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[16rem] truncate text-[12.5px] text-k-text-2">
                          {o.customer || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={s.className}>{s.label}</Badge>
                        </TableCell>
                        <TableCell className="numeral text-right text-[12.5px] text-k-ink">
                          {formatMoney(o.totalGross)}
                        </TableCell>
                        <TableCell>
                          {o.erpPushed ? (
                            <Check className="size-4 text-k-green" aria-label="Στο SoftOne" />
                          ) : o.paymentStatus === "PAID" ? (
                            <CircleAlert className="size-4 text-k-red" aria-label="Εκκρεμεί" />
                          ) : (
                            <span className="text-k-text-5">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="catalogue">
            <h2 id="catalogue" className="mb-3 text-[15px] font-semibold tracking-tight text-k-ink">
              Κατάλογος
            </h2>
            <dl className="divide-y divide-k-line border-y border-k-line text-[13px]">
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="text-k-text-2">Προϊόντα</dt>
                <dd className="numeral text-k-ink">{data.catalogue.products}</dd>
              </div>
              <div className="flex items-baseline justify-between py-2.5">
                <dt className="text-k-text-2">Ενεργά</dt>
                <dd className="numeral text-k-ink">{data.catalogue.active}</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="sync">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 id="sync" className="text-[15px] font-semibold tracking-tight text-k-ink">
                Συγχρονισμός
              </h2>
              <Link
                href="/admin/sync"
                className="text-[12px] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
              >
                Λεπτομέρειες
              </Link>
            </div>
            {data.sync.length === 0 ? (
              <p className="text-[12.5px] text-k-text-3">Δεν έχει τρέξει ακόμη.</p>
            ) : (
              <ul className="divide-y divide-k-line border-y border-k-line">
                {data.sync.map((s) => (
                  <li key={s.channel} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-[13px] text-k-text-2">{s.channel}</span>
                    <span className="numeral shrink-0 text-[11.5px] text-k-text-4">
                      {s.lastSuccessAt ? dt.format(s.lastSuccessAt) : "—"}
                    </span>
                    {s.lastStatus === "SUCCESS" ? (
                      <Check className="size-3.5 shrink-0 text-k-green" aria-label="Επιτυχία" />
                    ) : s.lastStatus ? (
                      <TriangleAlert
                        className="size-3.5 shrink-0 text-k-amber"
                        aria-label={s.lastStatus}
                      />
                    ) : (
                      <span className="w-3.5 shrink-0" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
