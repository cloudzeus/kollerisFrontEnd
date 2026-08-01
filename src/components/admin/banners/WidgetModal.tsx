"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { Check, ChevronsUpDown, Loader2, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  actionGenerateCopy,
  actionSearchOffers,
  actionSearchProducts,
  actionTranslate,
} from "@/app/admin/(protected)/banners/actions";
import { BADGE_TONES } from "@/lib/zones/registry";
import {
  emptyWidget,
  type CellWidget,
  type GridCell,
  type LocalisedText,
  type OfferView,
  type WidgetChrome,
  type WidgetSource,
} from "@/lib/banners/contract";
import type { PickerProduct } from "@/lib/media/picker";
import { MediaField } from "@/components/admin/MediaPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * What goes in one cell.
 *
 * Three source types on three tabs, because they behave differently and saying
 * so up front is cheaper than explaining later: a product widget follows the
 * catalogue and changes on its own, an offer follows a campaign and its dates,
 * and custom content stays exactly as typed.
 *
 * The link is derived for the first two and typed only for the third. The href
 * field is absent from those tabs rather than disabled — a greyed-out field
 * invites somebody to work out how to enable it.
 *
 * Chrome sits below the tabs, shared by all three, so a new source type cannot
 * ship without a badge, an overlay and an animation.
 */

const SOURCE_LABEL: Record<WidgetSource, string> = {
  product: "Προϊόν",
  offer: "Προσφορά",
  custom: "Ελεύθερο",
};

const LOCALES = [
  { code: "el", label: "Ελληνικά" },
  { code: "en", label: "English" },
  { code: "it", label: "Italiano" },
] as const;

const OVERLAYS = [
  { value: "none", label: "Χωρίς" },
  { value: "light", label: "Ελαφρύ" },
  { value: "medium", label: "Μεσαίο" },
  { value: "strong", label: "Έντονο" },
];

const ANIMATIONS = [
  { value: "none", label: "Καμία" },
  { value: "fade-up", label: "Άνοδος με fade" },
  { value: "slide-in", label: "Είσοδος από αριστερά" },
  { value: "reveal", label: "Αποκάλυψη" },
  { value: "zoom", label: "Zoom" },
];

const BADGE_PRESETS = ["ΝΕΟ", "-30%", "ΠΡΟΣΦΟΡΑ", "ΤΕΛΕΥΤΑΙΑ ΤΕΜΑΧΙΑ", "ΔΩΡΕΑΝ ΜΕΤΑΦΟΡΙΚΑ"];

