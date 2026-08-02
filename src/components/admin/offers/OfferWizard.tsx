"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import NextImage from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Import,
  Languages,
  Loader2,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  actionRewrite,
  actionSaveOffer,
  actionSearchBrands,
  actionSearchCategories,
  actionSearchProducts,
  actionTranslateOffer,
} from "@/app/admin/(protected)/offers/actions";
import {
  DISCOUNT_LABEL,
  SCOPE_LABEL,
  emptyOffer,
  suggestedBadge,
  validate,
  type OfferDiscount,
  type OfferDraft,
  type OfferScope,
} from "@/lib/offers/offer-types";
import type { PickerBrand, PickerCategory, PickerProduct } from "@/lib/media/picker";
import { MediaField } from "@/components/admin/MediaPicker";
import { Segmented, NumberField } from "@/components/admin/banners/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Building a campaign, one decision at a time.
 *
 * Four steps because the questions are genuinely sequential: what it says, what
 * it covers, what it takes off, how it looks. Putting them on one screen means
 * an operator picks a discount before deciding whether it applies to a brand or
 * three products, and then has to revisit it.
 *
 * The draft is one object held here and saved once at the end. A wizard that
 * writes each step leaves half-campaigns in the table when somebody closes the
 * tab, and half a campaign is indistinguishable from a broken one.
 */

const STEPS = [
  { id: "copy", label: "Κείμενο", hint: "Τι λέει η προσφορά" },
  { id: "scope", label: "Εύρος", hint: "Σε τι εφαρμόζεται" },
  { id: "terms", label: "Όροι", hint: "Έκπτωση, όρια, διάρκεια" },
  { id: "media", label: "Εμφάνιση", hint: "Εικόνα, βίντεο, μεταφράσεις" },
] as const;

type Step = (typeof STEPS)[number]["id"];

const TONES = [
  "άμεσο και συγκεκριμένο",
  "επαγγελματικό και λιτό",
  "επείγον, με έμφαση στη διάρκεια",
  "φιλικό προς μικρό συνεργείο",
];

const GREEK_MAP: Record<string, string> = {
  α:"a",β:"v",γ:"g",δ:"d",ε:"e",ζ:"z",η:"i",θ:"th",ι:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"x",
  ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",φ:"f",χ:"ch",ψ:"ps",ω:"o",ά:"a",έ:"e",ή:"i",
  ί:"i",ό:"o",ύ:"y",ώ:"o",ϊ:"i",ϋ:"y",ΐ:"i",ΰ:"y",
};

