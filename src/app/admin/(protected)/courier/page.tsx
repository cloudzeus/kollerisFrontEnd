import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listPickupLists, listVouchers } from "@/lib/courier/acs";
import { PageShell } from "@/components/admin/PageShell";
import { CourierBoard } from "@/components/admin/CourierBoard";
import { DispatchQueue } from "@/components/admin/DispatchQueue";
import { listDispatchQueue } from "@/lib/courier/dispatch-queue";

export const dynamic = "force-dynamic";

/** Today in Athens — not the server's day, which is a different date for two
 *  hours every night and would show an empty board to anyone working late. */
function todayInAthens(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Admin screen — the ACS dispatch desk.
 *
 * A day at a time, because that is how a pickup list works: parcels are booked
 * against a date and the courier collects them once. The date is a query
 * parameter so a particular day is a link, and so yesterday's board survives a
 * refresh.
 */
export default async function CourierPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "orders");

  const { date: requested } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requested ?? "") ? requested! : todayInAthens();

  /*
   * Three reads, one wait. The queue comes from our own database and answers
   * even when ACS does not — which matters, because "ACS is down" and "nothing
   * to ship" must not look the same on this screen.
   */
  const [vouchers, lists, queue] = await Promise.all([
    listVouchers(date),
    listPickupLists(date),
    listDispatchQueue(),
  ]);

  // One failure is enough to explain the empty board; showing two copies of the
  // same "ACS is down" is noise.
  const error = !vouchers.ok ? vouchers.error : !lists.ok ? lists.error : null;

  const label = new Intl.DateTimeFormat("el-GR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Athens",
  }).format(new Date(`${date}T12:00:00Z`));

  return (
    <PageShell
      title="Αποστολές"
      description={`ACS · ${label}`}
      actions={
        <div className="flex items-center gap-1">
          <DateLink href={`/admin/courier?date=${shiftDate(date, -1)}`}>Προηγούμενη</DateLink>
          {date !== todayInAthens() && (
            <DateLink href="/admin/courier" primary>
              Σήμερα
            </DateLink>
          )}
          <DateLink href={`/admin/courier?date=${shiftDate(date, 1)}`}>Επόμενη</DateLink>
        </div>
      }
    >
      <DispatchQueue orders={queue} />
      <CourierBoard
        date={date}
        vouchers={vouchers.ok ? vouchers.data.vouchers : []}
        lists={lists.ok ? lists.data.lists : []}
        error={error}
      />
    </PageShell>
  );
}

function DateLink({
  href,
  children,
  primary,
}: {
  href: string;
  children: React.ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "border border-k-ink bg-k-ink px-2.5 py-1.5 text-[12px] text-white"
          : "border border-k-line bg-white px-2.5 py-1.5 text-[12px] text-k-text-2 transition-colors hover:border-k-line-2 hover:text-k-ink"
      }
    >
      {children}
    </Link>
  );
}
