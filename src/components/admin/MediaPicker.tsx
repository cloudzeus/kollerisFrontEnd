"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  ImageIcon,
  Link2,
  Loader2,
  Package,
  Play,
  Search,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  actionDeleteAsset,
  actionListAssets,
  actionListLogos,
} from "@/app/admin/(protected)/media/actions";
import { uploadFiles } from "@/lib/media/upload-client";
import { actionSearchProducts } from "@/app/admin/(protected)/zones/actions";
import { fileSize, type MediaAssetView } from "@/lib/media/library-types";
import type { PickerProduct } from "@/lib/media/picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Choosing a file.
 *
 * Four ways in, because there are four situations: it is already in the
 * library, it is a brand's logo, it is a photograph of a product, or it is on
 * somebody's disk. The library leads — the second time a file is needed should
 * not be another upload, which is exactly what happened while uploads went
 * straight to the CDN and were never recorded.
 *
 * The product flow stays two steps on purpose — find the product, then pick the
 * frame. A flat grid of every image from every match looks efficient and is
 * unusable: forty near-identical shots of six products with nothing saying
 * which belongs to which.
 */

type Mode = "library" | "logos" | "product" | "url";

const TABS: Array<{ id: Mode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "library", label: "Βιβλιοθήκη", icon: ImageIcon },
  { id: "logos", label: "Λογότυπα", icon: Tag },
  { id: "product", label: "Προϊόντα", icon: Package },
  { id: "url", label: "URL", icon: Link2 },
];

