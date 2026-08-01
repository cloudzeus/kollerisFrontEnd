"use client";

import { Fragment, useState, useTransition } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { actionApprove, actionReject } from "@/app/admin/(protected)/customers/actions";
import { ROLE_LABEL, type CompanyRow } from "@/lib/admin/customers-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
 * B2B companies.
 *
 * Approving is the consequential action on this screen: it creates a customer
 * in SoftOne and lets the company buy at partner prices. So it says what it
 * will do before it does it, and reports back what the ERP actually returned —
 * the TRDR, and whether a discount came with it.
 *
 * Rejection asks for a reason. It is stored on the company and is the only
 * record of why, months later, when somebody asks.
 */

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Σε αναμονή", className: "bg-k-amber text-white" },
  active: { label: "Ενεργή", className: "bg-k-green text-white" },
  rejected: { label: "Απορρίφθηκε", className: "bg-k-surface-3 text-k-text-3" },
  suspended: { label: "Σε αναστολή", className: "bg-k-red text-white" },
};

export function CompanyList({ companies }: { companies: CompanyRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirmApprove, setConfirmApprove] = useState<CompanyRow | null>(null);
  const [rejecting, setRejecting] = useState<CompanyRow | null>(null);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();

  function approve(c: CompanyRow) {
    setConfirmApprove(null);
    start(async () => {
      const result = await actionApprove(c.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.trdr
          ? `Εγκρίθηκε · TRDR ${result.trdr}${
              result.partnerFactor ? ` · έκπτωση ${Math.round((1 - result.partnerFactor) * 100)}%` : ""
            }`
          : "Εγκρίθηκε, αλλά το SoftOne δεν επέστρεψε TRDR.",
      );
    });
  }

  function reject(c: CompanyRow) {
    const text = reason.trim();
    setRejecting(null);
    setReason("");
    start(async () => {
      await actionReject(c.id, text);
      toast.success("Η αίτηση απορρίφθηκε.");
    });
  }

  if (companies.length === 0) {
    return (
      <p className="border border-k-line bg-white px-4 py-14 text-center text-[13px] text-k-text-3">
        Καμία εταιρεία εδώ.
      </p>
    );
  }

  return (
    <>
      <div className="border border-k-line bg-white">
        <ul className="divide-y divide-k-line">
          {companies.map((c) => {
            const isOpen = open === c.id;
            const s = STATUS[c.status] ?? { label: c.status, className: "bg-k-surface-3 text-k-text-2" };
            const days = Math.floor(c.waitingHours / 24);

            return (
              <Fragment key={c.id}>
                <li>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-k-surface-2",
                      isOpen && "bg-k-surface-2",
                    )}
                  >
                    <ChevronDown
                      className={cn(
                        "mt-1 size-3.5 shrink-0 text-k-text-4 transition-transform duration-150",
                        isOpen && "rotate-180",
                      )}
                    />

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-medium text-k-ink">{c.name}</span>
                        <Badge className={s.className}>{s.label}</Badge>
                        {c.erpTrdr && (
                          <span className="numeral text-[10.5px] text-k-text-4">
                            TRDR {c.erpTrdr}
                          </span>
                        )}
                      </span>
                      <span className="numeral mt-0.5 block text-[12px] text-k-text-3">
                        ΑΦΜ {c.afm}
                        {c.doy ? ` · ${c.doy}` : ""} · {c.members.length}{" "}
                        {c.members.length === 1 ? "χρήστης" : "χρήστες"}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="numeral block text-[11px] text-k-text-4">
                        {dt.format(c.createdAt)}
                      </span>
                      {c.status === "pending" && (
                        <span
                          className={cn(
                            "mt-0.5 inline-flex items-center gap-1 text-[10.5px]",
                            c.waitingHours >= 24 ? "text-k-red" : "text-k-text-4",
                          )}
                        >
                          <Clock className="size-2.5" />
                          {days >= 1 ? `${days} ${days === 1 ? "ημέρα" : "ημέρες"}` : `${c.waitingHours} ώρες`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>

                {isOpen && (
                  <li className="border-t border-k-line bg-k-surface-2 px-4 py-4">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
                      <div className="space-y-3">
                        <div className="border border-k-line bg-white">
                          <p className="border-b border-k-line px-3 py-2 text-[10px] uppercase tracking-[0.06em] text-k-text-4">
                            Χρήστες
                          </p>
                          {c.members.length === 0 ? (
                            <p className="px-3 py-4 text-center text-[12px] text-k-text-3">
                              Κανένας χρήστης.
                            </p>
                          ) : (
                            <ul className="divide-y divide-k-line-3">
                              {c.members.map((m) => (
                                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12.5px] text-k-ink">
                                      {m.name}
                                    </span>
                                    <span className="block truncate text-[11px] text-k-text-4">
                                      {m.email}
                                    </span>
                                  </span>
                                  {m.role && (
                                    <Badge className="bg-k-surface-3 text-k-text-2">
                                      {ROLE_LABEL[m.role] ?? m.role}
                                    </Badge>
                                  )}
                                  {m.spendLimit != null && (
                                    <span className="numeral text-[11px] text-k-text-4">
                                      όριο {m.spendLimit} €
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {c.status === "pending" && (
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              size="sm"
                              onClick={() => setConfirmApprove(c)}
                              disabled={pending}
                            >
                              {pending ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <ShieldCheck className="size-3.5" />
                              )}
                              Έγκριση
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRejecting(c)}
                              disabled={pending}
                              className="text-[12px] text-k-red"
                            >
                              <X className="size-3.5" />
                              Απόρριψη
                            </Button>
                          </div>
                        )}

                        {c.notes && (
                          <div className="border-l-[3px] border-k-line-2 bg-white px-3 py-2 text-[12px] leading-[1.5] text-k-text-2">
                            {c.notes}
                          </div>
                        )}
                      </div>

                      <dl className="space-y-2.5 text-[12px]">
                        <Detail label="Δραστηριότητα">
                          <span className="flex items-start gap-1.5">
                            <Building2 className="mt-0.5 size-3 shrink-0 text-k-text-4" />
                            <span>{c.profession || "—"}</span>
                          </span>
                        </Detail>
                        {c.address && <Detail label="Έδρα">{c.address}</Detail>}
                        {c.phone && (
                          <Detail label="Τηλέφωνο">
                            <a
                              href={`tel:${c.phone}`}
                              className="numeral inline-flex items-center gap-1.5 text-k-text-2 underline-offset-2 hover:text-k-ink hover:underline"
                            >
                              <Phone className="size-3 text-k-text-4" />
                              {c.phone}
                            </a>
                          </Detail>
                        )}
                        <Detail label="SoftOne">
                          {c.erpTrdr ? (
                            <span className="numeral flex items-center gap-1 text-k-green">
                              <Check className="size-3" />
                              TRDR {c.erpTrdr}
                            </span>
                          ) : (
                            <span className="text-k-text-3">δεν έχει δημιουργηθεί</span>
                          )}
                        </Detail>
                        <Detail label="Τιμολόγηση">
                          {c.partnerFactor ? (
                            <span className="numeral text-k-ink">
                              έκπτωση {Math.round((1 - c.partnerFactor) * 100)}%
                            </span>
                          ) : (
                            // The ERP holds the discount. No factor means the
                            // partner is shown the same PRICER02 as everyone.
                            <span className="text-k-text-3">χωρίς έκπτωση συνεργάτη</span>
                          )}
                        </Detail>
                        {c.approvedBy && (
                          <Detail label="Εγκρίθηκε από">
                            <span className="text-k-text-3">
                              {c.approvedBy}
                              {c.approvedAt && (
                                <span className="numeral block text-[10.5px]">
                                  {dt.format(c.approvedAt)}
                                </span>
                              )}
                            </span>
                          </Detail>
                        )}
                      </dl>
                    </div>
                  </li>
                )}
              </Fragment>
            );
          })}
        </ul>
      </div>

      <AlertDialog open={confirmApprove != null} onOpenChange={(o) => !o && setConfirmApprove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">
              Έγκριση {confirmApprove?.name};
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-[1.6]">
              Δημιουργείται πελάτης στο SoftOne με ΑΦΜ{" "}
              <span className="numeral text-k-ink">{confirmApprove?.afm}</span>, και οι χρήστες της
              εταιρείας αποκτούν πρόσβαση. Η έκπτωση συνεργάτη γράφεται από ό,τι επιστρέψει το ERP —
              δεν την ορίζουμε εμείς.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmApprove && approve(confirmApprove)}>
              Έγκριση
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejecting != null} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Απόρριψη αίτησης;</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-[1.6]">
              Δεν δημιουργείται τίποτα στο SoftOne. Ο λόγος αποθηκεύεται και είναι η μόνη εξήγηση
              που θα υπάρχει σε έξι μήνες.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="π.χ. δεν επαληθεύτηκε η δραστηριότητα"
            className="text-[13px]"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => rejecting && reject(rejecting)}
              className="bg-k-red hover:bg-k-red-hover"
            >
              Απόρριψη
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
