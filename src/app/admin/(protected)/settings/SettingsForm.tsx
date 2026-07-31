"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Lock, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { saveSettings } from "./actions";
import { SETTING_GROUPS, SETTINGS, type SettingView } from "@/lib/settings/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The settings form.
 *
 * Three conveniences that matter more than they look:
 *
 *   - Save is disabled until something actually changes, and the button says how
 *     many fields. Nobody should have to guess whether they edited anything.
 *   - A secret can be revealed WHILE TYPING. The stored one is never sent, but
 *     hiding what you are currently entering only causes typos in a value you
 *     cannot verify afterwards.
 *   - Leaving a secret blank keeps it, and the field says so. The opposite
 *     reading would cost someone their payment key.
 */

function initialValues(views: SettingView[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const def of SETTINGS) {
    const v = views.find((x) => x.key === def.key);
    map[def.key] = def.secret ? "" : (v?.value ?? "");
  }
  return map;
}

export function SettingsForm({ values }: { values: SettingView[] }) {
  const byKey = useMemo(() => new Map(values.map((v) => [v.key, v])), [values]);
  const baseline = useMemo(() => initialValues(values), [values]);
  const [draft, setDraft] = useState<Record<string, string>>(baseline);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [pending, start] = useTransition();

  const dirty = useMemo(
    () => Object.keys(draft).filter((k) => draft[k] !== baseline[k]),
    [draft, baseline],
  );

  function submit() {
    const data = new FormData();
    // Only what changed is sent, so an audit entry means something happened.
    for (const key of dirty) data.set(key, draft[key]);

    start(async () => {
      const result = await saveSettings(data);
      if (result.ok) {
        toast.success(
          result.saved === 1 ? "Η ρύθμιση αποθηκεύτηκε." : `${result.saved} ρυθμίσεις αποθηκεύτηκαν.`,
        );
        // The page revalidates; the saved values become the new baseline.
        setRevealed({});
      } else {
        for (const error of result.errors) toast.error(error);
      }
    });
  }

  return (
    <div className="space-y-12 pb-28">
      {SETTING_GROUPS.map((group) => {
        const defs = SETTINGS.filter((s) => s.group === group.id);
        if (!defs.length) return null;

        return (
          <section key={group.id} aria-labelledby={`grp-${group.id}`}>
            <div className="border-b border-k-line pb-3">
              <h2
                id={`grp-${group.id}`}
                className="text-[15px] font-semibold tracking-tight text-k-ink"
              >
                {group.title}
              </h2>
              <p className="mt-1 max-w-[70ch] text-[12.5px] leading-[1.6] text-k-text-3">
                {group.blurb}
              </p>
            </div>

            <div className="divide-y divide-k-line">
              {defs.map((def) => {
                const view = byKey.get(def.key);
                const id = `set-${def.key.replace(/\./g, "-")}`;
                const changed = draft[def.key] !== baseline[def.key];
                const show = revealed[def.key] === true;

                return (
                  <div
                    key={def.key}
                    className="grid gap-2 py-5 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:gap-8"
                  >
                    <div className="min-w-0">
                      <Label htmlFor={id} className="text-[13px] text-k-ink">
                        {def.label}
                        {def.secret && (
                          <Lock className="ml-1.5 inline size-3 text-k-text-4" aria-hidden />
                        )}
                      </Label>
                      {def.help && (
                        <p className="mt-1 text-[11.5px] leading-[1.55] text-k-text-3">
                          {def.help}
                        </p>
                      )}
                    </div>

                    <div className="min-w-0 max-w-[28rem]">
                      {def.kind === "select" ? (
                        <Select
                          value={draft[def.key] || undefined}
                          onValueChange={(v) => setDraft((d) => ({ ...d, [def.key]: v }))}
                        >
                          <SelectTrigger id={id} className="w-full">
                            <SelectValue placeholder="Επιλέξτε…" />
                          </SelectTrigger>
                          <SelectContent>
                            {def.options?.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="relative">
                          <Input
                            id={id}
                            type={def.secret && !show ? "password" : "text"}
                            inputMode={def.kind === "number" ? "decimal" : undefined}
                            autoComplete="off"
                            spellCheck={false}
                            value={draft[def.key]}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, [def.key]: e.target.value }))
                            }
                            placeholder={
                              def.secret
                                ? view?.hint
                                  ? `${view.hint} — κενό = αμετάβλητο`
                                  : "δεν έχει οριστεί"
                                : def.placeholder
                            }
                            className={def.secret ? "pr-10 font-mono text-[12.5px]" : "font-mono text-[12.5px]"}
                          />
                          {def.secret && (
                            <button
                              type="button"
                              onClick={() =>
                                setRevealed((r) => ({ ...r, [def.key]: !r[def.key] }))
                              }
                              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-k-text-4 transition-colors hover:text-k-ink"
                              aria-label={show ? "Απόκρυψη" : "Εμφάνιση"}
                              tabIndex={-1}
                            >
                              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                          )}
                        </div>
                      )}

                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-k-text-3">
                        {changed && (
                          <Badge className="bg-k-ink text-white">αλλαγμένο</Badge>
                        )}
                        {view?.fromEnv ? (
                          <span className="inline-flex items-center gap-1 text-k-amber">
                            <TriangleAlert className="size-3" aria-hidden />
                            από το περιβάλλον
                          </span>
                        ) : view?.updatedAt ? (
                          <span>
                            {new Intl.DateTimeFormat("el-GR", {
                              dateStyle: "short",
                              timeStyle: "short",
                              timeZone: "Europe/Athens",
                            }).format(new Date(view.updatedAt))}
                            {view.updatedBy ? ` · ${view.updatedBy}` : ""}
                          </span>
                        ) : (
                          <span>δεν έχει οριστεί</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Only appears when there is something to save — a permanently visible
          disabled bar is noise on a page people mostly come to read. */}
      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-k-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[62rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <p className="text-[12.5px] text-k-text-2">
              {dirty.length === 1
                ? "1 μη αποθηκευμένη αλλαγή"
                : `${dirty.length} μη αποθηκευμένες αλλαγές`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setDraft(baseline)}
                disabled={pending}
                className="text-[13px]"
              >
                Αναίρεση
              </Button>
              <Button onClick={submit} disabled={pending} className="text-[13px]">
                {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                Αποθήκευση
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
