"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  ImageIcon,
  Link2,
  Loader2,
  Package,
  Search,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { actionSearchProducts, actionUpload } from "@/app/admin/(protected)/zones/actions";
import type { PickerProduct } from "@/lib/media/picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Choosing a picture.
 *
 * Three ways in, because there are three situations: the photo already exists on
 * a product (overwhelmingly the common case), marketing has a new file, or
 * somebody has a URL. Product search is the default tab for that reason.
 *
 * The product flow is two steps on purpose — find the product, then pick the
 * frame. A flat grid of every image from every match looks efficient and is
 * unusable: forty near-identical shots of six products with nothing saying which
 * belongs to which.
 *
 * Search is debounced at 250ms and fires from two characters. Typing a supplier
 * code should not put a query on the database per keystroke.
 */

type Mode = "product" | "upload" | "url";

export function MediaPicker({
  open,
  onOpenChange,
  onPick,
  locale = "el",
  accept = "image",
  title = "Επιλογή εικόνας",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (url: string) => void;
  locale?: "el" | "en" | "it";
  accept?: "image" | "video";
  title?: string;
}) {
  const [mode, setMode] = useState<Mode>("product");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [selected, setSelected] = useState<PickerProduct | null>(null);
  const [url, setUrl] = useState("");
  const [searching, startSearch] = useTransition();
  const [uploading, startUpload] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Reset on close, so reopening does not resume somebody else's half-finished
  // search from ten minutes ago.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setUrl("");
      setMode(accept === "video" ? "upload" : "product");
    }
  }, [open, accept]);

  useEffect(() => {
    if (mode !== "product" || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      startSearch(async () => {
        setResults(await actionSearchProducts(query, locale));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, mode, locale]);

  function pick(chosen: string) {
    onPick(chosen);
    onOpenChange(false);
    toast.success("Η εικόνα επιλέχθηκε.");
  }

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    startUpload(async () => {
      const result = await actionUpload(form);
      if (result.ok) {
        toast.success(`Ανέβηκε. ${result.saved}`);
        pick(result.url);
      } else {
        toast.error(result.error);
      }
    });
  }

  const TABS: Array<{ id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    ...(accept === "image"
      ? [{ id: "product" as const, label: "Από προϊόν", icon: Package }]
      : []),
    { id: "upload", label: "Ανέβασμα", icon: Upload },
    { id: "url", label: "Διεύθυνση", icon: Link2 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[56rem] gap-0 p-0">
        <DialogHeader className="border-b border-k-line px-5 py-4">
          <DialogTitle className="text-[15px]">{title}</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {accept === "video"
              ? "Ανεβάστε βίντεο ή δώστε διεύθυνση."
              : "Διαλέξτε φωτογραφία από προϊόν, ανεβάστε δική σας, ή δώστε διεύθυνση."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1 border-b border-k-line px-3">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={cn(
                "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] transition-colors",
                mode === tab.id
                  ? "border-k-ink font-medium text-k-ink"
                  : "border-transparent text-k-text-3 hover:text-k-ink",
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Από προϊόν ── */}
        {mode === "product" && (
          <div className="flex h-[26rem] flex-col">
            {selected ? (
              <>
                <div className="flex items-center gap-2 border-b border-k-line px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="flex items-center gap-1.5 text-[12.5px] text-k-text-3 transition-colors hover:text-k-ink"
                  >
                    <ArrowLeft className="size-3.5" />
                    Πίσω
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-k-ink">
                    {selected.name}
                  </span>
                  <span className="numeral text-[11px] text-k-text-4">
                    {selected.images.length} φωτογραφίες
                  </span>
                </div>

                <div className="grid flex-1 grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-5">
                  {selected.images.map((img) => (
                    <button
                      key={img.url}
                      type="button"
                      onClick={() => pick(img.url)}
                      className="group relative aspect-square border border-k-line bg-white transition-colors hover:border-k-ink"
                    >
                      <Image
                        src={img.url}
                        alt=""
                        fill
                        sizes="140px"
                        className="object-contain p-1.5"
                        unoptimized
                      />
                      {img.isFeature && (
                        <span className="absolute left-1 top-1 bg-k-ink px-1 py-px text-[9px] text-white">
                          ΚΥΡΙΑ
                        </span>
                      )}
                      <span className="absolute inset-0 hidden place-items-center bg-k-ink/70 group-hover:grid">
                        <Check className="size-5 text-white" />
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="border-b border-k-line px-4 py-2.5">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
                    {searching && (
                      <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-k-text-4" />
                    )}
                    <Input
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Όνομα, κωδικός, barcode…"
                      className="h-9 pl-8 text-[13px]"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {query.trim().length < 2 ? (
                    <Empty icon={Search} text="Γράψτε δύο χαρακτήρες για αναζήτηση." />
                  ) : results.length === 0 && !searching ? (
                    <Empty icon={Package} text={`Κανένα προϊόν με φωτογραφία για «${query}».`} />
                  ) : (
                    <ul className="divide-y divide-k-line">
                      {results.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => setSelected(p)}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-k-surface-2"
                          >
                            <span className="relative size-10 shrink-0 border border-k-line bg-white">
                              <Image
                                src={p.images[0].url}
                                alt=""
                                fill
                                sizes="40px"
                                className="object-contain p-0.5"
                                unoptimized
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] text-k-ink">
                                {p.name}
                              </span>
                              <span className="numeral block text-[11px] text-k-text-4">
                                {p.code}
                                {p.brand ? ` · ${p.brand}` : ""}
                              </span>
                            </span>
                            <span className="numeral shrink-0 text-[11px] text-k-text-4">
                              {p.images.length} φωτ.
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Ανέβασμα ── */}
        {mode === "upload" && (
          <div className="flex h-[26rem] items-center justify-center p-6">
            <input
              ref={fileInput}
              type="file"
              accept={accept === "video" ? "video/*" : "image/*"}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) upload(file);
              }}
              className="grid w-full max-w-[28rem] place-items-center gap-3 border-2 border-dashed border-k-line-2 px-6 py-12 text-center"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-6 animate-spin text-k-text-4" />
                  <p className="text-[13px] text-k-text-2">Μετατροπή και αποστολή…</p>
                </>
              ) : (
                <>
                  <Upload className="size-6 text-k-text-4" />
                  <p className="text-[13px] text-k-text-2">
                    Σύρετε αρχείο εδώ, ή
                    <button
                      type="button"
                      onClick={() => fileInput.current?.click()}
                      className="ml-1 text-k-ink underline underline-offset-2"
                    >
                      επιλέξτε
                    </button>
                  </p>
                  <p className="max-w-[24rem] text-[11.5px] leading-[1.5] text-k-text-4">
                    {accept === "video"
                      ? "Το βίντεο ανεβαίνει όπως είναι. Κρατήστε το κάτω από 5MB."
                      : "Η εικόνα μετατρέπεται αυτόματα σε WebP με μέγιστη πλευρά 1920px."}
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Διεύθυνση ── */}
        {mode === "url" && (
          <div className="flex h-[26rem] flex-col gap-4 p-6">
            <div>
              <label htmlFor="media-url" className="text-[12.5px] text-k-ink">
                Διεύθυνση αρχείου
              </label>
              <Input
                id="media-url"
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1.5 font-mono text-[12.5px]"
              />
              <p className="mt-1.5 text-[11.5px] text-k-text-4">
                Δεν περνά από μετατροπή — χρησιμοποιήστε το μόνο για αρχεία που είναι ήδη
                βελτιστοποιημένα.
              </p>
            </div>

            {url.trim() && accept === "image" && (
              <div className="relative min-h-0 flex-1 border border-k-line bg-k-surface-2">
                <Image src={url} alt="" fill sizes="600px" className="object-contain" unoptimized />
              </div>
            )}

            <Button onClick={() => url.trim() && pick(url.trim())} disabled={!url.trim()}>
              Χρήση
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Empty({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="grid h-full place-items-center gap-2 px-6 text-center">
      <Icon className="size-6 text-k-text-5" />
      <p className="text-[12.5px] text-k-text-3">{text}</p>
    </div>
  );
}

/** The small preview + button pair that sits in a widget form. */
export function MediaField({
  value,
  onChange,
  accept = "image",
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  accept?: "image" | "video";
  label: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="relative grid size-16 shrink-0 place-items-center border border-k-line bg-k-surface-2 transition-colors hover:border-k-ink"
          aria-label={`Επιλογή: ${label}`}
        >
          {value ? (
            accept === "video" ? (
              <video src={value} muted className="size-full object-cover" />
            ) : (
              <Image src={value} alt="" fill sizes="64px" className="object-contain p-1" unoptimized />
            )
          ) : (
            <ImageIcon className="size-4 text-k-text-5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="text-[12px]">
              {value ? "Αλλαγή" : "Επιλογή"}
            </Button>
            {value && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange("")}
                className="text-[12px] text-k-text-3"
              >
                <X className="size-3" />
                Αφαίρεση
              </Button>
            )}
          </div>
          {value && (
            <p className="mt-1 truncate font-mono text-[10.5px] text-k-text-4">{value}</p>
          )}
        </div>
      </div>

      <MediaPicker
        open={open}
        onOpenChange={setOpen}
        onPick={onChange}
        accept={accept}
        title={label}
      />
    </>
  );
}
