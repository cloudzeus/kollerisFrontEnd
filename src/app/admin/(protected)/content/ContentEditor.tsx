"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Languages, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { saveContent, translateField, translatePage } from "./actions";
import { CONTENT, PAGES, type ContentView } from "@/lib/content/registry";
import { RichTextEditor } from "@/components/content-admin/RichTextEditor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

/**
 * The copy editor.
 *
 * One accordion per page; inside, the page's blocks grouped by section, each
 * rendered by its kind (rich text gets the TipTap editor). What it adds over a
 * plain form:
 *
 *   - Says which blocks still show the original text and restores one with a
 *     single button — editing copy is reversible, and "undo" should not mean
 *     "retype what it used to say".
 *   - On the English/Italian tabs, fills a field (or a whole page) from Greek
 *     via OpenRouter. The result is an unsaved draft you review before saving —
 *     nobody discovers a machine translation live.
 *   - Counts characters against the length the layout was designed for. Advice,
 *     not a limit.
 */

const LOCALE_LABEL: Record<string, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };
const TRANSLATABLE = new Set(["text", "long", "rich"]);

export function ContentEditor({
  locale,
  locales,
  defaultLocale,
  values,
}: {
  locale: string;
  locales: readonly string[];
  defaultLocale: string;
  values: ContentView[];
}) {
  const baseline = useMemo(
    () => Object.fromEntries(values.map((v) => [v.key, v.value])) as Record<string, string>,
    [values],
  );
  const fallbackOf = useMemo(
    () => Object.fromEntries(CONTENT.map((c) => [c.key, c.fallback])) as Record<string, string>,
    [],
  );
  const [draft, setDraft] = useState<Record<string, string>>(baseline);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const dirty = useMemo(() => Object.keys(draft).filter((k) => draft[k] !== baseline[k]), [draft, baseline]);

  const pages = useMemo(
    () =>
      [...PAGES]
        .sort((a, b) => a.order - b.order)
        .map((p) => ({ ...p, defs: CONTENT.filter((c) => c.page === p.id) }))
        .filter((p) => p.defs.length),
    [],
  );

  const canTranslate = locale !== defaultLocale;

  function set(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function submit() {
    const data = new FormData();
    for (const key of dirty) data.set(key, draft[key]!);
    start(async () => {
      const result = await saveContent(locale, data);
      if (result.ok) toast.success(`Αποθηκεύτηκαν ${result.saved} κείμενα.`);
      else result.errors.forEach((e) => toast.error(e));
    });
  }

  async function translateOne(key: string) {
    setBusy((b) => ({ ...b, [key]: true }));
    const r = await translateField(key, locale);
    setBusy((b) => ({ ...b, [key]: false }));
    if (!r.ok) return toast.error(r.error);
    if (!r.value) return toast.message("Δεν υπάρχει ελληνικό κείμενο για μετάφραση.");
    set(key, r.value);
    toast.success("Μεταφράστηκε.");
  }

  async function translateWholePage(pageId: string) {
    const bk = `page:${pageId}`;
    setBusy((b) => ({ ...b, [bk]: true }));
    const r = await translatePage(pageId, locale);
    setBusy((b) => ({ ...b, [bk]: false }));
    if (!r.ok) return toast.error(r.error);
    const n = Object.keys(r.values).length;
    if (!n) return toast.message("Δεν υπήρχαν πεδία για μετάφραση.");
    setDraft((d) => ({ ...d, ...r.values }));
    toast.success(`Μεταφράστηκαν ${n} ${n === 1 ? "πεδίο" : "πεδία"}.`);
  }

  return (
    <div className="pb-28">
      {/* Language switch — a tab strip rather than a dropdown: with three locales,
          seeing which exist matters more than saving the space. */}
      <div className="flex items-center gap-1 border-b border-k-line">
        {locales.map((l) => (
          <Link
            key={l}
            href={`/admin/content?locale=${l}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[length:var(--fs-13)] transition-colors ${
              l === locale
                ? "border-k-ink font-medium text-k-ink"
                : "border-transparent text-k-text-3 hover:text-k-ink"
            }`}
          >
            {LOCALE_LABEL[l] ?? l}
          </Link>
        ))}
        <Link
          href="/"
          target="_blank"
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 text-[length:var(--fs-11-5)] text-k-text-3 hover:text-k-ink"
        >
          Δείτε το κατάστημα
          <ExternalLink className="size-3" aria-hidden />
        </Link>
      </div>

      <Accordion
        type="multiple"
        defaultValue={pages[0] ? [pages[0].id] : []}
        className="mt-6 flex flex-col gap-3"
      >
        {pages.map((page) => {
          const sections = [...new Set(page.defs.map((d) => d.section))];
          const changedCount = page.defs.filter((d) => (draft[d.key] ?? "") !== baseline[d.key]).length;

          return (
            <AccordionItem key={page.id} value={page.id}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <span className="text-[length:var(--fs-13)] font-semibold text-k-ink">{page.title}</span>
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
                  {canTranslate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy[`page:${page.id}`]}
                      onClick={() => translateWholePage(page.id)}
                    >
                      {busy[`page:${page.id}`] ? (
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                      ) : (
                        <Languages className="mr-1.5 size-3.5" />
                      )}
                      Συμπλήρωση μεταφράσεων
                    </Button>
                  )}
                </div>

                {sections.map((sec) => (
                  <div key={sec} className="divide-y divide-k-line border-t border-k-line">
                    {page.defs
                      .filter((d) => d.section === sec)
                      .map((def) => {
                        const view = values.find((v) => v.key === def.key);
                        const id = `c-${def.key.replace(/\./g, "-")}`;
                        const value = draft[def.key] ?? "";
                        const changed = value !== baseline[def.key];
                        const isOriginal = value.trim() === (fallbackOf[def.key] ?? "").trim();
                        const over = def.maxChars ? value.length - def.maxChars : 0;
                        const translatable = canTranslate && TRANSLATABLE.has(def.kind);

                        return (
                          <div
                            key={def.key}
                            className="grid gap-2 py-5 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] md:gap-8"
                          >
                            <div className="min-w-0">
                              <Label htmlFor={id} className="text-[length:var(--fs-13)] text-k-ink">
                                {def.label}
                              </Label>
                              <p className="mt-1 text-[length:var(--fs-11-5)] leading-[1.55] text-k-text-3">
                                {def.where}
                              </p>
                            </div>

                            <div className="min-w-0 space-y-1.5">
                              {def.kind === "rich" ? (
                                <RichTextEditor id={id} value={value} onChange={(html) => set(def.key, html)} />
                              ) : def.kind === "long" ? (
                                <textarea
                                  id={id}
                                  rows={3}
                                  value={value}
                                  onChange={(e) => set(def.key, e.target.value)}
                                  className="w-full max-w-[40rem] border border-k-line-2 bg-white px-3 py-2 text-[length:var(--fs-13)] leading-[1.6] text-k-ink outline-none focus:border-k-ink"
                                />
                              ) : (
                                <Input
                                  id={id}
                                  value={value}
                                  placeholder={def.kind === "image" ? "/images/… ή https://…" : undefined}
                                  onChange={(e) => set(def.key, e.target.value)}
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
                                    onClick={() => set(def.key, fallbackOf[def.key] ?? "")}
                                    className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                                  >
                                    <RotateCcw className="size-3" aria-hidden />
                                    επαναφορά αρχικού
                                  </button>
                                )}

                                {translatable && (
                                  <button
                                    type="button"
                                    disabled={busy[def.key]}
                                    onClick={() => translateOne(def.key)}
                                    className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline disabled:opacity-50"
                                  >
                                    {busy[def.key] ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Languages className="size-3" aria-hidden />
                                    )}
                                    Μετάφραση από {LOCALE_LABEL[defaultLocale] ?? defaultLocale}
                                  </button>
                                )}

                                {def.maxChars && def.kind !== "rich" && (
                                  <span className={over > 0 ? "text-k-amber" : "text-k-text-4"}>
                                    {value.length}/{def.maxChars}
                                    {over > 0 ? " — μπορεί να μη χωρέσει" : ""}
                                  </span>
                                )}

                                {view?.updatedAt && !changed && (
                                  <span className="text-k-text-4">
                                    {new Intl.DateTimeFormat("el-GR", {
                                      dateStyle: "short",
                                      timeStyle: "short",
                                      timeZone: "Europe/Athens",
                                    }).format(new Date(view.updatedAt))}
                                    {view.updatedBy ? ` · ${view.updatedBy}` : ""}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
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
