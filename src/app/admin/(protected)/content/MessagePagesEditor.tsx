"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Languages, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { saveMessages, translateMessageField } from "./actions";
import type { EditableMessage } from "@/lib/content/messages";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

/**
 * The editor for pages whose copy lives in next-intl.
 *
 * A sibling of `ContentEditor`, same look and same draft/save rhythm, over a
 * different store: each field is a message path, saved as a `MessageOverride`.
 *
 *   - A field still showing the catalogue text is marked "original", and one
 *     button puts it back — clearing the edit deletes the row server-side.
 *   - On en/it, a per-field "translate from Greek" fills a draft from the Greek
 *     value. There is deliberately no per-page bulk translate here: the en/it
 *     catalogues are already human-translated, so a bulk fill would replace good
 *     copy with machine copy. Translation is opt-in, one field at a time.
 *
 * Pages start collapsed: some namespaces hold dozens of strings, and opening the
 * screen to a wall of inputs helps no one.
 */

const LOCALE_LABEL: Record<string, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };

/** The trailing path segment, humanised, as a field anchor. */
function labelFor(path: string): string {
  return (path.split(".").pop() ?? path).replace(/_/g, " ");
}

type MessagePage = { id: string; title: string; path: string; fields: EditableMessage[] };

export function MessagePagesEditor({
  locale,
  defaultLocale,
  pages,
}: {
  locale: string;
  defaultLocale: string;
  pages: MessagePage[];
}) {
  const fields = useMemo(() => pages.flatMap((p) => p.fields), [pages]);
  const baseline = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.path, f.value])) as Record<string, string>,
    [fields],
  );
  const catalogue = useMemo(
    () => Object.fromEntries(fields.map((f) => [f.path, f.base])) as Record<string, string>,
    [fields],
  );

  const [draft, setDraft] = useState<Record<string, string>>(baseline);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const dirty = useMemo(() => Object.keys(draft).filter((k) => draft[k] !== baseline[k]), [draft, baseline]);
  const canTranslate = locale !== defaultLocale;

  function set(path: string, value: string) {
    setDraft((d) => ({ ...d, [path]: value }));
  }

  function submit() {
    const data = new FormData();
    for (const path of dirty) data.set(path, draft[path]!);
    start(async () => {
      const result = await saveMessages(locale, data);
      if (result.ok) toast.success(`Αποθηκεύτηκαν ${result.saved} κείμενα.`);
      else result.errors.forEach((e) => toast.error(e));
    });
  }

  async function translateOne(path: string) {
    setBusy((b) => ({ ...b, [path]: true }));
    const r = await translateMessageField(path, locale);
    setBusy((b) => ({ ...b, [path]: false }));
    if (!r.ok) return toast.error(r.error);
    if (!r.value) return toast.message("Δεν υπάρχει ελληνικό κείμενο για μετάφραση.");
    set(path, r.value);
    toast.success("Μεταφράστηκε.");
  }

  return (
    <div className="pb-28">
      <Accordion type="multiple" className="flex flex-col gap-3">
        {pages.map((page) => {
          const changedCount = page.fields.filter((f) => (draft[f.path] ?? "") !== baseline[f.path]).length;

          return (
            <AccordionItem key={page.id} value={page.id}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <span className="text-[length:var(--fs-13)] font-semibold text-k-ink">{page.title}</span>
                  <span className="text-[length:var(--fs-11)] text-k-text-4">{page.fields.length} κείμενα</span>
                  {changedCount > 0 && (
                    <Badge className="bg-k-ink text-white">
                      {changedCount} {changedCount === 1 ? "αλλαγή" : "αλλαγές"}
                    </Badge>
                  )}
                </span>
              </AccordionTrigger>

              <AccordionContent>
                <div className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <Link
                    href={page.path}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 text-[length:var(--fs-11-5)] text-k-text-3 hover:text-k-ink"
                  >
                    Δείτε στη σελίδα
                    <ExternalLink className="size-3" aria-hidden />
                  </Link>
                </div>

                <div className="divide-y divide-k-line border-t border-k-line">
                  {page.fields.map((field) => {
                    const id = `m-${field.path.replace(/\./g, "-")}`;
                    const value = draft[field.path] ?? "";
                    const changed = value !== baseline[field.path];
                    const isOriginal = value.trim() === (catalogue[field.path] ?? "").trim();
                    const long = (catalogue[field.path] ?? "").length > 80;

                    return (
                      <div
                        key={field.path}
                        className="grid gap-2 py-5 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-8"
                      >
                        <div className="min-w-0">
                          <label htmlFor={id} className="block font-mono text-[length:var(--fs-11)] text-k-text-3 break-words">
                            {labelFor(field.path)}
                          </label>
                        </div>

                        <div className="min-w-0 space-y-1.5">
                          {long ? (
                            <textarea
                              id={id}
                              rows={3}
                              value={value}
                              onChange={(e) => set(field.path, e.target.value)}
                              className="w-full max-w-[40rem] border border-k-line-2 bg-white px-3 py-2 text-[length:var(--fs-13)] leading-[1.6] text-k-ink outline-none focus:border-k-ink"
                            />
                          ) : (
                            <Input
                              id={id}
                              value={value}
                              onChange={(e) => set(field.path, e.target.value)}
                              className="max-w-[40rem] text-[length:var(--fs-13)]"
                            />
                          )}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-11)] text-k-text-3">
                            {changed && <Badge className="bg-k-ink text-white">αλλαγμένο</Badge>}

                            {isOriginal ? (
                              <span className="text-k-text-4">αρχικό κείμενο</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => set(field.path, catalogue[field.path] ?? "")}
                                className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                              >
                                <RotateCcw className="size-3" aria-hidden />
                                επαναφορά αρχικού
                              </button>
                            )}

                            {canTranslate && (
                              <button
                                type="button"
                                disabled={busy[field.path]}
                                onClick={() => translateOne(field.path)}
                                className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline disabled:opacity-50"
                              >
                                {busy[field.path] ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Languages className="size-3" aria-hidden />
                                )}
                                Μετάφραση από {LOCALE_LABEL[defaultLocale] ?? defaultLocale}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-k-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <p className="text-[length:var(--fs-11-5)] text-k-text-2">
              {dirty.length === 1 ? "1 μη αποθηκευμένη αλλαγή" : `${dirty.length} μη αποθηκευμένες αλλαγές`}{" "}
              <span className="text-k-text-4">· {LOCALE_LABEL[locale] ?? locale}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setDraft(baseline)} disabled={pending}>
                Αναίρεση
              </Button>
              <Button onClick={submit} disabled={pending}>
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