export function WidgetModal({
  cell,
  widget,
  onClose,
  onSave,
  onClear,
}: {
  cell: GridCell | null;
  widget: CellWidget | null;
  onClose: () => void;
  onSave: (widget: CellWidget) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState<CellWidget>(widget ?? emptyWidget("product"));

  // A different cell means a different widget; the modal is one instance reused.
  useEffect(() => {
    if (cell) setDraft(widget ?? emptyWidget("product"));
  }, [cell, widget]);

  const setChrome = (patch: Partial<WidgetChrome>) =>
    setDraft((d) => ({ ...d, chrome: { ...d.chrome, ...patch } }));

  /** Switching source keeps the chrome — the styling was a separate decision. */
  function switchSource(source: WidgetSource) {
    setDraft((d) => (d.source === source ? d : { ...emptyWidget(source), chrome: d.chrome }));
  }

  return (
    <Dialog open={cell !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-[38rem]">
        <DialogHeader>
          <DialogTitle>{cell?.name}</DialogTitle>
          <DialogDescription>
            Το περιεχόμενο αυτού του κελιού — {cell?.w}×{cell?.h} στο πλέγμα.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={draft.source} onValueChange={(v) => switchSource(v as WidgetSource)}>
          <TabsList className="w-full">
            {(["product", "offer", "custom"] as const).map((s) => (
              <TabsTrigger key={s} value={s} className="flex-1">
                {SOURCE_LABEL[s]}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Προϊόν ── */}
          <TabsContent value="product" className="space-y-4 pt-3">
            {draft.source === "product" && (
              <ProductPane draft={draft} setDraft={setDraft} />
            )}
          </TabsContent>

          {/* ── Προσφορά ── */}
          <TabsContent value="offer" className="space-y-4 pt-3">
            {draft.source === "offer" && <OfferPane draft={draft} setDraft={setDraft} />}
          </TabsContent>

          {/* ── Ελεύθερο ── */}
          <TabsContent value="custom" className="space-y-4 pt-3">
            {draft.source === "custom" && <CustomPane draft={draft} setDraft={setDraft} />}
          </TabsContent>
        </Tabs>

        {/* ── Εμφάνιση ── */}
        <section className="space-y-3 border-t border-k-line pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
            Εμφάνιση
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="w-badge" className="text-[11.5px]">
              Badge
            </Label>
            <div className="flex gap-2">
              <Input
                id="w-badge"
                value={draft.chrome.badge}
                onChange={(e) => setChrome({ badge: e.target.value })}
                maxLength={40}
                placeholder="Χωρίς badge"
              />
              <Select
                value={draft.chrome.badgeTone}
                onValueChange={(v) => setChrome({ badgeTone: v as WidgetChrome["badgeTone"] })}
              >
                <SelectTrigger className="w-[8.5rem] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_TONES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <span className={cn("size-3", t.className)} />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1 pt-0.5">
              {BADGE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setChrome({ badge: preset })}
                  className="border border-k-line px-1.5 py-0.5 text-[10.5px] text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11.5px]">Σκίαση πάνω από εικόνα</Label>
              <Select
                value={draft.chrome.overlay}
                onValueChange={(v) => setChrome({ overlay: v as WidgetChrome["overlay"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OVERLAYS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11.5px]">Κίνηση εισόδου</Label>
              <Select
                value={draft.chrome.animation}
                onValueChange={(v) => setChrome({ animation: v as WidgetChrome["animation"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ANIMATIONS.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {draft.chrome.animation !== "none" && (
            <div className="space-y-1.5">
              <Label className="text-[11.5px]">Καθυστέρηση</Label>
              <div className="flex gap-1">
                {([0, 100, 200, 400] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setChrome({ animationDelay: d })}
                    className={cn(
                      "numeral flex-1 border px-2 py-1.5 text-[11.5px] transition-colors",
                      draft.chrome.animationDelay === d
                        ? "border-k-ink bg-k-ink text-white"
                        : "border-k-line text-k-text-2 hover:border-k-ink",
                    )}
                  >
                    {d === 0 ? "Αυτόματα" : `${d}ms`}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-k-text-4">
                Αυτόματα: τα κελιά μπαίνουν σε σειρά αντί για όλα μαζί.
              </p>
            </div>
          )}

          <label className="flex items-center justify-between border border-k-line px-3 py-2.5">
            <span className="min-w-0 pr-3 text-[12.5px] text-k-ink">
              Σκούρο φόντο
              <span className="block text-[11px] text-k-text-4">
                Λευκά γράμματα χωρίς εικόνα. Με εικόνα ισχύει ούτως ή άλλως.
              </span>
            </span>
            <Switch
              checked={draft.chrome.dark}
              onCheckedChange={(v) => setChrome({ dark: v })}
              aria-label="Σκούρο φόντο"
            />
          </label>
        </section>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={onClear}
            className="text-k-text-3 hover:text-k-red"
            disabled={!widget}
          >
            <Trash2 className="size-3.5" />
            Άδειασμα κελιού
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Άκυρο
            </Button>
            <Button onClick={() => onSave(draft)}>Εφαρμογή</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Προϊόν ───────────────────────── */

const FIELD_LABELS: Array<{ key: keyof Extract<CellWidget, { source: "product" }>["fields"]; label: string }> = [
  { key: "title", label: "Όνομα" },
  { key: "shortDescription", label: "Σύντομη περιγραφή" },
  { key: "price", label: "Τιμή" },
  { key: "comparePrice", label: "Τιμή σύγκρισης" },
  { key: "code", label: "Κωδικός" },
  { key: "brand", label: "Μάρκα" },
];

function ProductPane({
  draft,
  setDraft,
}: {
  draft: Extract<CellWidget, { source: "product" }>;
  setDraft: (fn: (d: CellWidget) => CellWidget) => void;
}) {
  const [picked, setPicked] = useState<PickerProduct | null>(null);

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-[11.5px]">Προϊόν</Label>
        <ProductCombo
          value={draft.slug}
          onPick={(p) => {
            setPicked(p);
            setDraft((d) =>
              d.source === "product"
                ? { ...d, slug: p.slug, imageUrl: p.images[0]?.url ?? "" }
                : d,
            );
          }}
        />
        <p className="text-[11px] text-k-text-4">
          Ο τίτλος, η τιμή και ο σύνδεσμος έρχονται από τον κατάλογο και ενημερώνονται μόνα τους.
        </p>
      </div>

      {picked && picked.images.length > 1 && (
        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Φωτογραφία</Label>
          <div className="flex flex-wrap gap-2">
            {picked.images.map((img) => (
              <button
                key={img.url}
                type="button"
                onClick={() =>
                  setDraft((d) => (d.source === "product" ? { ...d, imageUrl: img.url } : d))
                }
                className={cn(
                  "relative size-14 border bg-white transition-colors",
                  draft.imageUrl === img.url ? "border-k-ink ring-1 ring-k-ink" : "border-k-line",
                )}
                aria-label="Επιλογή φωτογραφίας"
              >
                <Image src={img.url} alt="" fill sizes="56px" className="object-contain p-1" unoptimized />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-[11.5px]">Τι εμφανίζεται</Label>
        <div className="grid grid-cols-2 gap-1">
          {FIELD_LABELS.map((f) => (
            <label
              key={f.key}
              className="flex items-center justify-between gap-2 border border-k-line px-2.5 py-1.5"
            >
              <span className="text-[12px] text-k-ink">{f.label}</span>
              <Switch
                checked={draft.fields[f.key]}
                onCheckedChange={(v) =>
                  setDraft((d) =>
                    d.source === "product" ? { ...d, fields: { ...d.fields, [f.key]: v } } : d,
                  )
                }
                aria-label={f.label}
              />
            </label>
          ))}
        </div>
        <p className="text-[11px] text-k-text-4">
          Η τιμή σύγκρισης εμφανίζεται μόνο αν το προϊόν έχει πράγματι υψηλότερη τιμή καταλόγου.
        </p>
      </div>
    </>
  );
}

function ProductCombo({
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
          className="flex w-full items-center justify-between gap-2 border border-k-line-2 bg-white px-3 py-2 text-left text-[13px] transition-colors hover:border-k-ink"
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

/* ───────────────────────── Προσφορά ───────────────────────── */

function OfferPane({
  draft,
  setDraft,
}: {
  draft: Extract<CellWidget, { source: "offer" }>;
  setDraft: (fn: (d: CellWidget) => CellWidget) => void;
}) {
  const [offers, setOffers] = useState<OfferView[]>([]);
  const [loading, start] = useTransition();

  useEffect(() => {
    start(async () => setOffers(await actionSearchOffers("")));
  }, []);

  const chosen = offers.find((o) => o.slug === draft.slug);

  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-[11.5px]">Προσφορά</Label>
        {loading && offers.length === 0 ? (
          <p className="flex items-center gap-2 py-2 text-[12px] text-k-text-3">
            <Loader2 className="size-3.5 animate-spin" />
            Φόρτωση…
          </p>
        ) : offers.length === 0 ? (
          <p className="border border-dashed border-k-line px-3 py-4 text-[12px] leading-[1.6] text-k-text-3">
            Καμία ενεργή προσφορά. Δημιουργήστε μία στις Προσφορές και επιστρέψτε εδώ.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {offers.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((d) => (d.source === "offer" ? { ...d, slug: o.slug } : d))
                  }
                  className={cn(
                    "flex w-full items-center gap-2.5 border px-2.5 py-2 text-left transition-colors",
                    draft.slug === o.slug
                      ? "border-k-ink bg-k-surface-2"
                      : "border-k-line hover:border-k-ink",
                  )}
                >
                  {o.image && (
                    <span className="relative size-8 shrink-0 border border-k-line bg-white">
                      <Image src={o.image} alt="" fill sizes="32px" className="object-contain p-0.5" unoptimized />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-k-ink">{o.title}</span>
                    <span className="block truncate text-[10.5px] text-k-text-4">{o.href}</span>
                  </span>
                  {o.badge && (
                    <span className="shrink-0 bg-k-red px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {o.badge}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Εικόνα</Label>
          <Select
            value={draft.image}
            onValueChange={(v) =>
              setDraft((d) =>
                d.source === "offer" ? { ...d, image: v as "image" | "imageWide" } : d,
              )
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="image">Κανονική</SelectItem>
              <SelectItem value="imageWide">Πλατιά</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <label className="flex items-end justify-between gap-2 pb-1">
          <span className="text-[12.5px] text-k-ink">Αντίστροφη μέτρηση</span>
          <Switch
            checked={draft.countdown}
            onCheckedChange={(v) =>
              setDraft((d) => (d.source === "offer" ? { ...d, countdown: v } : d))
            }
            aria-label="Αντίστροφη μέτρηση"
          />
        </label>
      </div>

      {draft.countdown && !chosen?.endsAt && (
        <p className="border border-k-amber/40 bg-k-amber/10 px-3 py-2 text-[11.5px] text-k-ink">
          Η προσφορά δεν έχει ημερομηνία λήξης, οπότε δεν εμφανίζεται μέτρηση.
        </p>
      )}
    </>
  );
}

/* ───────────────────────── Ελεύθερο ───────────────────────── */

function CustomPane({
  draft,
  setDraft,
}: {
  draft: Extract<CellWidget, { source: "custom" }>;
  setDraft: (fn: (d: CellWidget) => CellWidget) => void;
}) {
  const patch = (key: "heading" | "subheading" | "body" | "cta", value: LocalisedText) =>
    setDraft((d) => (d.source === "custom" ? { ...d, [key]: value } : d));

  const media = (key: "kind" | "image" | "video" | "poster", value: string) =>
    setDraft((d) => (d.source === "custom" ? { ...d, media: { ...d.media, [key]: value } } : d));

  return (
    <>
      <LocalisedField
        label="Επικεφαλίδα"
        field="heading"
        value={draft.heading}
        onChange={(v) => patch("heading", v)}
        maxChars={60}
        context={draft.subheading.el ?? ""}
      />
      <LocalisedField
        label="Υπέρτιτλος"
        field="subheading"
        value={draft.subheading}
        onChange={(v) => patch("subheading", v)}
        maxChars={30}
        context={draft.heading.el ?? ""}
      />
      <LocalisedField
        label="Κείμενο"
        field="body"
        value={draft.body}
        onChange={(v) => patch("body", v)}
        maxChars={160}
        multiline
        context={draft.heading.el ?? ""}
      />
      <LocalisedField
        label="Κουμπί"
        field="cta"
        value={draft.cta}
        onChange={(v) => patch("cta", v)}
        maxChars={24}
        context={draft.heading.el ?? ""}
      />

      <div className="space-y-1.5">
        <Label htmlFor="w-href" className="text-[11.5px]">
          Σύνδεσμος
        </Label>
        <Input
          id="w-href"
          value={draft.href}
          onChange={(e) =>
            setDraft((d) => (d.source === "custom" ? { ...d, href: e.target.value } : d))
          }
          placeholder="/katalogos"
        />
      </div>

      <div className="space-y-3 border-t border-k-line pt-3">
        <div className="space-y-1.5">
          <Label className="text-[11.5px]">Φόντο</Label>
          <div className="flex gap-1">
            {(
              [
                { value: "none", label: "Χωρίς" },
                { value: "image", label: "Εικόνα" },
                { value: "video", label: "Βίντεο" },
              ] as const
            ).map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => media("kind", k.value)}
                className={cn(
                  "flex-1 border px-2 py-1.5 text-[12px] transition-colors",
                  draft.media.kind === k.value
                    ? "border-k-ink bg-k-ink text-white"
                    : "border-k-line text-k-text-2 hover:border-k-ink",
                )}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>

        {draft.media.kind === "image" && (
          <MediaField label="Εικόνα φόντου" value={draft.media.image} onChange={(u) => media("image", u)} />
        )}
        {draft.media.kind === "video" && (
          <>
            <MediaField
              label="Βίντεο"
              accept="video"
              value={draft.media.video}
              onChange={(u) => media("video", u)}
            />
            <div className="space-y-1.5">
              <Label className="text-[11.5px]">Πρώτο καρέ</Label>
              <MediaField
                label="Πρώτο καρέ βίντεο"
                value={draft.media.poster}
                onChange={(u) => media("poster", u)}
              />
              <p className="text-[11px] text-k-text-4">
                Εμφανίζεται όσο φορτώνει και όπου η αυτόματη αναπαραγωγή είναι απενεργοποιημένη.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * One text in three languages.
 *
 * Greek is written; the other two are translated from it on demand, because
 * that is how this catalogue is actually maintained — nobody authors the
 * Italian first. DeepSeek writes the Greek option when the page is blank and
 * translates it afterwards, so the two buttons are the same workflow at two
 * stages rather than two features.
 */
function LocalisedField({
  label,
  field,
  value,
  onChange,
  maxChars,
  multiline,
  context,
}: {
  label: string;
  field: string;
  value: LocalisedText;
  onChange: (value: LocalisedText) => void;
  maxChars: number;
  multiline?: boolean;
  context: string;
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
        <Label className="text-[11.5px]">{label}</Label>
        <div className="flex items-center gap-1">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLocale(l.code)}
              className={cn(
                "px-1.5 py-0.5 text-[10.5px] uppercase tracking-[0.06em] transition-colors",
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
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="flex items-center gap-1 text-[11px] text-k-text-3 transition-colors hover:text-k-ink disabled:opacity-50"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
          Πρόταση
        </button>
        {locale !== "el" && (
          <button
            type="button"
            onClick={translate}
            disabled={busy}
            className="text-[11px] text-k-text-3 transition-colors hover:text-k-ink disabled:opacity-50"
          >
            Μετάφραση από τα ελληνικά
          </button>
        )}
        <span className="numeral ml-auto text-[10.5px] text-k-text-5">
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