const slugify = (text: string) =>
  [...text.toLowerCase()]
    .map((c) => GREEK_MAP[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

export function OfferWizard({ initial }: { initial: OfferDraft | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<OfferDraft>(initial ?? emptyOffer());
  const [step, setStep] = useState<Step>("copy");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial));
  const [busy, start] = useTransition();

  const set = <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const problems = useMemo(() => validate(draft), [draft]);
  const index = STEPS.findIndex((s) => s.id === step);

  /** What the campaign is about, in one line, for the copy model. */
  const context = useMemo(() => {
    if (draft.scope === "brand" && draft.brandSlug) return `μάρκα ${draft.brandSlug}`;
    if (draft.scope === "category" && draft.categorySlug) return `κατηγορία ${draft.categorySlug}`;
    if (draft.productSlugs.length) return `${draft.productSlugs.length} επιλεγμένα προϊόντα`;
    return "";
  }, [draft.scope, draft.brandSlug, draft.categorySlug, draft.productSlugs.length]);

  function save() {
    const all = validate(draft);
    const firstBad = (["copy", "scope", "terms"] as const).find((s) => all[s]);
    if (firstBad) {
      setStep(firstBad);
      toast.error(all[firstBad]!);
      return;
    }
    start(async () => {
      const result = await actionSaveOffer(draft);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(initial ? "Η προσφορά ενημερώθηκε." : "Η προσφορά δημιουργήθηκε.");
      router.push("/admin/offers");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[13rem_minmax(0,1fr)]">
      {/* ── Βήματα ── */}
      <nav className="border border-k-line bg-white" aria-label="Βήματα">
        {STEPS.map((s, i) => {
          const done = i < index;
          const bad = Boolean(problems[s.id as keyof typeof problems]);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={cn(
                "flex w-full items-start gap-2.5 border-b border-k-line px-3 py-2.5 text-left last:border-0 transition-colors",
                step === s.id ? "bg-k-surface-2" : "hover:bg-k-surface-2",
              )}
            >
              <span
                className={cn(
                  "numeral mt-px grid size-5 shrink-0 place-items-center text-[11px]",
                  step === s.id
                    ? "bg-k-ink text-white"
                    : bad
                      ? "bg-k-red text-white"
                      : done
                        ? "bg-k-green text-white"
                        : "bg-k-surface-3 text-k-text-4",
                )}
              >
                {done && !bad ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium text-k-ink">{s.label}</span>
                <span className="block text-[10.5px] leading-[1.4] text-k-text-4">{s.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-4">
        <div className="border border-k-line bg-white p-4">
          {step === "copy" && (
            <CopyStep
              draft={draft}
              set={set}
              context={context}
              slugTouched={slugTouched}
              onSlugTouched={() => setSlugTouched(true)}
            />
          )}
          {step === "scope" && <ScopeStep draft={draft} set={set} />}
          {step === "terms" && <TermsStep draft={draft} set={set} />}
          {step === "media" && <MediaStep draft={draft} set={set} />}
        </div>

        {problems[step as keyof typeof problems] && (
          <p className="border border-k-amber/40 bg-k-amber/10 px-3 py-2 text-[12px] text-k-ink">
            {problems[step as keyof typeof problems]}
          </p>
        )}

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setStep(STEPS[Math.max(0, index - 1)].id)}
            disabled={index === 0}
          >
            <ArrowLeft className="size-3.5" />
            Πίσω
          </Button>

          <div className="flex gap-2">
            {index < STEPS.length - 1 && (
              <Button variant="outline" onClick={() => setStep(STEPS[index + 1].id)}>
                Επόμενο
                <ArrowRight className="size-3.5" />
              </Button>
            )}
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              {initial ? "Αποθήκευση" : "Δημιουργία"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── 1. Κείμενο ─────────────────────────── */

function CopyStep({
  draft,
  set,
  context,
  slugTouched,
  onSlugTouched,
}: {
  draft: OfferDraft;
  set: <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => void;
  context: string;
  slugTouched: boolean;
  onSlugTouched: () => void;
}) {
  return (
    <div className="space-y-4">
      <RewritableField
        label="Τίτλος"
        kind="title"
        value={draft.titleEl}
        onChange={(v) => {
          set("titleEl", v);
          if (!slugTouched) set("slug", slugify(v));
        }}
        maxChars={60}
        context={context}
      />

      <RewritableField
        label="Σύντομη περιγραφή"
        kind="description"
        value={draft.descriptionEl}
        onChange={(v) => set("descriptionEl", v)}
        maxChars={160}
        multiline
        context={context}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="of-slug" className="text-[11.5px]">
            Slug
          </Label>
          <Input
            id="of-slug"
            value={draft.slug}
            onChange={(e) => {
              onSlugTouched();
              set("slug", slugify(e.target.value));
            }}
            className="font-mono text-[12px]"
          />
          <p className="text-[10.5px] text-k-text-4">
            Το αναγνωριστικό με το οποίο τη βρίσκουν τα banners. Δεν αλλάζει εύκολα μετά.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="of-href" className="text-[11.5px]">
            Σύνδεσμος
          </Label>
          <Input id="of-href" value={draft.href} onChange={(e) => set("href", e.target.value)} />
          <p className="text-[10.5px] text-k-text-4">Πού πηγαίνει ο επισκέπτης.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * A Greek field with a rewrite button.
 *
 * The model returns options, never a replacement. This is the shop's voice —
 * nobody should find out what it now says by reading the live page.
 */
function RewritableField({
  label,
  kind,
  value,
  onChange,
  maxChars,
  multiline,
  context,
}: {
  label: string;
  kind: "title" | "description";
  value: string;
  onChange: (value: string) => void;
  maxChars: number;
  multiline?: boolean;
  context: string;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [tone, setTone] = useState(TONES[0]);
  const [busy, start] = useTransition();
  const Field = multiline ? Textarea : Input;

  function rewrite() {
    if (!value.trim()) {
      toast.info("Γράψτε πρώτα κάτι να ξαναδιατυπωθεί.");
      return;
    }
    start(async () => {
      const result = await actionRewrite({ text: value, kind, tone, context });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.options.length === 0) toast.info("Δεν επιστράφηκαν προτάσεις.");
      setOptions(result.options);
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11.5px]">{label}</Label>
        <span className="numeral text-[10.5px] text-k-text-5">
          {value.length}/{maxChars}
        </span>
      </div>

      <Field
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
          onChange(e.target.value)
        }
        maxLength={maxChars}
        rows={multiline ? 3 : undefined}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={rewrite}
          disabled={busy}
          className="flex items-center gap-1 border border-k-line px-2 py-1 text-[11px] text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          Ξαναδιατύπωση
        </button>
        <select
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          className="border border-k-line bg-white px-1.5 py-1 text-[11px] text-k-text-2"
          aria-label="Ύφος"
        >
          {TONES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {options.length > 0 && (
        <ul className="space-y-1 border border-k-line bg-k-surface-2 p-1.5">
          {options.map((option) => (
            <li key={option}>
              <button
                type="button"
                onClick={() => {
                  onChange(option.slice(0, maxChars));
                  setOptions([]);
                }}
                className="w-full px-2 py-1 text-left text-[12px] leading-[1.5] text-k-text-2 transition-colors hover:bg-white hover:text-k-ink"
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

/* ─────────────────────────── 2. Εύρος ─────────────────────────── */

function ScopeStep({
  draft,
  set,
}: {
  draft: OfferDraft;
  set: <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => void;
}) {
  return (
    <div className="space-y-4">
      <Segmented
        label="Σε τι εφαρμόζεται"
        value={draft.scope}
        onChange={(scope) => set("scope", scope as OfferScope)}
        options={(["products", "brand", "category"] as const).map((v) => ({
          value: v,
          label: SCOPE_LABEL[v],
        }))}
      />

      {draft.scope === "products" && (
        <ProductPicker
          slugs={draft.productSlugs}
          onChange={(slugs) => set("productSlugs", slugs)}
        />
      )}
      {draft.scope === "brand" && (
        <BrandPicker value={draft.brandSlug} onChange={(slug) => set("brandSlug", slug)} />
      )}
      {draft.scope === "category" && (
        <CategoryPicker value={draft.categorySlug} onChange={(slug) => set("categorySlug", slug)} />
      )}
    </div>
  );
}

function ProductPicker({
  slugs,
  onChange,
}: {
  slugs: string[];
  onChange: (slugs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [known, setKnown] = useState<Record<string, PickerProduct>>({});
  const [busy, start] = useTransition();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      start(async () => setResults(await actionSearchProducts(query, "el")));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
        {busy && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-k-text-4" />
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Όνομα ή κωδικός προϊόντος…"
          className="pl-8"
        />
      </div>

      {results.length > 0 && (
        <ul className="max-h-52 divide-y divide-k-line overflow-y-auto border border-k-line">
          {results.map((p) => {
            const chosen = slugs.includes(p.slug);
            return (
              <li key={p.slug}>
                <button
                  type="button"
                  onClick={() => {
                    setKnown((k) => ({ ...k, [p.slug]: p }));
                    onChange(chosen ? slugs.filter((s) => s !== p.slug) : [...slugs, p.slug]);
                  }}
                  className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left transition-colors hover:bg-k-surface-2"
                >
                  {p.images[0] && (
                    <span className="relative size-7 shrink-0 border border-k-line bg-white">
                      <NextImage src={p.images[0].url} alt="" fill sizes="28px" className="object-contain p-0.5" unoptimized />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-k-ink">{p.name}</span>
                  {chosen && <Check className="size-3.5 shrink-0 text-k-green" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border border-k-line">
        <p className="border-b border-k-line px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-k-text-4">
          Επιλεγμένα · {slugs.length}
        </p>
        {slugs.length === 0 ? (
          <p className="px-2.5 py-3 text-[11.5px] text-k-text-3">
            Κανένα ακόμη. Αναζητήστε παραπάνω και πατήστε για να προσθέσετε.
          </p>
        ) : (
          <ul className="max-h-44 overflow-y-auto">
            {slugs.map((slug) => (
              <li
                key={slug}
                className="flex items-center gap-2 border-b border-k-line px-2.5 py-1.5 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-k-ink">
                  {known[slug]?.name ?? slug}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(slugs.filter((s) => s !== slug))}
                  className="p-0.5 text-k-text-4 hover:text-k-red"
                  aria-label="Αφαίρεση"
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BrandPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const [brands, setBrands] = useState<PickerBrand[]>([]);
  const [busy, start] = useTransition();

  useEffect(() => {
    start(async () => setBrands(await actionSearchBrands("", "el")));
  }, []);

  if (busy && brands.length === 0) {
    return (
      <p className="flex items-center gap-2 py-6 text-[12px] text-k-text-3">
        <Loader2 className="size-3.5 animate-spin" />
        Φόρτωση…
      </p>
    );
  }

  return (
    <ul className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
      {brands.map((brand) => (
        <li key={brand.slug}>
          <button
            type="button"
            onClick={() => onChange(brand.slug)}
            className={cn(
              "w-full border p-2 text-center transition-colors",
              value === brand.slug ? "border-k-ink bg-k-surface-2" : "border-k-line hover:border-k-ink",
            )}
          >
            {brand.logo ? (
              <span className="relative block h-8 w-full">
                <NextImage src={brand.logo} alt={brand.name} fill sizes="120px" className="object-contain" unoptimized />
              </span>
            ) : (
              <span className="block truncate py-2 text-[12px] text-k-ink">{brand.name}</span>
            )}
            <span className="numeral mt-1 block text-[10px] text-k-text-4">
              {brand.productCount} κωδ.
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function CategoryPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [busy, start] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      start(async () => setCategories(await actionSearchCategories(query, "el")));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
        {busy && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-k-text-4" />
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Όνομα κατηγορίας…"
          className="pl-8"
        />
      </div>
      <ul className="max-h-64 divide-y divide-k-line overflow-y-auto border border-k-line">
        {categories.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onChange(c.slug)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left transition-colors hover:bg-k-surface-2",
                value === c.slug && "bg-k-surface-2",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-k-ink">{c.name}</span>
              <span className="numeral shrink-0 text-[10.5px] text-k-text-4">
                {c.productCount}
              </span>
              {value === c.slug && <Check className="size-3.5 shrink-0 text-k-green" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────── 3. Όροι ─────────────────────────── */

function TermsStep({
  draft,
  set,
}: {
  draft: OfferDraft;
  set: <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => void;
}) {
  const badge = suggestedBadge(draft);

  return (
    <div className="space-y-4">
      <Segmented
        label="Τύπος έκπτωσης"
        value={draft.discount}
        onChange={(discount) => set("discount", discount as OfferDiscount)}
        options={(["percent", "amount", "bogo", "none"] as const).map((v) => ({
          value: v,
          label: DISCOUNT_LABEL[v],
        }))}
      />

      {(draft.discount === "percent" || draft.discount === "amount") && (
        <NumberField
          label={draft.discount === "percent" ? "Ποσοστό" : "Ποσό"}
          value={draft.discountValue}
          min={0}
          max={draft.discount === "percent" ? 99 : 99999}
          suffix={draft.discount === "percent" ? "%" : "€"}
          onChange={(v) => set("discountValue", v || null)}
        />
      )}

      {draft.discount === "bogo" && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Αγοράζει"
            value={draft.bogoBuy}
            min={1}
            max={20}
            onChange={(v) => set("bogoBuy", v)}
          />
          <NumberField
            label="Παίρνει δώρο"
            value={draft.bogoFree}
            min={1}
            max={20}
            onChange={(v) => set("bogoFree", v)}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="of-badge" className="text-[11.5px]">
          Badge
        </Label>
        <div className="flex gap-2">
          <Input
            id="of-badge"
            value={draft.badge}
            onChange={(e) => set("badge", e.target.value)}
            placeholder={badge || "π.χ. ΔΩΡΕΑΝ ΜΕΤΑΦΟΡΙΚΑ"}
            maxLength={40}
          />
          {badge && badge !== draft.badge && (
            <Button variant="outline" onClick={() => set("badge", badge)} className="shrink-0">
              <Import className="size-3.5" />
              {badge}
            </Button>
          )}
        </div>
        <p className="text-[10.5px] leading-[1.5] text-k-text-4">
          Κενό σημαίνει χωρίς badge. Το κουμπί το γράφει από τα νούμερα της προσφοράς, ώστε να μη
          μείνει «-30%» πάνω σε καμπάνια που έγινε -20%.
        </p>
      </div>

      <div className="grid gap-3 border-t border-k-line pt-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="of-from" className="text-[11.5px]">
            Έναρξη
          </Label>
          <Input
            id="of-from"
            type="datetime-local"
            value={draft.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="of-to" className="text-[11.5px]">
            Λήξη
          </Label>
          <Input
            id="of-to"
            type="datetime-local"
            value={draft.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Όριο ανά πελάτη"
          value={draft.maxPerCustomer}
          min={0}
          max={999}
          placeholder="Χωρίς όριο"
          onChange={(v) => set("maxPerCustomer", v || null)}
        />
        <NumberField
          label="Μέγιστες πωλήσεις"
          value={draft.maxTotal}
          min={0}
          max={999999}
          placeholder="Χωρίς όριο"
          onChange={(v) => set("maxTotal", v || null)}
        />
      </div>
      <p className="text-[10.5px] leading-[1.5] text-k-text-4">
        Μηδέν σημαίνει χωρίς όριο. Τα όρια καταγράφονται εδώ και εμφανίζονται· η εφαρμογή τους στο
        καλάθι ανήκει στο HDCtool, όπου ζει η τιμολογιακή πολιτική.
      </p>

      <label className="flex items-center justify-between border border-k-line px-3 py-2.5">
        <span className="text-[12.5px] text-k-ink">Ενεργή</span>
        <Switch
          checked={draft.isActive}
          onCheckedChange={(v) => set("isActive", v)}
          aria-label="Ενεργή"
        />
      </label>
    </div>
  );
}

/* ─────────────────────────── 4. Εμφάνιση ─────────────────────────── */

function MediaStep({
  draft,
  set,
}: {
  draft: OfferDraft;
  set: <K extends keyof OfferDraft>(key: K, value: OfferDraft[K]) => void;
}) {
  const [busy, start] = useTransition();

  function translate() {
    if (!draft.titleEl.trim()) {
      toast.info("Γράψτε πρώτα τον ελληνικό τίτλο.");
      return;
    }
    start(async () => {
      for (const to of ["en", "it"] as const) {
        const title = await actionTranslateOffer({ text: draft.titleEl, to, maxChars: 60 });
        if (title.ok) set(to === "en" ? "titleEn" : "titleIt", title.text);

        if (draft.descriptionEl.trim()) {
          const description = await actionTranslateOffer({
            text: draft.descriptionEl,
            to,
            maxChars: 160,
          });
          if (description.ok) set(to === "en" ? "descriptionEn" : "descriptionIt", description.text);
        }
      }
      toast.success("Μεταφράστηκε σε αγγλικά και ιταλικά.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Εικόνα</Label>
          <MediaField label="Εικόνα προσφοράς" value={draft.image} onChange={(u) => set("image", u)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Εικόνα πλατιά</Label>
          <MediaField
            label="Πλατιά εικόνα"
            value={draft.imageWide}
            onChange={(u) => set("imageWide", u)}
          />
          <p className="text-[10.5px] text-k-text-4">
            Για φαρδιά κελιά. Αν λείπει, χρησιμοποιείται η κανονική.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Βίντεο</Label>
          <MediaField
            label="Βίντεο προσφοράς"
            accept="video"
            value={draft.video}
            onChange={(u) => set("video", u)}
          />
          <p className="text-[10.5px] text-k-text-4">
            Μπαίνει ως φόντο όταν το banner το ζητήσει.
          </p>
        </div>
      </div>

      <section className="space-y-2 border-t border-k-line pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
            Μεταφράσεις
          </p>
          <Button variant="outline" size="sm" onClick={translate} disabled={busy}>
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Languages className="size-3" />}
            Μετάφραση σε EN + IT
          </Button>
        </div>

        {(["En", "It"] as const).map((suffix) => (
          <div key={suffix} className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
                Τίτλος {suffix === "En" ? "EN" : "IT"}
              </Label>
              <Input
                value={draft[`title${suffix}`]}
                onChange={(e) => set(`title${suffix}`, e.target.value)}
                placeholder={draft.titleEl}
                className="text-[12px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">
                Περιγραφή {suffix === "En" ? "EN" : "IT"}
              </Label>
              <Input
                value={draft[`description${suffix}`]}
                onChange={(e) => set(`description${suffix}`, e.target.value)}
                placeholder={draft.descriptionEl}
                className="text-[12px]"
              />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
