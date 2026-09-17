"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { AdminRole } from "@/generated/prisma/enums";
import { actionSaveRoles } from "@/app/admin/(protected)/users/actions";
import type { RoleMatrixRow } from "@/lib/admin/roles";
import {
  ADMIN_ONLY_CAPABILITIES,
  CAPABILITIES,
  CAPABILITY_META,
  DEFAULT_ROLE_CAPABILITIES,
  ROLE_META,
  type Capability,
} from "@/lib/rbac";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

const dt = new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeZone: "Europe/Athens" });

type Draft = Record<AdminRole, Set<Capability>>;

function toDraft(rows: RoleMatrixRow[]): Draft {
  return Object.fromEntries(rows.map((r) => [r.role, new Set(r.capabilities)])) as Draft;
}

function sameSet(a: ReadonlySet<Capability>, b: readonly Capability[]) {
  return a.size === b.length && b.every((c) => a.has(c));
}

/**
 * Sections × roles.
 *
 * One save for the whole grid, with the count of changed cells on the button,
 * because a role is usually reshaped in several ticks and half-saved states
 * would briefly show an operator a menu nobody intended.
 */
export function RoleMatrix({ rows }: { rows: RoleMatrixRow[] }) {
  const baseline = useMemo(() => toDraft(rows), [rows]);
  const [draft, setDraft] = useState<Draft>(baseline);
  const [pending, start] = useTransition();

  const changes = rows.reduce(
    (n, r) => n + CAPABILITIES.filter((c) => baseline[r.role].has(c) !== draft[r.role].has(c)).length,
    0,
  );

  function toggle(role: AdminRole, capability: Capability, on: boolean) {
    setDraft((d) => {
      const next = new Set(d[role]);
      if (on) next.add(capability);
      else next.delete(capability);
      return { ...d, [role]: next };
    });
  }

  function resetRole(role: AdminRole) {
    setDraft((d) => ({ ...d, [role]: new Set(DEFAULT_ROLE_CAPABILITIES[role]) }));
  }

  function save() {
    start(async () => {
      const result = await actionSaveRoles({
        EDITOR: [...draft.EDITOR],
        OPS: [...draft.OPS],
      });
      if (result.ok) toast.success(result.message ?? "Αποθηκεύτηκε.");
      else toast.error(result.error);
    });
  }

  return (
    <section className="border border-k-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-k-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight text-k-ink">Δικαιώματα ανά ρόλο</h2>
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-k-text-3">
            Μια ενότητα που αφαιρείται κρύβεται από το μενού και οι σελίδες της αρνούνται την πρόσβαση
            από το επόμενο κλικ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {changes > 0 && (
            <Button variant="outline" onClick={() => setDraft(baseline)} disabled={pending}>
              Αναίρεση
            </Button>
          )}
          <Button onClick={save} disabled={pending || changes === 0}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {changes === 0 ? "Αποθήκευση" : `Αποθήκευση (${changes})`}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr className="border-b border-k-line align-bottom">
              <th className="px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.06em] text-k-text-4">
                Ενότητα
              </th>
              {rows.map((r) => {
                const isDefault = sameSet(draft[r.role], DEFAULT_ROLE_CAPABILITIES[r.role]);
                return (
                  <th key={r.role} className="w-44 px-3 py-3 text-center font-normal">
                    <p className="text-[12.5px] font-semibold text-k-ink">{ROLE_META[r.role].label}</p>
                    <p className="numeral text-[11px] text-k-text-4">
                      {r.activeUsers} {r.activeUsers === 1 ? "χρήστης" : "χρήστες"}
                      {r.inactiveUsers > 0 && ` · ${r.inactiveUsers} ανενεργοί`}
                    </p>
                    {r.role === "ADMIN" ? (
                      <p className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-k-text-4">
                        <Lock className="size-3" aria-hidden />
                        σταθερός
                      </p>
                    ) : isDefault ? (
                      <p className="mt-1 text-[10.5px] text-k-text-4">προεπιλογή</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => resetRole(r.role)}
                        className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-k-amber hover:text-k-ink"
                        title={
                          r.updatedAt
                            ? `Αλλαγή ${dt.format(r.updatedAt)}${r.updatedBy ? ` από ${r.updatedBy}` : ""}`
                            : undefined
                        }
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        προσαρμοσμένος · επαναφορά
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((capability) => {
              const adminOnly = ADMIN_ONLY_CAPABILITIES.includes(capability);
              return (
                <tr key={capability} className="border-b border-k-line last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="text-[12.5px] text-k-ink">{CAPABILITY_META[capability].label}</p>
                    <p className="text-[11.5px] leading-[1.45] text-k-text-4">
                      {CAPABILITY_META[capability].description}
                    </p>
                  </td>
                  {rows.map((r) => {
                    const locked = r.role === "ADMIN" || adminOnly;
                    const checked = r.role === "ADMIN" || draft[r.role].has(capability);
                    const changed = !locked && baseline[r.role].has(capability) !== checked;
                    const id = `cap-${r.role}-${capability}`;
                    return (
                      <td key={r.role} className={cn("px-3 py-2.5 text-center", changed && "bg-k-gold-tint")}>
                        <label htmlFor={id} className="inline-flex size-11 cursor-pointer items-center justify-center">
                          <Checkbox
                            id={id}
                            checked={checked}
                            disabled={locked || pending}
                            onCheckedChange={(v) => toggle(r.role, capability, v === true)}
                            aria-label={`${CAPABILITY_META[capability].label} για ${ROLE_META[r.role].label}`}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
