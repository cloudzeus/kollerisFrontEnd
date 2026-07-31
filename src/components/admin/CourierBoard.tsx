"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  CircleAlert,
  FileDown,
  Loader2,
  MapPin,
  MoreHorizontal,
  Printer,
  Search,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import {
  actionCancelVoucher,
  actionIssuePickupList,
  actionPrintPickupList,
  actionPrintVoucher,
  actionTrack,
} from "@/app/admin/(protected)/courier/actions";
import type { AcsCheckpoint, AcsPickupList, AcsVoucher } from "@/lib/courier/acs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The dispatch desk for one day.
 *
 * Built around the shape of the work rather than the shape of the API: parcels
 * go out, get printed, and at the end of the day the list is closed. Closing is
 * the one irreversible step and is the only thing behind a confirmation.
 *
 * Tracking loads on expand rather than with the list. Twenty parcels would be
 * twenty ACS calls to show a column nobody reads until something is late.
 *
 * A PDF is opened rather than downloaded: dispatch prints labels, and a folder
 * filling with `voucher-*.pdf` is a step between them and the printer.
 */

export function CourierBoard({
  date,
  vouchers,
  lists,
  error,
}: {
  date: string;
  vouchers: AcsVoucher[];
  lists: AcsPickupList[];
  error: string | null;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tracking, setTracking] = useState<Record<string, AcsCheckpoint[]>>({});
  const [confirmClose, setConfirmClose] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<AcsVoucher | null>(null);
  const [pending, start] = useTransition();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vouchers;
    return vouchers.filter(
      (v) =>
        v.voucherNo.toLowerCase().includes(q) ||
        (v.recipient ?? "").toLowerCase().includes(q) ||
        (v.area ?? "").toLowerCase().includes(q) ||
        (v.zipCode ?? "").includes(q),
    );
  }, [vouchers, query]);

  const unlisted = vouchers.filter((v) => !v.pickupListNo).length;
  const delivered = vouchers.filter((v) => v.delivered).length;

  function openPdf(base64: string, filename: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const win = window.open(url, "_blank");
    if (!win) {
      // Popup blocked — fall back to a download so the click is not simply lost.
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function print(voucherNo: string, type: 1 | 2) {
    start(async () => {
      const result = await actionPrintVoucher(voucherNo, type);
      if (result.ok) openPdf(result.data.pdfBase64, result.data.filename);
      else toast.error(result.error);
    });
  }

  function printList(massNumber: string) {
    start(async () => {
      const result = await actionPrintPickupList(massNumber, date);
      if (result.ok) openPdf(result.data.pdfBase64, result.data.filename);
      else toast.error(result.error);
    });
  }

  function toggle(voucherNo: string) {
    const next = expanded === voucherNo ? null : voucherNo;
    setExpanded(next);
    if (next && !tracking[next]) {
      start(async () => {
        const result = await actionTrack(next);
        if (result.ok) setTracking((t) => ({ ...t, [next]: result.data.checkpoints }));
        else toast.error(result.error);
      });
    }
  }

  function closeDay() {
    setConfirmClose(false);
    start(async () => {
      const result = await actionIssuePickupList(date);
      if (result.ok) toast.success("Η λίστα παραλαβής εκδόθηκε.");
      else toast.error(result.error);
    });
  }

  function cancel(v: AcsVoucher) {
    setConfirmCancel(null);
    start(async () => {
      const result = await actionCancelVoucher(v.voucherNo);
      if (result.ok) toast.success(`Το voucher ${v.voucherNo} ακυρώθηκε.`);
      else toast.error(result.error);
    });
  }

  if (error) {
    return (
      <div className="flex items-start gap-2.5 border border-k-line bg-white px-4 py-3.5">
        <CircleAlert className="mt-px size-4 shrink-0 text-k-red" />
        <div>
          <p className="text-[13px] text-k-ink">Η ACS δεν απάντησε.</p>
          <p className="mt-0.5 text-[11.5px] text-k-text-3">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-3">
        <Figure label="Αποστολές ημέρας" value={String(vouchers.length)} />
        <Figure
          label="Εκτός λίστας"
          value={String(unlisted)}
          hint={unlisted > 0 ? "περιμένουν έκδοση" : undefined}
          tone={unlisted > 0 ? "warn" : undefined}
        />
        <Figure label="Παραδόθηκαν" value={String(delivered)} />
      </div>

      {/* ── Λίστες παραλαβής ── */}
      <section className="border border-k-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-k-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-tight text-k-ink">Λίστες παραλαβής</h2>
          <Button
            size="sm"
            onClick={() => setConfirmClose(true)}
            disabled={pending || unlisted === 0}
            title={unlisted === 0 ? "Δεν υπάρχουν vouchers εκτός λίστας" : undefined}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Truck className="size-3.5" />}
            Κλείσιμο ημέρας
          </Button>
        </div>

        {lists.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-k-text-3">
            Δεν έχει εκδοθεί λίστα για αυτή την ημέρα.
          </p>
        ) : (
          <ul className="divide-y divide-k-line">
            {lists.map((l) => (
              <li key={l.massNumber} className="flex items-center gap-3 px-4 py-2.5">
                <span className="numeral flex-1 text-[12.5px] text-k-ink">{l.massNumber}</span>
                <span className="numeral text-[11.5px] text-k-text-4">
                  {l.vouchers ?? 0} αποστολές
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => l.massNumber && printList(l.massNumber)}
                  disabled={pending}
                  className="text-[12px]"
                >
                  <FileDown className="size-3" />
                  PDF
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Αποστολές ── */}
      <section className="border border-k-line bg-white">
        <div className="flex items-center gap-2 border-b border-k-line px-3 py-2">
          <div className="relative max-w-[20rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Voucher, παραλήπτης, περιοχή, ΤΚ…"
              className="h-8 pl-8 text-[12.5px]"
              aria-label="Αναζήτηση αποστολών"
            />
          </div>
          <span className="numeral ml-auto text-[11.5px] text-k-text-4">
            {rows.length === vouchers.length ? `${vouchers.length}` : `${rows.length} από ${vouchers.length}`}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-[12.5px] text-k-text-3">
            {vouchers.length === 0
              ? "Καμία αποστολή για αυτή την ημέρα."
              : `Κανένα αποτέλεσμα για «${query}».`}
          </p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-k-line text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
                <th className="w-8" />
                <th className="px-3 py-2 font-medium">Voucher</th>
                <th className="px-3 py-2 font-medium">Παραλήπτης</th>
                <th className="px-3 py-2 font-medium">Προορισμός</th>
                <th className="px-3 py-2 font-medium">Κατάσταση</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => {
                const isOpen = expanded === v.voucherNo;
                return (
                  <Fragment key={v.voucherNo}>
                    <tr
                      onClick={() => toggle(v.voucherNo)}
                      className={cn(
                        "cursor-pointer border-b border-k-line transition-colors hover:bg-k-surface-2",
                        isOpen && "bg-k-surface-2",
                      )}
                    >
                      <td className="pl-3">
                        <ChevronDown
                          className={cn(
                            "size-3.5 text-k-text-4 transition-transform duration-150",
                            isOpen && "rotate-180",
                          )}
                        />
                      </td>
                      <td className="numeral whitespace-nowrap px-3 py-2.5 text-[12.5px] text-k-ink">
                        {v.voucherNo}
                        {!v.pickupListNo && (
                          <span className="ml-1.5 text-[10px] text-k-amber">ΕΚΤΟΣ ΛΙΣΤΑΣ</span>
                        )}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2.5 text-[12.5px] text-k-text-2">
                        {v.recipient || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-[12.5px] text-k-text-2">
                        {v.area || "—"}
                        {v.zipCode ? <span className="numeral text-k-text-4"> · {v.zipCode}</span> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        {v.delivered ? (
                          <Badge className="bg-k-green text-white">Παραδόθηκε</Badge>
                        ) : v.status ? (
                          <Badge className="bg-k-surface-3 text-k-text-2">{v.status}</Badge>
                        ) : (
                          <span className="text-[12px] text-k-text-4">—</span>
                        )}
                      </td>
                      <td className="pr-2" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="grid size-7 place-items-center text-k-text-4 transition-colors hover:bg-k-surface-3 hover:text-k-ink"
                            aria-label={`Ενέργειες για ${v.voucherNo}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel className="numeral text-[11px] text-k-text-3">
                              {v.voucherNo}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => print(v.voucherNo, 1)}>
                              <Printer className="size-3.5" />
                              Ετικέτα (θερμικό)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => print(v.voucherNo, 2)}>
                              <FileDown className="size-3.5" />
                              Εκτύπωση A4
                            </DropdownMenuItem>
                            {/* Cancelling is only possible before collection; ACS
                                refuses afterwards and says so. */}
                            {!v.pickupListNo && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setConfirmCancel(v)}
                                  className="text-k-red focus:text-k-red"
                                >
                                  <Ban className="size-3.5" />
                                  Ακύρωση voucher
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="border-b border-k-line bg-k-surface-2">
                        <td colSpan={6} className="px-3 pb-4 pt-1">
                          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
                            <div className="border border-k-line bg-white p-3">
                              <p className="mb-2 text-[10px] uppercase tracking-[0.06em] text-k-text-4">
                                Πορεία
                              </p>
                              {!tracking[v.voucherNo] ? (
                                <p className="flex items-center gap-1.5 text-[12px] text-k-text-3">
                                  <Loader2 className="size-3 animate-spin" />
                                  Φόρτωση…
                                </p>
                              ) : tracking[v.voucherNo].length === 0 ? (
                                <p className="text-[12px] text-k-text-3">
                                  Δεν υπάρχει ακόμη κίνηση για αυτή την αποστολή.
                                </p>
                              ) : (
                                <ol className="space-y-2">
                                  {tracking[v.voucherNo].map((c, i) => (
                                    <li key={i} className="flex gap-2.5">
                                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-k-ink" />
                                      <span className="min-w-0">
                                        <span className="block text-[12px] text-k-ink">
                                          {c.action || "—"}
                                        </span>
                                        <span className="numeral block text-[10.5px] text-k-text-4">
                                          {c.date}
                                          {c.location ? ` · ${c.location}` : ""}
                                        </span>
                                      </span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </div>

                            <dl className="space-y-2 text-[12px]">
                              <Detail label="Διεύθυνση">
                                <span className="flex items-start gap-1.5">
                                  <MapPin className="mt-0.5 size-3 shrink-0 text-k-text-4" />
                                  <span>
                                    {v.address || "—"}
                                    {v.area ? <span className="block text-k-text-3">{v.area}</span> : null}
                                  </span>
                                </span>
                              </Detail>
                              <Detail label="Δέμα">
                                <span className="numeral">
                                  {v.items ?? 1} τεμ.
                                  {v.weight ? ` · ${v.weight} kg` : ""}
                                </span>
                              </Detail>
                              {v.codAmount ? (
                                <Detail label="Αντικαταβολή">
                                  <span className="numeral text-k-amber">{v.codAmount} €</span>
                                </Detail>
                              ) : null}
                              <Detail label="Λίστα παραλαβής">
                                {v.pickupListNo ? (
                                  <span className="numeral flex items-center gap-1 text-k-green">
                                    <Check className="size-3" />
                                    {v.pickupListNo}
                                  </span>
                                ) : (
                                  <span className="text-k-amber">δεν έχει εκδοθεί</span>
                                )}
                              </Detail>
                            </dl>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Κλείσιμο ημέρας;</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-[1.6]">
              Εκδίδεται λίστα παραλαβής για {unlisted}{" "}
              {unlisted === 1 ? "αποστολή" : "αποστολές"}. Μετά την έκδοση η ACS τις περιμένει και{" "}
              <strong className="text-k-ink">δεν μπορούν να ακυρωθούν</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={closeDay}>Έκδοση λίστας</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCancel != null} onOpenChange={(o) => !o && setConfirmCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Ακύρωση voucher;</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-[1.6]">
              Το {confirmCancel?.voucherNo} διαγράφεται από την ACS. Αν η ετικέτα έχει ήδη κολληθεί
              στο δέμα, θα χρειαστεί νέα.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmCancel && cancel(confirmCancel)}
              className="bg-k-red hover:bg-k-red-hover"
            >
              Ακύρωση voucher
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn";
}) {
  return (
    <div className="bg-white px-4 py-3.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-k-text-4">{label}</p>
      <p
        className={cn(
          "numeral mt-1 text-[21px] font-semibold leading-none tracking-tight",
          tone === "warn" ? "text-k-amber" : "text-k-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-k-text-4">{hint}</p>}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-[0.06em] text-k-text-4">{label}</dt>
      <dd className="mt-0.5 text-k-text-2">{children}</dd>
    </div>
  );
}
