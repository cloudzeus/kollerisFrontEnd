"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  ChevronDown,
  CircleAlert,
  Copy,
  ExternalLink,
  Eye,
  Mail,
  MoreHorizontal,
  Phone,
  Search,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import type { RecentOrder } from "@/lib/admin/dashboard";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The orders list.
 *
 * Every row expands. An order is a customer, an address, a payment method and a
 * basket, and none of that fits in a table row — but opening a page to answer
 * "what did they buy" is a navigation for a two-second question. The lines are
 * fetched with the list, so expanding costs nothing.
 *
 * Row actions live in a menu rather than as icons in a column: the useful ones
 * differ by state (an order already in the ERP cannot be pushed again) and a row
 * of greyed-out icons teaches nobody why.
 *
 * Sorting and filtering are client-side because this list is eight rows. The
 * full orders screen will page on the server; here that would be a round-trip
 * to reorder something already in memory.
 */

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

const STATUS: Record<string, { label: string; className: string }> = {
  PENDING_PAYMENT: { label: "Αναμονή πληρωμής", className: "bg-k-surface-3 text-k-text-2" },
  CONFIRMED: { label: "Επιβεβαιωμένη", className: "bg-k-ink text-white" },
  SHIPPED: { label: "Απεστάλη", className: "bg-k-blue text-white" },
  DELIVERED: { label: "Παραδόθηκε", className: "bg-k-green text-white" },
  CANCELLED: { label: "Ακυρώθηκε", className: "bg-k-surface-3 text-k-text-3" },
  FAILED: { label: "Απέτυχε", className: "bg-k-red text-white" },
};

const PAYMENT: Record<string, string> = {
  card: "Κάρτα",
  iris: "IRIS",
  bank: "Τραπεζική κατάθεση",
  credit: "Επί πιστώσει",
  cod: "Αντικαταβολή",
};

const SHIPPING: Record<string, string> = {
  courier: "ACS",
  express: "ACS Express",
  pickup: "Παραλαβή από κατάστημα",
};

type SortKey = "date" | "total" | "customer";

