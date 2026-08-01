import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { CUSTOMER_FILTERS, getCustomers, type CustomerFilter } from "@/lib/admin/customers";
import { PageShell } from "@/components/admin/PageShell";
import { CompanyList } from "@/components/admin/CompanyList";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeZone: "Europe/Athens",
});

/**
 * Admin screen — customers.
 *
 * Opens on "Προς έγκριση", because that is the only tab with a decision waiting
 * in it. Individuals are a list to look things up in, not a queue, and they sit
 * behind their own tab so three pending applications are never buried inside a
 * thousand shoppers.
 */
export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "customers");

  const params = await searchParams;
  const filter = (CUSTOMER_FILTERS.some((f) => f.id === params.filter)
    ? params.filter
    : "pending") as CustomerFilter;

  const data = await getCustomers(filter);

  return (
    <PageShell
      title="Πελάτες"
      description={
        data.counts.pending === 0
          ? "Καμία αίτηση σε αναμονή."
          : `${data.counts.pending} ${
              data.counts.pending === 1 ? "αίτηση B2B περιμένει" : "αιτήσεις B2B περιμένουν"
            } έγκριση`
      }
    >
      <div className="space-y-4">
        <nav className="flex flex-wrap items-center gap-1" aria-label="Φίλτρα">
          {CUSTOMER_FILTERS.map((f) => {
            const count = data.counts[f.id];
            const active = f.id === filter;
            return (
              <Link
                key={f.id}
                href={f.id === "pending" ? "/admin/customers" : `/admin/customers?filter=${f.id}`}
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
                      : count > 0 && f.id === "pending"
                        ? "text-k-amber"
                        : "text-k-text-4",
                  )}
                >
                  {count}
                </span>
              </Link>
            );
          })}
        </nav>

        {filter === "individuals" ? (
          <IndividualTable rows={data.individuals} />
        ) : (
          <>
            <CompanyList companies={data.companies} />
            {filter === "all" && data.individuals.length > 0 && (
              <>
                <h2 className="pt-2 text-[13px] font-semibold tracking-tight text-k-ink">Ιδιώτες</h2>
                <IndividualTable rows={data.individuals} />
              </>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

function IndividualTable({
  rows,
}: {
  rows: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    status: string;
    createdAt: Date;
    orders: number;
  }>;
}) {
  if (rows.length === 0) {
    return (
      <p className="border border-k-line bg-white px-4 py-14 text-center text-[13px] text-k-text-3">
        Κανένας ιδιώτης πελάτης ακόμη.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border border-k-line bg-white">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-k-line text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
            <th className="px-3 py-2 font-medium">Όνομα</th>
            <th className="px-3 py-2 font-medium">Επικοινωνία</th>
            <th className="px-3 py-2 text-right font-medium">Παραγγελίες</th>
            <th className="px-3 py-2 font-medium">Εγγραφή</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-k-line last:border-0">
              <td className="px-3 py-2.5 text-[12.5px] text-k-ink">{r.name || "—"}</td>
              <td className="px-3 py-2.5 text-[12.5px] text-k-text-2">
                <a href={`mailto:${r.email}`} className="underline-offset-2 hover:underline">
                  {r.email}
                </a>
                {r.phone && <span className="numeral block text-[11px] text-k-text-4">{r.phone}</span>}
              </td>
              <td className="numeral px-3 py-2.5 text-right text-[12.5px] text-k-ink">{r.orders}</td>
              <td className="numeral px-3 py-2.5 text-[11.5px] text-k-text-4">
                {dt.format(r.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
