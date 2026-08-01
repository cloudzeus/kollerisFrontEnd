"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  Reply,
} from "lucide-react";
import { toast } from "sonner";
import { actionSetNotes, actionSetStatus } from "@/app/admin/(protected)/engagement/actions";
import { TOPIC_LABEL, type InboxMessage } from "@/lib/admin/inbox-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The contact inbox.
 *
 * Opening a message marks it in progress. Somebody reading a customer's message
 * has picked it up, and asking them to say so as well is a step that gets
 * skipped — after which two people answer the same person.
 *
 * Replying opens the mail client with the subject and a quote of the original,
 * then offers to mark the message answered. Sending mail from here would mean
 * customers replying into a mailbox nobody watches; the reply belongs in the
 * address they already wrote to.
 */

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

const STATUS: Record<string, { label: string; className: string }> = {
  new: { label: "Νέο", className: "bg-k-red text-white" },
  inProgress: { label: "Σε εξέλιξη", className: "bg-k-amber text-white" },
  answered: { label: "Απαντήθηκε", className: "bg-k-green text-white" },
  closed: { label: "Κλειστό", className: "bg-k-surface-3 text-k-text-3" },
};

function waiting(hours: number): { text: string; urgent: boolean } {
  if (hours < 1) return { text: "μόλις τώρα", urgent: false };
  if (hours < 24) return { text: `${hours} ώρες`, urgent: hours >= 8 };
  const days = Math.floor(hours / 24);
  return { text: `${days} ${days === 1 ? "ημέρα" : "ημέρες"}`, urgent: true };
}

