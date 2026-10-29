"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ExternalLink, Languages, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { savePolicyBodies, translatePolicyBody } from "./actions";
import { RichTextEditor } from "@/components/content-admin/RichTextEditor";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * The editor for the six legal pages.
 *
 * Each page edits one rich body. The box opens on what the page shows today —
 * the operator's saved override, or (when there is none) the current structured
 * content serialised to HTML — so editing starts from real copy, never a blank
 * box. Clearing a page back to its structured content removes the override, and
 * the page reverts to the structured prose.
 *
 * Same draft/save rhythm and look as `MessagePagesEditor`; the difference is the
 * surface (TipTap, one body per page) and that the "original" is the structured
 * content, not a catalogue string.
 */

const LOCALE_LABEL: Record<string, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };

type PolicyPage = {
  slug: string;
  title: string;
  path: string;
  override: string | null;
  current: string;
};

export function PolicyPagesEditor({
  locale,
  defaultLocale,
  pages,
}: {
  locale: string;
  defaultLocale: string;
  pages: PolicyPage[];
}) {
  // What each page shows today, and its structured fallback.
  const seed = useMemo(
    () => Object.fromEntries(pages.map((p) => [p.slug, p.override ?? p.current])) as Record<string, string>,
    [pages],
  );
  const current = useMemo(
    () => Object.fromEntries(pages.map((p) => [p.slug, p.current])) as Record<string, string>,
    [pages],
  );

  const [draft, setDraft] = useState<Record<string, string>>(seed);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const dirty = useMemo(() => pages.map((p) => p.slug).filter((s) => draft[s] !== seed[s]), [draft, seed, pages]);
  const canTranslate = locale !== defaultLocale;

  function set(slug: string, html: string) {
    setDraft((d) => ({ ...d, [slug]: html }));
  }

  function submit() {
    const data = new FormData();
    for (const slug of dirty) data.set(slug, draft[slug]!);
    start(async () => {
      const result = await savePolicyBodies(locale, data);
      if (result.ok) toast.success(`Αποθηκεύτηκαν ${result.saved} σελίδες.`);
      else result.errors.forEach((e) => toast.error(e));
    });
  }

  async function translateOne(slug: string) {
    setBusy((b) => ({ ...b, [slug]: true }));
    const r = await translatePolicyBody(slug, locale);
    setBusy((b) => ({ ...b, [slug]: false }));
    if (!r.ok) return toast.error(r.error);
    if (!r.value) return toast.message("Δεν υπάρχει ελληνικό κείμενο για μετάφραση.");
    set(slug, r.value);
    toast.success("Μεταφράστηκε.");
  }

  return (
    <div className="pb-28">
      <Accordion type="multiple" className="flex flex-col gap-3">
        {pages.map((page) => {
          const value = draft[page.slug] ?? "";
          const changed = value !== seed[page.slug];
          const overridden = value.trim() !== (current[page.slug] ?? "").trim();
          const id = `policy-${page.slug}`;

          return (
            <AccordionItem key={page.slug} value={page.slug}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  <span className="text-[length:var(--fs-13)] font-semibold text-k-ink">{page.title}</span>
                  {changed ? (
                    <Badge className="bg-k-ink text-white">αλλαγμένη</Badge>
                  ) : overridden ? (
                    <span className="text-[length:var(--fs-11)] text-k-text-4">τροποποιημένη</span>
                  ) : (
                    <span className="text-[length:var(--fs-11)] text-k-text-4">αρχικό περιεχόμενο</span>
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

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[length:var(--fs-11)] text-k-text-3">
                    {overridden && (
                      <button
                        type="button"
                        onClick={() => set(page.slug, current[page.slug] ?? "")}
                        className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline"
                      >
                        <RotateCcw className="size-3" aria-hidden />
                        επαναφορά αρχικού περιεχομένου
                      </button>
                    )}

                    {canTranslate && (
                      <button
                        type="button"
                        disabled={busy[page.slug]}
                        onClick={() => translateOne(page.slug)}
                        className="inline-flex items-center gap-1 text-k-text-3 underline-offset-2 hover:text-k-ink hover:underline disabled:opacity-50"
                      >
                        {busy[page.slug] ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Languages className="size-3" aria-hidden />
                        )}
                        Μετάφραση από {LOCALE_LABEL[defaultLocale] ?? defaultLocale}
                      </button>
                    )}
                  </div>
                </div>

                <RichTextEditor id={id} value={value} onChange={(html) => set(page.slug, html)} />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {dirty.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-k-line bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-[72rem] items-center justify-between gap-4 px-4 py-3 lg:px-8">
            <p className="text-[length:var(--fs-11-5)] text-k-text-2">
              {dirty.length === 1 ? "1 μη αποθηκευμένη σελίδα" : `${dirty.length} μη αποθηκευμένες σελίδες`}{" "}
              <span className="text-k-text-4">· {LOCALE_LABEL[locale] ?? locale}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setDraft(seed)} disabled={pending}>
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
