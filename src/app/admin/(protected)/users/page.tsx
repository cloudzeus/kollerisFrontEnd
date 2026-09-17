import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listAdminUsers, recentUserAudit } from "@/lib/admin/users";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { AuditList } from "@/components/admin/users/AuditList";
import { CreateUserButton } from "@/components/admin/users/CreateUserButton";
import { UsersTable } from "@/components/admin/users/UsersTable";

export const dynamic = "force-dynamic";

/**
 * Admin screen — the people who can sign in to /admin.
 *
 * Deactivation rather than deletion: an operator who leaves still authored
 * every audit entry they wrote, and "who approved this company" should keep an
 * answer after they are gone.
 */
export default async function UsersPage() {
  const session = await auth();
  assertCan(session?.user.role, "users");

  const [users, auditRows] = await Promise.all([listAdminUsers(session.user.id), recentUserAudit()]);
  const active = users.filter((u) => u.isActive);
  const admins = active.filter((u) => u.role === "ADMIN").length;
  const locked = users.filter((u) => u.locked).length;

  return (
    <PageShell
      title="Χρήστες"
      description={`${active.length} ${active.length === 1 ? "ενεργός" : "ενεργοί"} · ${admins} ${
        admins === 1 ? "διαχειριστής" : "διαχειριστές"
      }${locked ? ` · ${locked} ${locked === 1 ? "κλειδωμένος" : "κλειδωμένοι"}` : ""}`}
      actions={
        <>
          <Link
            href="/admin/users/roles"
            className="flex h-9 items-center gap-1.5 border border-k-line bg-white px-3 text-[12.5px] text-k-text-2 transition-colors hover:border-k-line-2 hover:text-k-ink"
          >
            <ShieldCheck className="size-3.5" aria-hidden />
            Ρόλοι & δικαιώματα
          </Link>
          <CreateUserButton />
        </>
      }
    >
      <div className="space-y-6">
        <UsersTable users={users} />
        <Panel
          title="Πρόσφατες αλλαγές"
          description="Χρήστες και δικαιώματα. Οι κωδικοί δεν καταγράφονται ποτέ."
          bodyClassName=""
        >
          <AuditList rows={auditRows} />
        </Panel>
      </div>
    </PageShell>
  );
}
