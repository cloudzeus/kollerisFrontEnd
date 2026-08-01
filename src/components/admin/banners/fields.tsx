"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { Check, ChevronsUpDown, Loader2, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  actionGenerateCopy,
  actionSearchOffers,
  actionSearchProducts,
  actionTranslate,
} from "@/app/admin/(protected)/banners/actions";
import type { LocalisedText, OfferView } from "@/lib/banners/contract";
import type { PickerProduct } from "@/lib/media/picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * The controls the cell editor is built from.
 *
 * Shared rather than private to one form: the same localised text field appears
 * on a heading, a badge and a button, and three copies of it would drift into
 * three different ideas of what "translate" means.
 */

/* ─────────────────────── Segmented control ─────────────────────── */

/**
 * A row of mutually exclusive choices.
 *
 * Preferred over a select whenever there are four or fewer options and the
 * choice affects what is on screen: a select hides the alternatives behind a
 * click, and in a visual editor the alternatives are the point.
 */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: React.ReactNode; title?: string }>;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      {label && <Label className="text-[11px] text-k-text-3">{label}</Label>}
      <div className="flex">
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            title={option.title}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 border border-l-0 px-1.5 py-1.5 text-[11.5px] transition-colors first:border-l",
              value === option.value
                ? "border-k-ink bg-k-ink text-white"
                : "border-k-line text-k-text-2 hover:border-k-ink hover:text-k-ink",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Number field ───────────────────────── */

/** A number with a unit, dragged or typed. Compact enough for four in a row. */
export function NumberField({
  value,
  onChange,
  label,
  min = -999,
  max = 999,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">{label}</span>
      <span className="relative block">
        <Input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const next = Number(e.target.value);
            onChange(Number.isFinite(next) ? Math.min(max, Math.max(min, next)) : 0);
          }}
          className="numeral h-8 pr-6 text-[12px]"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-k-text-4">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );
}

/* ──────────────────────── Localised text ──────────────────────── */

const LOCALES = [
  { code: "el", label: "Ελληνικά" },
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
] as const;

/**
 * One text in three languages.
 *
 * Greek is written; the other two are translated from it on demand, because
 * that is how this catalogue is actually maintained — nobody authors the
 * Italian first. DeepSeek writes the Greek option when the field is blank and
 * translates it afterwards, so the two buttons are one workflow at two stages
 * rather than two features.
 */