export function OrdersTable({
  orders,
  /**
   * Hidden on the full orders screen, which searches on the server. Two search
   * boxes on one page is a question about which one is authoritative, and the
   * answer ("the one that only sees this page") is not worth explaining.
   */
  showSearch = true,
}: {
  orders: RecentOrder[];
  showSearch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "date", desc: true });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? orders.filter(
          (o) =>
            o.orderNumber.toLowerCase().includes(q) ||
            o.customer.toLowerCase().includes(q) ||
            o.email.toLowerCase().includes(q) ||
            o.lines.some((l) => l.sku.toLowerCase().includes(q)),
        )
      : orders;

    const sorted = [...filtered].sort((a, b) => {
      if (sort.key === "total") return a.totalGross - b.totalGross;
      if (sort.key === "customer") return a.customer.localeCompare(b.customer, "el");
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    return sort.desc ? sorted.reverse() : sorted;
  }, [orders, query, sort]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sortBy(key: SortKey) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));
  }

  async function copy(text: string, what: string) {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} αντιγράφηκε.`);
  }

  if (orders.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-[12.5px] text-k-text-3">
        Καμία παραγγελία ακόμη. Οι αριθμοί παραπάνω γεμίζουν με την πρώτη.
      </p>
    );
  }

  return (
    <div>
      {showSearch && (
      <div className="flex items-center gap-2 border-b border-k-line px-3 py-2">
        <div className="relative max-w-[18rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αριθμός, πελάτης, email, κωδικός…"
            className="h-8 pl-8 text-[12.5px]"
            aria-label="Αναζήτηση παραγγελιών"
          />
        </div>
        <span className="numeral ml-auto text-[11.5px] text-k-text-4">
          {rows.length === orders.length
            ? `${orders.length} παραγγελίες`
            : `${rows.length} από ${orders.length}`}
        </span>
      </div>
      )}

      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-k-line text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
            <th className="w-8" />
            <SortHeader active={sort.key === "date"} desc={sort.desc} onClick={() => sortBy("date")}>
              Αριθμός
            </SortHeader>
            <SortHeader
              active={sort.key === "customer"}
              desc={sort.desc}
              onClick={() => sortBy("customer")}
            >
              Πελάτης
            </SortHeader>
            <th className="px-3 py-2 font-medium">Κατάσταση</th>
            <SortHeader
              active={sort.key === "total"}
              desc={sort.desc}
              onClick={() => sortBy("total")}
              className="text-right"
            >
              Σύνολο
            </SortHeader>
            <th className="w-10 px-2 py-2 text-center font-medium">ERP</th>
            <th className="w-10" />
          </tr>
        </thead>

        <tbody>
          {rows.map((o) => {
            const isOpen = expanded.has(o.orderNumber);
            const s = STATUS[o.status] ?? { label: o.status, className: "bg-k-surface-3 text-k-text-2" };

            return (
              <Fragment key={o.orderNumber}>
                <tr
                  onClick={() => toggle(o.orderNumber)}
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
                      aria-hidden
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="numeral block whitespace-nowrap text-[12.5px] text-k-ink">{o.orderNumber}</span>
                    <span className="numeral block text-[10.5px] text-k-text-4">
                      {dt.format(o.createdAt)}
                    </span>
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 text-[12.5px] text-k-text-2">
                    {o.customer || "—"}
                    {o.wantsInvoice && (
                      <span className="ml-1.5 text-[10px] text-k-text-4">ΤΙΜΟΛΟΓΙΟ</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={s.className}>{s.label}</Badge>
                  </td>
                  <td className="numeral px-3 py-2.5 text-right text-[12.5px] text-k-ink">
                    {formatMoney(o.totalGross)}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {o.erpPushed ? (
                      <span className="numeral text-[11px] text-k-green" title={`FINDOC ${o.erpFindoc}`}>
                        ✓
                      </span>
                    ) : o.paymentStatus === "PAID" ? (
                      <CircleAlert className="mx-auto size-3.5 text-k-red" aria-label="Εκκρεμεί" />
                    ) : (
                      <span className="text-k-text-5">—</span>
                    )}
                  </td>
                  <td className="pr-2" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="grid size-7 place-items-center text-k-text-4 transition-colors hover:bg-k-surface-3 hover:text-k-ink"
                        aria-label={`Ενέργειες για ${o.orderNumber}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel className="numeral text-[11px] text-k-text-3">
                          {o.orderNumber}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/orders/${o.orderNumber}`}>
                            <Eye className="size-3.5" />
                            Άνοιγμα παραγγελίας
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copy(o.orderNumber, "Ο αριθμός")}>
                          <Copy className="size-3.5" />
                          Αντιγραφή αριθμού
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <a href={`mailto:${o.email}`}>
                            <Mail className="size-3.5" />
                            Email στον πελάτη
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`tel:${o.phone}`}>
                            <Phone className="size-3.5" />
                            {o.phone || "—"}
                          </a>
                        </DropdownMenuItem>
                        {!o.erpPushed && o.paymentStatus === "PAID" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-k-red focus:text-k-red">
                              <Truck className="size-3.5" />
                              Αποστολή στο SoftOne
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>

                {isOpen && (
                  <tr className="border-b border-k-line bg-k-surface-2">
                    <td colSpan={7} className="px-3 pb-4 pt-1">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
                        <div className="border border-k-line bg-white">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-k-line text-[10px] uppercase tracking-[0.06em] text-k-text-4">
                                <th className="px-3 py-1.5 font-medium">Κωδικός</th>
                                <th className="px-3 py-1.5 font-medium">Προϊόν</th>
                                <th className="px-3 py-1.5 text-center font-medium">Τεμ.</th>
                                <th className="px-3 py-1.5 text-right font-medium">Αξία</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.lines.map((l, i) => (
                                <tr key={`${l.sku}-${i}`} className="border-b border-k-line-3 last:border-0">
                                  <td className="numeral px-3 py-1.5 text-[11.5px] text-k-text-3">
                                    {l.sku}
                                  </td>
                                  <td className="max-w-[22rem] truncate px-3 py-1.5 text-[12px] text-k-text-2">
                                    {l.name}
                                  </td>
                                  <td className="numeral px-3 py-1.5 text-center text-[12px] text-k-ink">
                                    {l.quantity}
                                  </td>
                                  <td className="numeral px-3 py-1.5 text-right text-[12px] text-k-ink">
                                    {formatMoney(l.lineGross)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        <dl className="space-y-2 text-[12px]">
                          <Detail label="Επικοινωνία">
                            <span className="block truncate">{o.email}</span>
                            <span className="numeral block text-k-text-3">{o.phone}</span>
                          </Detail>
                          <Detail label="Αποστολή">
                            {SHIPPING[o.shippingMethod] ?? o.shippingMethod}
                            {o.city ? ` · ${o.city}` : ""}
                          </Detail>
                          <Detail label="Πληρωμή">
                            {PAYMENT[o.paymentMethod] ?? o.paymentMethod}
                          </Detail>
                          {o.wantsInvoice && (
                            <Detail label="Τιμολόγιο">
                              <span className="numeral">ΑΦΜ {o.vatNumber ?? "—"}</span>
                            </Detail>
                          )}
                          <Detail label="SoftOne">
                            {o.erpPushed ? (
                              <span className="numeral text-k-green">FINDOC {o.erpFindoc}</span>
                            ) : o.erpError ? (
                              <span className="text-k-red">{o.erpError.slice(0, 120)}</span>
                            ) : (
                              <span className="text-k-text-3">δεν έχει σταλεί</span>
                            )}
                          </Detail>
                          <Link
                            href={`/admin/orders/${o.orderNumber}`}
                            className="inline-flex items-center gap-1.5 pt-1 text-[12px] text-k-ink underline-offset-2 hover:underline"
                          >
                            Πλήρης παραγγελία
                            <ExternalLink className="size-3" aria-hidden />
                          </Link>
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
    </div>
  );
}

function SortHeader({
  children,
  active,
  desc,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active: boolean;
  desc: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={cn("px-3 py-2 font-medium", className)}>
      <button
        type="button"
        onClick={onClick}
        aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-[0.06em] transition-colors hover:text-k-ink",
          active && "text-k-ink",
        )}
      >
        {children}
        <ArrowDownUp className={cn("size-3", active ? "text-k-ink" : "text-k-text-5")} />
      </button>
    </th>
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
