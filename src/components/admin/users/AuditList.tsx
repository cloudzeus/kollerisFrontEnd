import type { AdminAuditRow } from "@/lib/admin/users-types";

const dt = new Intl.DateTimeFormat("el-GR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Athens",
});

/** Who changed which account or role, newest first. */
export function AuditList({
  rows,
  empty = "Καμία αλλαγή ακόμη.",
}: {
  rows: AdminAuditRow[];
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-[12.5px] text-k-text-3">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-k-line">
      {rows.map((r) => (
        <li key={r.id} className="grid gap-x-4 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[9.5rem_10rem_1fr]">
          <span className="numeral text-[11.5px] text-k-text-4">{dt.format(r.createdAt)}</span>
          <span className="text-[12.5px] font-medium text-k-ink">{r.action}</span>
          <span className="min-w-0 text-[12.5px] text-k-text-2">
            <span className="break-words">{r.summary}</span>
            {r.actor && <span className="block text-[11px] text-k-text-4">από {r.actor}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
