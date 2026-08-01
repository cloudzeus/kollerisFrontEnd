import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { FILTERS, getOrders, type OrderFilter } from "@/lib/admin/orders";
import { PageShell } from "@/components/admin/PageShell";
import { OrdersTable } from "@/components/admin/OrdersTable";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Admin screen — orders.
 *
 * Filter, search and page all live in the URL. That makes a queue a link
 * somebody can send ("these are the ones stuck outside the ERP"), keeps the
 * back button honest, and means a refresh after acting on an order returns to
 * the same view rather than the top of everything.
 *
 * The filter tabs carry counts so the work is visible before it is opened —
 * "Εκτός ERP 3" is a different morning from "Εκτός ERP 0".
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string; page?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "orders");

  const params = await searchParams;
  const filter = (FILTERS.some((f) => f.id === params.filter)
    ? params.filter
    : "all") as OrderFilter;
  const query = params.q ?? "";
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const data = await getOrders({ filter, query, page });

  const link = (next: Partial<{ filter: string; q: string; page: number }>) => {
    const sp = new URLSearchParams();
    const f = next.filter ?? filter;
    const q = next.q ?? query;
    const p = next.page ?? 1;
    if (f !== "all") sp.set("filter", f);
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <PageShell
      title="Παραγγελίες"
      description={`${data.total} ${data.total === 1 ? "παραγγελία" : "παραγγελίες"}${
        query ? ` για «${query}»` : ""
      }`}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-1" aria-label="Φίλτρα">
            {FILTERS.map((f) => {
              const count = data.counts[f.id];
              const active = f.id === filter;
              return (
                <Link
                  key={f.id}
                  href={link({ filter: f.id, page: 1 })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 border px-2.5 py-1.5 text-[12.5px] transition-colors",
                    active
                      ? "border-k-ink bg-k-ink text-white"
                      : "border-k-line bg-white text-k-text-2 hover:border-k-line-2 hover:text-k-ink",
                  )}
                >
                  {f.label}
                  <span
                    className={cn(
                      "numeral text-[11px]",
                      active
                        ? "text-white/70"
                        : count > 0 && f.id === "erp-pending"
                          ? "text-k-red"
                          : "text-k-text-4",
                    )}
                  >
                    {count}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* GET form: the search lands in the URL like every other bit of
              state here, so a result set is shareable and survives a refresh. */}
          <form action="/admin/orders" className="relative ml-auto max-w-[20rem] flex-1">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Αριθμός, email, ΑΦΜ, κωδικός…"
              aria-label="Αναζήτηση παραγγελιών"
              className="h-8 w-full border border-k-line-2 bg-white pl-8 pr-3 text-[12.5px] outline-none focus:border-k-ink"
            />
          </form>
        </div>

        <div className="border border-k-line bg-white">
          <OrdersTable orders={data.orders} showSearch={false} />
        </div>

        {data.pages > 1 && (
          <nav className="flex items-center justify-between gap-3" aria-label="Σελίδες">
            <Pager href={link({ page: data.page - 1 })} disabled={data.page === 1} back>
              Προηγούμενη
            </Pager>
            <span className="numeral text-[12px] text-k-text-3">
              {data.page} από {data.pages}
            </span>
            <Pager href={link({ page: data.page + 1 })} disabled={data.page >= data.pages}>
              Επόμενη
            </Pager>
          </nav>
        )}
      </div>
    </PageShell>
  );
}

function Pager({
  href,
  disabled,
  back,
  children,
}: {
  href: string;
  disabled: boolean;
  back?: boolean;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex items-center gap-1.5 border px-3 py-1.5 text-[12.5px] transition-colors";

  if (disabled) {
    return (
      <span className={cn(className, "border-k-line bg-white text-k-text-5")} aria-disabled>
        {back && <ChevronLeft className="size-3.5" />}
        {children}
        {!back && <ChevronRight className="size-3.5" />}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className={cn(className, "border-k-line bg-white text-k-text-2 hover:border-k-ink hover:text-k-ink")}
    >
      {back && <ChevronLeft className="size-3.5" />}
      {children}
      {!back && <ChevronRight className="size-3.5" />}
    </Link>
  );
}
