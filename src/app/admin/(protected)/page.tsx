import Link from "next/link";
import { ArrowRight, Check, CircleAlert, ExternalLink, TriangleAlert } from "lucide-react";
import { auth } from "@/auth";
import { formatMoney } from "@/lib/format";
import { getDashboard } from "@/lib/admin/dashboard";
import { PageShell, Panel, Stat } from "@/components/admin/PageShell";
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
 * then how the shop is doing, then the detail. A counter that is zero is not
 * shown — an "0 προβλήματα" panel reads as broken, its absence reads as calm.
 */
export default async function AdminDashboard() {
  const session = await auth();
  const data = await getDashboard();

  return (
    <PageShell
      title="Επισκόπηση"
      description={session?.user.email}
      actions={
        <Link
          href="/"
          target="_blank"
          className="inline-flex items-center gap-1.5 border border-k-line bg-white px-3 py-1.5 text-[12.5px] text-k-text-2 transition-colors hover:border-k-line-2 hover:text-k-ink"
        >
          Κατάστημα
          <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      }
    >
      <div className="space-y-4">
        {data.attention.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`group flex h-full items-start gap-2.5 border border-l-[3px] border-k-line bg-white p-3.5 transition-colors hover:bg-k-surface-3 ${
                    item.tone === "urgent" ? "border-l-k-red" : "border-l-k-amber"
                  }`}
                >
                  {item.tone === "urgent" ? (
                    <CircleAlert className="mt-px size-4 shrink-0 text-k-red" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-px size-4 shrink-0 text-k-amber" aria-hidden />
                  )}
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium leading-snug text-k-ink">
                      <span className="numeral">{item.count}</span> · {item.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-[1.45] text-k-text-3">
                      {item.detail}
                    </span>
                  </span>
                  <ArrowRight className="ml-auto mt-px size-3.5 shrink-0 text-k-text-5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 border border-k-line bg-white px-4 py-3 text-[12.5px] text-k-text-2">
            <Check className="size-4 text-k-green" aria-hidden />
            Τίποτα δεν περιμένει ενέργεια.
          </p>
        )}

        <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Παραγγελίες · 7 ημέρες" value={String(data.orders.last7)} />
          <Stat
            label="Τζίρος · 7 ημέρες"
            value={formatMoney(data.orders.revenue7)}
            hint="μόνο πληρωμένες"
          />
          <Stat label="Παραγγελίες · 30 ημέρες" value={String(data.orders.last30)} />
          <Stat
            label="Τζίρος · 30 ημέρες"
            value={formatMoney(data.orders.revenue30)}
            hint="μόνο πληρωμένες"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Panel
            title="Πρόσφατες παραγγελίες"
            bodyClassName=""
            actions={
              <Link
                href="/admin/orders"
                className="text-[12px] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
              >
                Όλες
              </Link>
            }
          >
            {data.recent.length === 0 ? (
              <p className="px-4 py-12 text-center text-[12.5px] text-k-text-3">
                Καμία παραγγελία ακόμη. Οι αριθμοί παραπάνω γεμίζουν με την πρώτη.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Αριθμός</TableHead>
                      <TableHead>Πελάτης</TableHead>
                      <TableHead>Κατάσταση</TableHead>
                      <TableHead className="text-right">Σύνολο</TableHead>
                      <TableHead className="w-14 text-center">ERP</TableHead>
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
                            <span className="numeral mt-0.5 block text-[10.5px] text-k-text-4">
                              {dt.format(o.createdAt)}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-[15rem] truncate text-[12.5px] text-k-text-2">
                            {o.customer || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge className={s.className}>{s.label}</Badge>
                          </TableCell>
                          <TableCell className="numeral text-right text-[12.5px] text-k-ink">
                            {formatMoney(o.totalGross)}
                          </TableCell>
                          <TableCell className="text-center">
                            {o.erpPushed ? (
                              <Check className="mx-auto size-4 text-k-green" aria-label="Στο SoftOne" />
                            ) : o.paymentStatus === "PAID" ? (
                              <CircleAlert className="mx-auto size-4 text-k-red" aria-label="Εκκρεμεί" />
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
          </Panel>

          <div className="space-y-4">
            <Panel title="Κατάλογος" bodyClassName="">
              <dl className="divide-y divide-k-line text-[12.5px]">
                <div className="flex items-baseline justify-between px-4 py-2.5">
                  <dt className="text-k-text-2">Προϊόντα</dt>
                  <dd className="numeral text-k-ink">{data.catalogue.products}</dd>
                </div>
                <div className="flex items-baseline justify-between px-4 py-2.5">
                  <dt className="text-k-text-2">Ενεργά</dt>
                  <dd className="numeral text-k-ink">{data.catalogue.active}</dd>
                </div>
              </dl>
            </Panel>

            <Panel
              title="Συγχρονισμός"
              bodyClassName=""
              actions={
                <Link
                  href="/admin/sync"
                  className="text-[12px] text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                >
                  Λεπτομέρειες
                </Link>
              }
            >
              {data.sync.length === 0 ? (
                <p className="px-4 py-6 text-center text-[12.5px] text-k-text-3">
                  Δεν έχει τρέξει ακόμη.
                </p>
              ) : (
                <ul className="divide-y divide-k-line">
                  {data.sync.map((s) => (
                    <li key={s.channel} className="flex items-center gap-2 px-4 py-2.5">
                      {s.lastStatus === "SUCCESS" ? (
                        <Check className="size-3.5 shrink-0 text-k-green" aria-label="Επιτυχία" />
                      ) : s.lastStatus ? (
                        <TriangleAlert
                          className="size-3.5 shrink-0 text-k-amber"
                          aria-label={s.lastStatus}
                        />
                      ) : (
                        <span className="size-3.5 shrink-0" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-k-text-2">
                        {s.channel}
                      </span>
                      <span className="numeral shrink-0 text-[10.5px] text-k-text-4">
                        {s.lastSuccessAt ? dt.format(s.lastSuccessAt) : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