export function MediaPicker({
  open,
  onOpenChange,
  onPick,
  accept = "image",
  title = "Επιλογή αρχείου",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (url: string) => void;
  accept?: "image" | "video";
  title?: string;
}) {
  const [mode, setMode] = useState<Mode>("library");

  function choose(url: string) {
    onPick(url);
    onOpenChange(false);
  }

  // A video field has no business offering logos or product photography.
  const tabs = accept === "video" ? TABS.filter((t) => t.id === "library" || t.id === "url") : TABS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,64rem)] flex-col overflow-hidden sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {accept === "video"
              ? "MP4, WebM ή MOV έως 60MB."
              : "Ό,τι έχει ανέβει, τα λογότυπα των εταιριών, ή φωτογραφία προϊόντος."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex border-b border-k-line">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] transition-colors",
                mode === tab.id
                  ? "border-k-red font-medium text-k-ink"
                  : "border-transparent text-k-text-3 hover:text-k-ink",
              )}
            >
              <tab.icon className="size-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === "library" && <LibraryTab accept={accept} onPick={choose} />}
          {mode === "logos" && <LogoTab onPick={choose} />}
          {mode === "product" && <ProductTab onPick={choose} />}
          {mode === "url" && <UrlTab onPick={choose} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── Library ───────────────────────── */

function LibraryTab({
  accept,
  onPick,
}: {
  accept: "image" | "video";
  onPick: (url: string) => void;
}) {
  const [assets, setAssets] = useState<MediaAssetView[]>([]);
  const [query, setQuery] = useState("");
  const [loading, startLoad] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    startLoad(async () => setAssets(await actionListAssets({ kind: accept, query })));
  }, [accept, query]);

  useEffect(() => {
    const timer = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  async function upload(files: FileList | File[]) {
    const list = [...files];
    if (list.length === 0) return;

    setUploading(true);
    const result = await uploadFiles(list);
    setUploading(false);

    for (const error of result.failed) toast.error(error);
    if (result.added.length > 0) {
      toast.success(
        result.added.length === 1
          ? `Ανέβηκε — ${result.added[0].note}`
          : `Ανέβηκαν ${result.added.length} αρχεία.`,
      );
      load();
    }
  }

  function remove(asset: MediaAssetView) {
    startLoad(async () => {
      const result = await actionDeleteAsset(asset.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Το «${asset.name}» διαγράφηκε.`);
      load();
    });
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void upload(e.dataTransfer.files);
      }}
      className={cn("space-y-3 p-1", dragging && "outline-dashed outline-2 outline-k-red")}
    >
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση με όνομα αρχείου…"
            className="pl-8"
          />
        </div>
        <Button onClick={() => input.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          Ανέβασμα
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept === "video" ? "video/mp4,video/webm,video/quicktime" : "image/*"}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {loading && assets.length === 0 ? (
        <p className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-k-text-3">
          <Loader2 className="size-4 animate-spin" />
          Φόρτωση…
        </p>
      ) : assets.length === 0 ? (
        <div className="border border-dashed border-k-line px-6 py-16 text-center">
          <Upload className="mx-auto size-7 text-k-text-4" />
          <p className="mt-3 text-[13px] font-medium text-k-ink">
            {query ? "Κανένα αποτέλεσμα" : "Η βιβλιοθήκη είναι άδεια"}
          </p>
          <p className="mx-auto mt-1 max-w-[46ch] text-[12px] leading-[1.6] text-k-text-3">
            Σύρετε αρχεία εδώ ή πατήστε Ανέβασμα. Ό,τι ανεβάζετε μένει εδώ για την επόμενη φορά.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {assets.map((asset) => (
            <li key={asset.id} className="group relative">
              <button
                type="button"
                onClick={() => onPick(asset.url)}
                className="block w-full border border-k-line bg-white transition-colors hover:border-k-ink"
              >
                <span className="relative block aspect-square bg-k-surface-2">
                  {asset.kind === "video" ? (
                    <>
                      <video src={asset.url} muted className="size-full object-cover" />
                      <Play className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow" />
                    </>
                  ) : (
                    <Image
                      src={asset.url}
                      alt=""
                      fill
                      sizes="160px"
                      className="object-contain p-1"
                      unoptimized
                    />
                  )}
                </span>
                <span className="block truncate px-1.5 py-1 text-left text-[10.5px] text-k-text-3">
                  {asset.name}
                </span>
                <span className="numeral block px-1.5 pb-1 text-left text-[9.5px] text-k-text-5">
                  {asset.width ? `${asset.width}×${asset.height} · ` : ""}
                  {fileSize(asset.bytes)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => remove(asset)}
                className="absolute right-1 top-1 hidden bg-white/90 p-1 text-k-text-3 hover:text-k-red group-hover:block"
                aria-label={`Διαγραφή ${asset.name}`}
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Logos ───────────────────────── */

function LogoTab({ onPick }: { onPick: (url: string) => void }) {
  const [logos, setLogos] = useState<Array<{ slug: string; name: string; logo: string }>>([]);
  const [loading, start] = useTransition();

  useEffect(() => {
    start(async () => setLogos(await actionListLogos()));
  }, []);

  if (loading && logos.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-k-text-3">
        <Loader2 className="size-4 animate-spin" />
        Φόρτωση…
      </p>
    );
  }

  if (logos.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-[12.5px] text-k-text-3">
        Καμία εταιρία δεν έχει λογότυπο καταχωρημένο.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-2 p-1 sm:grid-cols-4 lg:grid-cols-6">
      {logos.map((brand) => (
        <li key={brand.slug}>
          <button
            type="button"
            onClick={() => onPick(brand.logo)}
            className="block w-full border border-k-line bg-white transition-colors hover:border-k-ink"
            title={brand.name}
          >
            {/* Logos are drawn for white and are usually transparent, so they
                get padding and a light field rather than the grey the rest of
                the grid uses. */}
            <span className="relative block aspect-[3/2] bg-white">
              <Image
                src={brand.logo}
                alt={brand.name}
                fill
                sizes="160px"
                className="object-contain p-3"
                unoptimized
              />
            </span>
            <span className="block truncate border-t border-k-line px-1.5 py-1 text-center text-[10.5px] text-k-text-3">
              {brand.name}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────── Products ───────────────────────── */

function ProductTab({ onPick }: { onPick: (url: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerProduct[]>([]);
  const [selected, setSelected] = useState<PickerProduct | null>(null);
  const [searching, start] = useTransition();

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

  if (selected) {
    return (
      <div className="space-y-3 p-1">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="flex items-center gap-1.5 text-[12px] text-k-text-3 transition-colors hover:text-k-ink"
        >
          <ArrowLeft className="size-3.5" />
          {selected.name}
        </button>
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {selected.images.map((image) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => onPick(image.url)}
                className="relative block aspect-square w-full border border-k-line bg-white transition-colors hover:border-k-ink"
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="160px"
                  className="object-contain p-1"
                  unoptimized
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
        {searching && (
          <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-k-text-4" />
        )}
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Όνομα ή κωδικός προϊόντος…"
          className="pl-8"
        />
      </div>

      {results.length === 0 ? (
        <p className="px-6 py-16 text-center text-[12.5px] text-k-text-3">
          {query.trim().length < 2 ? "Γράψτε δύο χαρακτήρες." : "Κανένα αποτέλεσμα."}
        </p>
      ) : (
        <ul className="divide-y divide-k-line border border-k-line">
          {results.map((product) => (
            <li key={product.slug}>
              <button
                type="button"
                onClick={() => setSelected(product)}
                className="flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors hover:bg-k-surface-2"
              >
                {product.images[0] && (
                  <span className="relative size-9 shrink-0 border border-k-line bg-white">
                    <Image
                      src={product.images[0].url}
                      alt=""
                      fill
                      sizes="36px"
                      className="object-contain p-0.5"
                      unoptimized
                    />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-k-ink">{product.name}</span>
                  <span className="numeral block text-[10.5px] text-k-text-4">
                    {product.code} · {product.images.length}{" "}
                    {product.images.length === 1 ? "φωτογραφία" : "φωτογραφίες"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── URL ───────────────────────── */

function UrlTab({ onPick }: { onPick: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const valid = /^https?:\/\/.+/.test(url.trim());

  return (
    <div className="space-y-3 p-1">
      <div className="space-y-1.5">
        <Label htmlFor="media-url" className="text-[11.5px]">
          Διεύθυνση αρχείου
        </Label>
        <Input
          id="media-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
        />
        <p className="text-[11px] leading-[1.5] text-k-text-4">
          Το αρχείο μένει εκεί που είναι — αν κατέβει από τον άλλο διακομιστή, κατεβαίνει και από
          το banner. Για δικά μας υλικά προτιμήστε το ανέβασμα.
        </p>
      </div>
      <Button onClick={() => onPick(url.trim())} disabled={!valid}>
        <Check className="size-3.5" />
        Χρήση
      </Button>
    </div>
  );
}

/* ───────────────────────── Field ───────────────────────── */

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
          {value && <p className="mt-1 truncate font-mono text-[10.5px] text-k-text-4">{value}</p>}
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
