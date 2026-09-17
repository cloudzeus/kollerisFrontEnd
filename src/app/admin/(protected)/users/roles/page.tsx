import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { getRoleMatrix } from "@/lib/admin/roles";
import { recentUserAudit } from "@/lib/admin/users";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { AuditList } from "@/components/admin/users/AuditList";
import { RoleMatrix } from "@/components/admin/users/RoleMatrix";

export const dynamic = "force-dynamic";

/**
 * Admin screen — what each role may open.
 *
 * The roles themselves are fixed; their sections are not. A section a role
 * loses disappears from its menu and its pages and actions refuse the request
 * on the next click — `assertCan` reads the same matrix this screen writes.
 */
export default async function RolesPage() {
  const session = await auth();
  assertCan(session?.user.role, "users");

  const [matrix, auditRows] = await Promise.all([getRoleMatrix(), recentUserAudit(40)]);

  return (
    <PageShell
      title="Ρόλοι & δικαιώματα"
      description="Ποιες ενότητες του admin ανοίγει κάθε ρόλος. Ο Διαχειριστής έχει πάντα τα πάντα."
      actions={
        <Link
          href="/admin/users"
          className="flex h-9 items-center border border-k-line bg-white px-3 text-[12.5px] text-k-text-2 transition-colors hover:border-k-line-2 hover:text-k-ink"
        >
          Χρήστες
        </Link>
      }
    >
      <div className="space-y-6">
        <RoleMatrix rows={matrix} />
        <Panel title="Ιστορικό δικαιωμάτων" bodyClassName="">
          <AuditList rows={auditRows.filter((r) => r.code === "role.update")} empty="Τα δικαιώματα δεν έχουν αλλάξει ποτέ — ισχύουν τα προεπιλεγμένα." />
        </Panel>
      </div>
    </PageShell>
  );
}
