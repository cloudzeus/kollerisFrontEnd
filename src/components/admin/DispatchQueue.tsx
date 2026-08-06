"use client";

import { useState, useTransition } from "react";
import { Package, Truck } from "lucide-react";
import { toast } from "sonner";
import type { DispatchOrder } from "@/lib/courier/dispatch-queue";
import { createOrderVoucher } from "@/app/admin/(protected)/orders/actions";
import { formatMoney } from "@/lib/format";
import { ADMIN_LOCALE } from "@/lib/admin/locale";

/**
 * The queue: paid orders that are not yet parcels.
 *
 * Sits above the ACS board because it is the earlier half of the same job. The
 * board answers "what is going out today"; this answers "what still has to be
 * put on it", which is the question a dispatch desk actually starts from and
 * which the screen could not answer at all.
 *
 * ── One at a time, and all at once ──────────────────────────────────────────
 *
 * Both, because both are real. A single order gets a button on its row; a
 * morning's worth gets one button at the top. The bulk run is sequential and
 * reports per order rather than as a total: ACS refuses individual parcels for
 * individual reasons — a postcode it does not serve, a phone it cannot parse —
 * and "18 of 20 issued" with no idea which two is not a usable answer.
 */
export function DispatchQueue({ orders }: { orders: DispatchOrder[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [, start] = useTransition();

  const remaining = orders.filter((o) => !done[o.orderNumber]);

  async function issue(orderNumber: string): Promise<boolean> {
    setBusy(orderNumber);
    try {
      const result = await createOrderVoucher(orderNumber);
      if (result.ok) {
        setDone((prev) => ({ ...prev, [orderNumber]: result.voucherNo }));
        setFailed((prev) => {
          const next = { ...prev };
          delete next[orderNumber];
          return next;
        });
        return true;
      }
      setFailed((prev) => ({ ...prev, [orderNumber]: result.error }));
      return false;
    } catch (error) {
      setFailed((prev) => ({
        ...prev,
        [orderNumber]: error instanceof Error ? error.message : "Απέτυχε",
      }));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function issueAll() {
    const queue = remaining.map((o) => o.orderNumber);
    if (queue.length === 0) return;
    start(async () => {
      setBulk({ done: 0, total: queue.length });
      let ok = 0;
      for (const [index, orderNumber] of queue.entries()) {
        if (await issue(orderNumber)) ok++;
        setBulk({ done: index + 1, total: queue.length });
      }
      setBulk(null);
      if (ok === queue.length) toast.success(`Εκδόθηκαν ${ok} αποστολές`);
      else toast.error(`Εκδόθηκαν ${ok} από ${queue.length} — δείτε τις γραμμές με σφάλμα`);
    });
  }

  if (orders.length === 0) {
    return (
      <div className="mb-6 border border-k-line bg-white p-6 text-center">
        <Package className="mx-auto mb-2 size-5 text-k-text-3" />
        <div className="text-[13px] text-k-text-2">
          Καμία παραγγελία σε αναμονή αποστολής.
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 border border-k-line bg-white">
      <div className="flex items-center justify-between border-b border-k-line px-4 py-3">
        <div>
          <div className="text-[13px] font-medium">Προς αποστολή</div>
          <div className="text-[12px] text-k-text-3">
            {remaining.length} πληρωμένες παραγγελίες χωρίς αποστολή
          </div>
        </div>
        <button
          type="button"
          disabled={bulk !== null || busy !== null || remaining.length === 0}
          onClick={issueAll}
          className="border border-k-ink bg-k-ink px-3 py-1.5 text-[12px] text-white disabled:opacity-40"
        >
          {bulk ? `Έκδοση… ${bulk.done}/${bulk.total}` : `Έκδοση όλων (${remaining.length})`}
        </button>
      </div>

      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-k-line text-[11px] text-k-text-3">
            <th className="px-4 py-2 text-left font-medium">ΠΑΡΑΓΓΕΛΙΑ</th>
            <th className="px-2 py-2 text-left font-medium">ΠΑΡΑΛΗΠΤΗΣ</th>
            <th className="px-2 py-2 text-left font-medium">ΠΡΟΟΡΙΣΜΟΣ</th>
            <th className="px-2 py-2 text-center font-medium">ΕΙΔΗ</th>
            <th className="px-2 py-2 text-right font-medium">ΑΞΙΑ</th>
            <th className="px-4 py-2 text-right font-medium">ΑΠΟΣΤΟΛΗ</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const voucher = done[order.orderNumber];
            const problem = failed[order.orderNumber];
            return (
              <tr key={order.orderNumber} className="border-b border-k-line last:border-0">
                <td className="px-4 py-2.5 align-top">
                  <div className="numeral text-[12px]">{order.orderNumber}</div>
                  {problem && (
                    <div className="mt-1 text-[11px] text-k-red">{problem}</div>
                  )}
                </td>
                <td className="px-2 py-2.5 align-top">
                  <div>{order.customer}</div>
                  <div className="numeral text-[11px] text-k-text-3">{order.phone}</div>
                </td>
                <td className="px-2 py-2.5 align-top">
                  <div>{order.address}</div>
                  <div className="text-[11px] text-k-text-3">
                    {order.postcode} {order.city}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center align-top">{order.items}</td>
                <td className="numeral px-2 py-2.5 text-right align-top">
                  {formatMoney(order.totalGross, ADMIN_LOCALE)}
                </td>
                <td className="px-4 py-2.5 text-right align-top">
                  {voucher ? (
                    <span className="numeral text-[12px] text-k-green">{voucher}</span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null || bulk !== null}
                      onClick={() => start(() => void issue(order.orderNumber))}
                      className="border border-k-line px-2.5 py-1 text-[12px] transition-colors hover:border-k-ink disabled:opacity-40"
                    >
                      {busy === order.orderNumber ? (
                        "Έκδοση…"
                      ) : (
                        <>
                          <Truck className="mr-1 inline size-3" />
                          Έκδοση
                        </>
                      )}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