export function Inbox({ messages }: { messages: InboxMessage[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function toggle(m: InboxMessage) {
    const next = open === m.id ? null : m.id;
    setOpen(next);
    // Reading is picking it up. Anything else and two people answer the same
    // customer.
    if (next && m.status === "new") {
      start(async () => {
        await actionSetStatus(m.id, "inProgress");
      });
    }
  }

  function move(id: string, status: "new" | "inProgress" | "answered" | "closed", label: string) {
    start(async () => {
      await actionSetStatus(id, status);
      toast.success(label);
    });
  }

  function saveNotes(id: string) {
    start(async () => {
      await actionSetNotes(id, notes[id] ?? "");
      toast.success("Η σημείωση αποθηκεύτηκε.");
    });
  }

  function replyHref(m: InboxMessage): string {
    const subject = `Re: ${m.subject}`;
    const quoted = m.message
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    const body = `\n\n---\nΣτις ${dt.format(m.createdAt)} γράψατε:\n${quoted}`;
    return `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  if (messages.length === 0) {
    return (
      <p className="border border-k-line bg-white px-4 py-14 text-center text-[13px] text-k-text-3">
        Κανένα μήνυμα εδώ.
      </p>
    );
  }

  return (
    <div className="border border-k-line bg-white">
      <ul className="divide-y divide-k-line">
        {messages.map((m) => {
          const isOpen = open === m.id;
          const s = STATUS[m.status] ?? { label: m.status, className: "bg-k-surface-3 text-k-text-2" };
          const w = waiting(m.waitingHours);

          return (
            <Fragment key={m.id}>
              <li>
                <button
                  type="button"
                  onClick={() => toggle(m)}
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
                      <span
                        className={cn(
                          "text-[13px] text-k-ink",
                          m.status === "new" && "font-semibold",
                        )}
                      >
                        {m.subject}
                      </span>
                      <Badge className={s.className}>{s.label}</Badge>
                      <Badge className="bg-k-surface-3 text-k-text-2">
                        {TOPIC_LABEL[m.topic] ?? m.topic}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-k-text-3">
                      {m.name}
                      {m.company ? ` · ${m.company}` : ""} · {m.email}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="numeral block text-[11px] text-k-text-4">
                      {dt.format(m.createdAt)}
                    </span>
                    {(m.status === "new" || m.status === "inProgress") && (
                      <span
                        className={cn(
                          "mt-0.5 inline-flex items-center gap-1 text-[10.5px]",
                          w.urgent ? "text-k-red" : "text-k-text-4",
                        )}
                      >
                        <Clock className="size-2.5" />
                        {w.text}
                      </span>
                    )}
                  </span>
                </button>
              </li>

              {isOpen && (
                <li className="border-t border-k-line bg-k-surface-2 px-4 py-4">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                    <div className="space-y-3">
                      <div className="whitespace-pre-wrap border border-k-line bg-white p-3 text-[13px] leading-[1.6] text-k-text-1">
                        {m.message}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm">
                          <a href={replyHref(m)}>
                            <Reply className="size-3.5" />
                            Απάντηση
                          </a>
                        </Button>
                        {m.status !== "answered" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => move(m.id, "answered", "Σημειώθηκε ως απαντημένο.")}
                            disabled={pending}
                            className="text-[12px]"
                          >
                            <Check className="size-3.5" />
                            Απαντήθηκε
                          </Button>
                        )}
                        {m.status !== "closed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => move(m.id, "closed", "Έκλεισε.")}
                            disabled={pending}
                            className="text-[12px] text-k-text-3"
                          >
                            Κλείσιμο
                          </Button>
                        )}
                        {pending && <Loader2 className="size-3.5 animate-spin text-k-text-4" />}

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="ml-auto grid size-7 place-items-center text-k-text-4 transition-colors hover:bg-white hover:text-k-ink"
                            aria-label="Περισσότερα"
                          >
                            <MoreHorizontal className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-[11px] text-k-text-3">
                              Κατάσταση
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => move(m.id, "new", "Επιστροφή στα νέα.")}>
                              Επαναφορά σε «Νέο»
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => move(m.id, "inProgress", "Σε εξέλιξη.")}
                            >
                              Σε εξέλιξη
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div>
                        <label
                          htmlFor={`n-${m.id}`}
                          className="text-[11px] uppercase tracking-[0.06em] text-k-text-4"
                        >
                          Εσωτερική σημείωση
                        </label>
                        <Textarea
                          id={`n-${m.id}`}
                          rows={2}
                          defaultValue={m.notes ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [m.id]: e.target.value }))}
                          placeholder="Δεν τη βλέπει ο πελάτης."
                          className="mt-1 bg-white text-[12.5px]"
                        />
                        {notes[m.id] !== undefined && notes[m.id] !== (m.notes ?? "") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => saveNotes(m.id)}
                            disabled={pending}
                            className="mt-1.5 text-[12px]"
                          >
                            Αποθήκευση σημείωσης
                          </Button>
                        )}
                      </div>
                    </div>

                    <dl className="space-y-2.5 text-[12px]">
                      <Detail label="Επικοινωνία">
                        <a
                          href={`mailto:${m.email}`}
                          className="flex items-center gap-1.5 text-k-ink underline-offset-2 hover:underline"
                        >
                          <Mail className="size-3 shrink-0 text-k-text-4" />
                          <span className="truncate">{m.email}</span>
                        </a>
                        {m.phone && (
                          <a
                            href={`tel:${m.phone}`}
                            className="numeral mt-0.5 flex items-center gap-1.5 text-k-text-2 underline-offset-2 hover:text-k-ink hover:underline"
                          >
                            <Phone className="size-3 shrink-0 text-k-text-4" />
                            {m.phone}
                          </a>
                        )}
                      </Detail>

                      {(m.company || m.vatNumber) && (
                        <Detail label="Εταιρεία">
                          <span className="flex items-start gap-1.5">
                            <Building2 className="mt-0.5 size-3 shrink-0 text-k-text-4" />
                            <span>
                              {m.company || "—"}
                              {m.vatNumber && (
                                <span className="numeral block text-k-text-3">
                                  ΑΦΜ {m.vatNumber}
                                </span>
                              )}
                            </span>
                          </span>
                        </Detail>
                      )}

                      {m.orderRef && (
                        <Detail label="Παραγγελία">
                          <Link
                            href={`/admin/orders?q=${encodeURIComponent(m.orderRef)}`}
                            className="numeral inline-flex items-center gap-1 text-k-ink underline-offset-2 hover:underline"
                          >
                            {m.orderRef}
                            <ExternalLink className="size-3" />
                          </Link>
                        </Detail>
                      )}

                      {m.pagePath && (
                        <Detail label="Από τη σελίδα">
                          <span className="break-all font-mono text-[11px] text-k-text-3">
                            {m.pagePath}
                          </span>
                        </Detail>
                      )}

                      {m.handledBy && (
                        <Detail label="Τελευταία ενέργεια">
                          <span className="text-k-text-3">
                            {m.handledBy}
                            {m.handledAt && (
                              <span className="numeral block text-[10.5px]">
                                {dt.format(m.handledAt)}
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