export function LocalisedField({
  label,
  value,
  onChange,
  maxChars = 120,
  multiline,
  context,
  hint,
}: {
  label: string;
  value: LocalisedText;
  onChange: (value: LocalisedText) => void;
  maxChars?: number;
  multiline?: boolean;
  context?: string;
  hint?: React.ReactNode;
}) {
  const [locale, setLocale] = useState<"el" | "en" | "it">("el");
  const [options, setOptions] = useState<string[]>([]);
  const [busy, start] = useTransition();

  const current = value[locale] ?? "";
  const Field = multiline ? Textarea : Input;

  function generate() {
    start(async () => {
      try {
        const result = await actionGenerateCopy({
          field: label,
          context: context || label,
          maxChars,
          locale: locale === "el" ? "Ελληνικά" : locale === "en" ? "English" : "Italiano",
        });
        if (result.length === 0) toast.info("Δεν επιστράφηκαν προτάσεις.");
        setOptions(result);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Η δημιουργία απέτυχε.");
      }
    });
  }

  function translate() {
    const source = value.el ?? "";
    if (!source.trim()) {
      toast.info("Γράψτε πρώτα το ελληνικό κείμενο.");
      return;
    }
    start(async () => {
      try {
        const result = await actionTranslate({
          text: source,
          from: "Ελληνικά",
          to: locale === "en" ? "English" : "Italiano",
          maxChars,
        });
        onChange({ ...value, [locale]: result });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Η μετάφραση απέτυχε.");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] text-k-text-3">{label}</Label>
        <div className="flex items-center gap-1">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              className={cn(
                "px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] transition-colors",
                locale === l.code
                  ? "bg-k-ink text-white"
                  : value[l.code]
                    ? "text-k-text-2 hover:text-k-ink"
                    : "text-k-text-5 hover:text-k-ink",
              )}
              title={l.label}
            >
              {l.code}
            </button>
          ))}
        </div>
      </div>

      <Field
        value={current}
        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
          onChange({ ...value, [locale]: e.target.value })
        }
        maxLength={maxChars}
        rows={multiline ? 3 : undefined}
        placeholder={locale === "el" ? "" : (value.el ?? "")}
        className="text-[12.5px]"
      />

      {hint}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="flex items-center gap-1 text-[10.5px] text-k-text-3 transition-colors hover:text-k-ink disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          Πρόταση
        </button>
        {locale !== "el" && (
          <button
            type="button"
            onClick={translate}
            disabled={busy}
            className="text-[10.5px] text-k-text-3 transition-colors hover:text-k-ink disabled:opacity-50"
          >
            Μετάφραση
          </button>
        )}
        <span className="numeral ml-auto text-[10px] text-k-text-5">
          {current.length}/{maxChars}
        </span>
      </div>

      {options.length > 0 && (
        <ul className="space-y-1 border border-k-line bg-k-surface-2 p-1.5">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  onChange({ ...value, [locale]: option });
                  setOptions([]);
                }}
                className="w-full px-2 py-1 text-left text-[11.5px] leading-[1.5] text-k-text-2 transition-colors hover:bg-white hover:text-k-ink"
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Entity pickers ───────────────────────── */

export function ProductCombo({
  value,
  onPick,
}: {
  value: string;
  onPick: (product: PickerProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PickerProduct[]>([]);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      start(async () => setItems(await actionSearchProducts(query, "el")));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border border-k-line-2 bg-white px-2.5 py-1.5 text-left text-[12px] transition-colors hover:border-k-ink"
        >
          <span className={cn("truncate", !value && "text-k-text-4")}>
            {value || "Επιλέξτε προϊόν…"}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-k-text-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-0">
        <div className="relative border-b border-k-line">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
          {loading && (
            <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-k-text-4" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Όνομα ή κωδικός…"
            className="w-full bg-transparent py-2.5 pl-8 pr-8 text-[13px] outline-none"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12px] text-k-text-3">
              {query.trim().length < 2 ? "Γράψτε δύο χαρακτήρες." : "Κανένα αποτέλεσμα."}
            </li>
          ) : (
            items.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-k-surface-2"
                >
                  {p.images[0] && (
                    <span className="relative size-7 shrink-0 border border-k-line bg-white">
                      <Image
                        src={p.images[0].url}
                        alt=""
                        fill
                        sizes="28px"
                        className="object-contain p-0.5"
                        unoptimized
                      />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-k-ink">{p.name}</span>
                    <span className="numeral block text-[10.5px] text-k-text-4">{p.code}</span>
                  </span>
                  {value === p.slug && <Check className="size-3.5 shrink-0 text-k-green" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function OfferPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (offer: OfferView) => void;
}) {
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [loading, start] = useTransition();

  useEffect(() => {
    start(async () => setOffers(await actionSearchOffers("")));
  }, []);

  if (loading && offers.length === 0) {
    return (
      <p className="flex items-center gap-2 py-2 text-[12px] text-k-text-3">
        <Loader2 className="size-3.5 animate-spin" />
        Φόρτωση…
      </p>
    );
  }

  if (offers.length === 0) {
    return (
      <p className="border border-dashed border-k-line px-3 py-3 text-[11.5px] leading-[1.6] text-k-text-3">
        Καμία ενεργή προσφορά. Δημιουργήστε μία στις Προσφορές.
      </p>
    );
  }

  return (
    <ul className="max-h-44 space-y-1 overflow-y-auto">
      {offers.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            onClick={() => onPick(o)}
            className={cn(
              "flex w-full items-center gap-2 border px-2 py-1.5 text-left transition-colors",
              value === o.slug ? "border-k-ink bg-k-surface-2" : "border-k-line hover:border-k-ink",
            )}
          >
            {o.image && (
              <span className="relative size-7 shrink-0 border border-k-line bg-white">
                <Image src={o.image} alt="" fill sizes="28px" className="object-contain p-0.5" unoptimized />
              </span>
            )}
            <span className="min-w-0 flex-1 truncate text-[12px] text-k-ink">{o.title}</span>
            {o.badge && (
              <span className="shrink-0 bg-k-red px-1 py-0.5 text-[9.5px] font-semibold text-white">
                {o.badge}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
