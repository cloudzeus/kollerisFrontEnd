"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Languages, Loader2, Search, Sparkles } from "lucide-react";
import {
  actionGenerateCopy,
  actionSearchCategories,
  actionSearchProducts,
  actionTranslate,
} from "@/app/admin/(protected)/zones/actions";
import type { PickerCategory, PickerProduct } from "@/lib/media/picker";
import { BADGE_PRESETS, DYNAMIC_TOKENS, fieldsFor, type WidgetField } from "@/lib/zones/registry";
import { cn } from "@/lib/utils";
import { MediaField } from "@/components/admin/MediaPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * The form for one widget, generated from its field list.
 *
 * Each kind gets the control that fits the job rather than a text box with a
 * different label: a flag is a switch, a fixed set is a select, a paragraph is a
 * textarea, a product is a searchable combobox, an image is the picker. A form
 * where everything is an `<input type=text>` is how you get people typing slugs
 * from memory.
 *
 * Localised fields render one tab per language with the Greek tab first, and
 * mark which languages already have text — a translator should be able to see
 * what is left without opening each one.
 */

const LOCALES = ["el", "en", "it"] as const;
const LOCALE_LABEL: Record<string, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };

export type Props = Record<string, unknown>;

export function WidgetForm({
  type,
  value,
  onChange,
}: {
  type: string;
  value: Props;
  onChange: (next: Props) => void;
}) {
  const fields = fieldsFor(type);
  const set = (name: string, v: unknown) => onChange({ ...value, [name]: v });

  // The background group is collapsed behind its own heading: it is the same
  // five fields on every widget and would otherwise bury the ones that differ.
  const own = fields.filter(
    (f) => !f.name.startsWith("bg") && !f.name.startsWith("badge") && !f.name.startsWith("animation"),
  );
  const badge = fields.filter((f) => f.name.startsWith("badge"));
  const animation = fields.filter((f) => f.name.startsWith("animation"));
  const background = fields.filter((f) => f.name.startsWith("bg"));
  const bgKind = typeof value.bgKind === "string" ? value.bgKind : "none";

  return (
    <div className="space-y-5">
      {own.map((field) => (
        <Field key={field.name} field={field} value={value[field.name]} onChange={(v) => set(field.name, v)} />
      ))}

      <Group title="Σήμανση">
        {badge.map((field) => (
          <Field key={field.name} field={field} value={value[field.name]} onChange={(v) => set(field.name, v)} />
        ))}
      </Group>

      <Group title="Κίνηση">
        {animation.map((field) => (
          <Field key={field.name} field={field} value={value[field.name]} onChange={(v) => set(field.name, v)} />
        ))}
      </Group>

      <div className="border-t border-k-line pt-5">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
          Φόντο
        </p>
        <div className="space-y-5">
          {background
            // Only the fields the chosen background actually uses. Showing a
            // video field on an image background is a question nobody asked.
            .filter((f) => {
              if (f.name === "bgKind") return true;
              if (bgKind === "none") return false;
              if (bgKind === "image") return f.name === "bgImage" || f.name === "bgOverlay";
              return f.name !== "bgImage";
            })
            .map((field) => (
              <Field
                key={field.name}
                field={field}
                value={value[field.name]}
                onChange={(v) => set(field.name, v)}
              />
            ))}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-k-line pt-5">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
        {title}
      </p>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: WidgetField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `f-${field.name}`;

  if (field.kind === "boolean") {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Label htmlFor={id} className="text-[13px] text-k-ink">
            {field.label}
          </Label>
          {field.help && <p className="mt-0.5 text-[11.5px] text-k-text-3">{field.help}</p>}
        </div>
        <Switch id={id} checked={value === true} onCheckedChange={onChange} />
      </div>
    );
  }

  return (
    <div>
      <Label htmlFor={id} className="text-[13px] text-k-ink">
        {field.label}
        {field.required && <span className="ml-1 text-k-red">*</span>}
      </Label>
      {field.help && <p className="mt-0.5 text-[11.5px] leading-[1.5] text-k-text-3">{field.help}</p>}

      <div className="mt-1.5">
        {field.kind === "select" ? (
          <Select value={(value as string) || undefined} onValueChange={onChange}>
            <SelectTrigger id={id}>
              <SelectValue placeholder="Επιλέξτε…" />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : field.kind === "image" || field.kind === "video" ? (
          <MediaField
            value={(value as string) ?? ""}
            onChange={onChange}
            accept={field.kind}
            label={field.label}
          />
        ) : field.kind === "badge" ? (
          <BadgePicker value={(value as string) ?? ""} onChange={onChange} />
        ) : field.kind === "product" ? (
          <EntityCombo kind="product" value={(value as string) ?? ""} onChange={onChange} />
        ) : field.kind === "category" ? (
          <EntityCombo kind="category" value={(value as string) ?? ""} onChange={onChange} />
        ) : field.localised ? (
          <LocalisedField field={field} value={value} onChange={onChange} />
        ) : field.kind === "long" ? (
          <Textarea
            id={id}
            rows={3}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="text-[13px]"
          />
        ) : (
          <Input
            id={id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={cn("text-[13px]", field.kind === "link" && "font-mono text-[12.5px]")}
            placeholder={field.kind === "link" ? "/katalogos" : undefined}
          />
        )}
      </div>
    </div>
  );
}

/** Text in three languages, one tab each, with a dot on the ones already filled. */
function LocalisedField({
  field,
  value,
  onChange,
}: {
  field: WidgetField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const map = (value && typeof value === "object" ? value : {}) as Record<string, string>;
  const [active, setActive] = useState<string>("el");
  const [options, setOptions] = useState<string[]>([]);
  const [busy, start] = useTransition();
  const current = map[active] ?? "";
  const over = field.maxChars ? current.length - field.maxChars : 0;

  function suggest() {
    start(async () => {
      const result = await actionGenerateCopy({
        field: field.label,
        // Whatever is already typed is the brief. An empty field still works —
        // it just produces shop-level copy rather than copy about this tile.
        context: current || map.el || "",
        maxChars: field.maxChars,
        locale: active,
      });
      if (result.ok) setOptions(result.options);
      else toast.error(result.error);
    });
  }

  function translate() {
    const source = map.el?.trim();
    if (!source) {
      toast.error("Γράψτε πρώτα το ελληνικό κείμενο.");
      return;
    }
    start(async () => {
      const result = await actionTranslate({
        text: source,
        from: "el",
        to: active,
        maxChars: field.maxChars,
      });
      if (result.ok) onChange({ ...map, [active]: result.text });
      else toast.error(result.error);
    });
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setActive(l)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-[11.5px] transition-colors",
              active === l ? "bg-k-ink text-white" : "text-k-text-3 hover:text-k-ink",
            )}
          >
            {LOCALE_LABEL[l]}
            {map[l]?.trim() && (
              <span
                className={cn("size-1 rounded-full", active === l ? "bg-white/70" : "bg-k-green")}
              />
            )}
          </button>
        ))}
      </div>

      {field.kind === "long" ? (
        <Textarea
          rows={3}
          value={current}
          onChange={(e) => onChange({ ...map, [active]: e.target.value })}
          className="text-[13px]"
        />
      ) : (
        <Input
          value={current}
          onChange={(e) => onChange({ ...map, [active]: e.target.value })}
          className="text-[13px]"
        />
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={suggest}
          disabled={busy}
          className="inline-flex items-center gap-1 border border-k-line-2 px-2 py-1 text-[11px] text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          Προτάσεις
        </button>
        {active !== "el" && (
          <button
            type="button"
            onClick={translate}
            disabled={busy}
            className="inline-flex items-center gap-1 border border-k-line-2 px-2 py-1 text-[11px] text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink disabled:opacity-50"
          >
            <Languages className="size-3" />
            Μετάφραση από ΕΛ
          </button>
        )}
      </div>

      {options.length > 0 && (
        <ul className="mt-1.5 divide-y divide-k-line border border-k-line bg-k-surface-2">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  onChange({ ...map, [active]: option });
                  setOptions([]);
                }}
                className="w-full px-2.5 py-1.5 text-left text-[12px] text-k-text-2 transition-colors hover:bg-white hover:text-k-ink"
              >
                {option}
                <span className="numeral ml-2 text-[10px] text-k-text-5">{option.length}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-k-text-4">
        {field.maxChars && (
          <span className={over > 0 ? "text-k-amber" : undefined}>
            {current.length}/{field.maxChars}
            {over > 0 ? " — μπορεί να μη χωρέσει" : ""}
          </span>
        )}
        {DYNAMIC_TOKENS.map((t) => (
          <button
            key={t.token}
            type="button"
            onClick={() => onChange({ ...map, [active]: current + t.token })}
            title={t.label}
            className="font-mono text-[10.5px] text-k-text-4 underline-offset-2 hover:text-k-ink hover:underline"
          >
            {t.token}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Preset badges first, custom text second — a badge is a promise, and a zone
 *  where one tile says "ΠΡΟΣΦΟΡΑ" and the next "προσφορα!!" reads as careless. */
function BadgePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {BADGE_PRESETS.map((b) => (
          <button
            key={b.value}
            type="button"
            onClick={() => onChange(value === b.value ? "" : b.value)}
            className={cn(
              "border px-2 py-1 text-[10.5px] tracking-wide transition-colors",
              value === b.value
                ? "border-k-ink bg-k-ink text-white"
                : "border-k-line-2 text-k-text-2 hover:border-k-ink hover:text-k-ink",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ή δικό σας κείμενο"
        className="mt-2 text-[12.5px]"
      />
    </div>
  );
}

/**
 * Searchable product or category picker.
 *
 * A combobox rather than a select: 5.305 products in a dropdown is not a
 * control, and typing a slug from memory is not a workflow.
 */
function EntityCombo({
  kind,
  value,
  onChange,
}: {
  kind: "product" | "category";
  value: string;
  onChange: (slug: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [loading, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      start(async () => {
        if (kind === "product") setProducts(await actionSearchProducts(query, "el"));
        else setCategories(await actionSearchCategories(query, "el"));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, kind]);

  const items =
    kind === "product"
      ? products.map((p) => ({ slug: p.slug, label: p.name, meta: p.code, image: p.images[0]?.url }))
      : categories.map((c) => ({
          slug: c.slug,
          label: c.name,
          meta: `${c.productCount} προϊόντα`,
          image: c.image ?? undefined,
        }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 border border-k-line-2 bg-white px-3 py-2 text-left text-[13px] transition-colors hover:border-k-ink"
        >
          <span className={cn("truncate", !value && "text-k-text-4")}>
            {value || (kind === "product" ? "Επιλέξτε προϊόν…" : "Επιλέξτε κατηγορία…")}
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
            placeholder={kind === "product" ? "Όνομα ή κωδικός…" : "Όνομα κατηγορίας…"}
            className="w-full bg-transparent py-2.5 pl-8 pr-8 text-[13px] outline-none"
          />
        </div>

        <ul className="max-h-64 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-[12px] text-k-text-3">
              {kind === "product" && query.trim().length < 2
                ? "Γράψτε δύο χαρακτήρες."
                : "Κανένα αποτέλεσμα."}
            </li>
          ) : (
            items.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(item.slug);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-k-surface-2"
                >
                  {item.image && (
                    <span className="relative size-7 shrink-0 border border-k-line bg-white">
                      <Image
                        src={item.image}
                        alt=""
                        fill
                        sizes="28px"
                        className="object-contain p-0.5"
                        unoptimized
                      />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-k-ink">{item.label}</span>
                    <span className="numeral block text-[10.5px] text-k-text-4">{item.meta}</span>
                  </span>
                  {value === item.slug && <Check className="size-3.5 shrink-0 text-k-green" />}
                </button>
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
