import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { INBOX_FILTERS, getInbox, type InboxFilter } from "@/lib/admin/inbox";
import { PageShell } from "@/components/admin/PageShell";
import { Inbox } from "@/components/admin/Inbox";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Admin screen — the contact inbox.
 *
 * Opens on "Νέα" rather than everything: this is a queue, and the reason to
 * come here is that somebody is waiting. The archive is one click away and is
 * nobody's morning.
 */
export default async function EngagementPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "engagement");

  const params = await searchParams;
  const filter = (INBOX_FILTERS.some((f) => f.id === params.filter)
    ? params.filter
    : "new") as InboxFilter;

  const data = await getInbox(filter);
  const oldest = data.messages.find((m) => m.status === "new" || m.status === "inProgress");

  return (
    <PageShell
      title="Επικοινωνία"
      description={
        data.counts.new === 0
          ? "Κανένα αναπάντητο μήνυμα."
          : `${data.counts.new} ${data.counts.new === 1 ? "μήνυμα περιμένει" : "μηνύματα περιμένουν"}${
              oldest && oldest.waitingHours >= 24
                ? ` · το παλαιότερο ${Math.floor(oldest.waitingHours / 24)} ημέρες`
                : ""
            }`
      }
    >
      <div className="space-y-4">
        <nav className="flex flex-wrap items-center gap-1" aria-label="Φίλτρα">
          {INBOX_FILTERS.map((f) => {
            const count = data.counts[f.id];
            const active = f.id === filter;
            return (
              <Link
                key={f.id}
                href={f.id === "new" ? "/admin/engagement" : `/admin/engagement?filter=${f.id}`}
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
                      : count > 0 && f.id === "new"
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

        <Inbox messages={data.messages} />
      </div>
    </PageShell>
  );
}
