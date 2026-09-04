"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  Image as ImageIcon,
  LayoutGrid,
  Play,
  Repeat,
  Scissors,
  Square,
  Trash2,
  Type,
} from "lucide-react";
import {
  DEFAULT_TEXT_STYLE,
  TOKENS,
  clampFrame,
  layerForToken,
  emptyComposition,
  newLayer,
  seedOfferLayers,
  seedProductLayers,
  type BadgeLayer,
  type ButtonLayer,
  type CellComposition,
  type ColorToken,
  type GridCell,
  type ImageLayer,
  type Layer,
  type LayerKind,
  type ShapeLayer,
  type TextLayer,
  type TickerLayer,
} from "@/lib/banners/contract";
import { CATEGORY_LABEL, PRESETS, applyPreset, type PresetCategory } from "@/lib/banners/presets";
import { actionListLogos, actionRemoveBackground } from "@/app/admin/(protected)/media/actions";
import { actionProductAssets, actionResolve } from "@/app/admin/(protected)/banners/actions";
import { uploadFiles } from "@/lib/media/upload-client";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import type { PickerProduct } from "@/lib/media/picker";
import { CompositionRenderer } from "@/components/banners/CompositionRenderer";
import { CellCanvas } from "@/components/admin/banners/CellCanvas";
import { LocalisedField, NumberField, OfferPicker, ProductCombo, Segmented } from "@/components/admin/banners/fields";
import { MediaField } from "@/components/admin/MediaPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Composing one cell.
 *
 * The canvas is the real renderer with drag targets on top; the rail is where
 * the same values get typed when a drag is not precise enough. Both edit the
 * one composition, so there is never a question of which one is authoritative.
 *
 * The gallery comes first for an empty cell. Designing a tile from an empty box
 * every time is the part nobody should have to repeat — a shelf of finished
 * looks turns that into a choice, and everything on the canvas afterwards is an
 * ordinary layer with nothing special about it.
 */

/** Private drag payloads. A plain string would collide with dragged text. */
const LAYER_MIME = "application/x-kolleris-layer";
const ASSET_MIME = "application/x-kolleris-asset";
const TOKEN_MIME = "application/x-kolleris-token";

const LAYER_ICON: Record<LayerKind, React.ComponentType<{ className?: string }>> = {
  text: Type,
  badge: Square,
  button: LayoutGrid,
  image: ImageIcon,
  shape: Square,
  ticker: Repeat,
};

const ANIMATIONS = [
  { value: "none", label: "Καμία" },
  { value: "fade", label: "Fade" },
  { value: "rise", label: "Άνοδος" },
  { value: "slide", label: "Από αριστερά" },
  { value: "scale", label: "Zoom" },
  { value: "mask", label: "Αποκάλυψη" },
  { value: "words", label: "Λέξη-λέξη" },
  { value: "chars", label: "Γράμμα-γράμμα" },
] as const;

const COLORS: Array<{ value: ColorToken; label: string; swatch: string }> = [
  { value: "ink", label: "Μαύρο", swatch: "#1a1a1c" },
  { value: "white", label: "Λευκό", swatch: "#ffffff" },
  { value: "red", label: "Κόκκινο", swatch: "#ff3333" },
  { value: "muted", label: "Γκρι", swatch: "#6e6e73" },
  { value: "white-70", label: "Λευκό 70%", swatch: "#b9b9bd" },
];

/** Demo values so a preset thumbnail reads as a design rather than as `{title}`. */
const DEMO: ResolvedCell = {
  tokens: {
    "{title}": "Κλειδί ρατσέτας 1/2\"",
    "{brand}": "FACOM",
    "{code}": "SL.171",
    "{price}": "79,26 €",
    "{compare}": "112,00 €",
    "{desc}": "Επαγγελματικό εργαλείο με σπαστό σώμα.",
    "{badge}": "-30%",
    "{ends}": "3 ημέρες",
    // A real photograph, so a thumbnail of a layout built around one is not a
    // picture of an empty rectangle.
    "{image}": "https://kolleris.b-cdn.net/mtrl-files/images/SL.171_1.webp",
  },
  href: "#",
  image: "",
  // Enough items for a ticker thumbnail to read as a rotation.
  items: [
    {
      slug: "demo-1",
      name: "Κλειδί ρατσέτας",
      image: "https://kolleris.b-cdn.net/mtrl-files/images/SL.171_1.webp",
      price: "79,26 €",
    },
    {
      slug: "demo-2",
      name: "Κατσαβίδι",
      image: "https://kolleris.b-cdn.net/mtrl-files/images/SL.171_2.webp",
      price: "24,80 €",
    },
  ],
};

/**
 * Η πραγματική αναλογία του υλικού.
 *
 * Χωρίς αυτήν, η περικοπή είναι αόρατη μέχρι να λείψει κάτι. Τα βίντεο των
 * social είναι 1080×1350 — κατακόρυφα — και μπαίνουν σε οριζόντιο κελί: το
 * `cover` πετάει σχεδόν το μισό καρέ, από πάνω και από κάτω, ακριβώς εκεί που
 * κάθεται το κείμενο που έχει ψηθεί μέσα στο βίντεο. Ο συντάκτης βλέπει το
 * κείμενο να κόβεται και δεν έχει κανέναν τρόπο να μαντέψει γιατί.
 */
function useNaturalRatio(kind: string, url: string): number | null {
  const [ratio, setRatio] = useState<number | null>(null);

  useEffect(() => {
    setRatio(null);
    if (!url || (kind !== "video" && kind !== "image")) return;
    let alive = true;

    if (kind === "video") {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.muted = true;
      el.onloadedmetadata = () => {
        if (alive && el.videoHeight) setRatio(el.videoWidth / el.videoHeight);
      };
      el.src = url;
      return () => {
        alive = false;
        // Σταματά το κατέβασμα των metadata αν αλλάξει το αρχείο νωρίς.
        el.removeAttribute("src");
      };
    }

    const img = new window.Image();
    img.onload = () => {
      if (alive && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
    };
    img.src = url;
    return () => {
      alive = false;
    };
  }, [kind, url]);

  return ratio;
}

export function CellEditor({
  cell,
  composition: initial,
  resolved: initialResolved,
  aspect,
  onClose,
  onSave,
  onClear,
}: {
  cell: GridCell | null;
  composition: CellComposition | null;
  /** What the editor had resolved when the modal opened. */
  resolved: ResolvedCell | undefined;
  aspect: number;
  onClose: () => void;
  onSave: (composition: CellComposition) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState<CellComposition>(initial ?? emptyComposition());
  const [resolved, setResolved] = useState<ResolvedCell | undefined>(initialResolved);
  const [selected, setSelected] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [motionKey, setMotionKey] = useState(0);

  /**
   * Re-resolve as the binding changes.
   *
   * The values came from the editor behind this modal, which only knows the
   * composition as it was when the modal opened. Binding a product here and
   * seeing `{title}` on the canvas until Apply is pressed is a preview that
   * lies about the thing being previewed.
   */
  useEffect(() => {
    if (!cell) return;
    const timer = setTimeout(async () => {
      const next = await actionResolve({ cells: { [cell.id]: draft } }, "el");
      setResolved(next[cell.id]);
    }, 300);
    return () => clearTimeout(timer);
  }, [cell, draft.binding, draft.href]);

  // A different cell means a different composition; the modal is one instance.
  useEffect(() => {
    if (!cell) return;
    setDraft(initial ?? emptyComposition());
    setResolved(initialResolved);
    setSelected(null);
    // An empty cell opens straight onto the shelf — that is the first decision.
    setGallery(!initial || initial.layers.length === 0);
  }, [cell, initial]);

  const layer = draft.layers.find((l) => l.id === selected) ?? null;

  /** Media behind the layers means white text; a flat light cell means ink. */
  const onDark =
    draft.background.kind === "video" ||
    draft.background.kind === "image" ||
    (draft.background.kind === "color" && draft.background.color === "ink");

  const patchLayer = (id: string, patch: Partial<Layer>) =>
    setDraft((d) => ({
      ...d,
      layers: d.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)),
    }));

  const setLayers = (layers: Layer[]) => setDraft((d) => ({ ...d, layers }));

  function addLayer(kind: LayerKind, at?: { x: number; y: number }, src?: string) {
    const created = newLayer(kind);
    if (at) {
      // Dropped things arrive centred under the pointer. Landing at the drop
      // point's top-left corner is technically simpler and feels wrong every
      // single time.
      created.frame = clampFrame({
        ...created.frame,
        x: at.x - created.frame.w / 2,
        y: at.y - created.frame.h / 2,
      });
    }
    if (src && created.kind === "image") created.src = src;
    setDraft((d) => ({ ...d, layers: [...d.layers, created] }));
    setSelected(created.id);
    return created;
  }

  /**
   * Something landed on the canvas.
   *
   * Three sources, one handler: a kind from the palette, a picture from the
   * logo rail, or files straight off the desktop. Files upload into the library
   * on the way in, so dropping a photograph onto a banner also files it for
   * next time rather than leaving a one-off URL.
   */
  function dropAt(transfer: DataTransfer, at: { x: number; y: number }) {
    const token = transfer.getData(TOKEN_MIME);
    if (token) {
      // Dressed for what it carries and for what is behind it, then centred on
      // the drop — see `layerForToken`.
      const created = layerForToken(token, onDark);
      created.frame = clampFrame({
        ...created.frame,
        x: at.x - created.frame.w / 2,
        y: at.y - created.frame.h / 2,
      });
      setDraft((d) => ({ ...d, layers: [...d.layers, created] }));
      setSelected(created.id);
      return;
    }

    const kind = transfer.getData(LAYER_MIME) as LayerKind | "";
    if (kind) {
      addLayer(kind, at);
      return;
    }

    const src = transfer.getData(ASSET_MIME);
    if (src) {
      addLayer("image", at, src);
      return;
    }

    const files = [...transfer.files];
    if (files.length === 0) return;

    setUploading(true);
    void uploadFiles(files, { folder: "banners" }).then((result) => {
      setUploading(false);
      for (const error of result.failed) toast.error(error);

      let offset = 0;
      for (const { asset } of result.added) {
        if (asset.kind === "video") {
          // A video is a background, not a floating element — there is nowhere
          // sensible to put a 40MB rectangle in the middle of a composition.
          setDraft((d) => ({
            ...d,
            background: { ...d.background, kind: "video", video: asset.url },
          }));
          toast.success("Το βίντεο μπήκε ως φόντο.");
          continue;
        }
        addLayer("image", { x: at.x + offset, y: at.y + offset }, asset.url);
        offset += 3;
      }
    });
  }

  function reorder(id: string, direction: -1 | 1) {
    setDraft((d) => {
      const index = d.layers.findIndex((l) => l.id === id);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[index], layers[next]] = [layers[next], layers[index]];
      return { ...d, layers };
    });
  }

  /** Which tokens this cell can actually print, for the hint under a text field. */
  const tokens = useMemo(
    () => TOKENS.filter((t) => (t.sources as readonly string[]).includes(draft.binding.source)),
    [draft.binding.source],
  );

  return (
    <>
      <Dialog open={cell !== null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="flex max-h-[94vh] w-[min(97vw,84rem)] flex-col overflow-hidden sm:max-w-none">
          <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <DialogTitle>{cell?.name}</DialogTitle>
              <DialogDescription>
                {cell?.w}×{cell?.h} στο πλέγμα · {draft.layers.length} στοιχεία
                {uploading && " · ανεβαίνει…"}
              </DialogDescription>
            </div>
            <Button variant="outline" onClick={() => setGallery(true)}>
              <LayoutGrid className="size-3.5" />
              Παραλλαγές
            </Button>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[minmax(0,1fr)_23rem]">
            {/* ── Καμβάς ── */}
            <div className="min-w-0 space-y-2 overflow-y-auto">
              <CellCanvas
                composition={draft}
                resolved={resolved}
                selected={selected}
                onSelect={setSelected}
                onChange={setLayers}
                onDropAt={dropAt}
                motionKey={motionKey}
                aspect={aspect}
              />

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-k-text-4">Σύρετε ή πατήστε:</span>
                {(
                  [
                    ["text", "Κείμενο"],
                    ["badge", "Badge"],
                    ["button", "Κουμπί"],
                    ["image", "Εικόνα"],
                    ["ticker", "Εναλλαγή"],
                    ["shape", "Πλαίσιο"],
                  ] as Array<[LayerKind, string]>
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    // Dragged onto the canvas it lands where it was dropped;
                    // clicked it lands where that kind of thing usually goes.
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(LAYER_MIME, kind);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => addLayer(kind)}
                    className="cursor-grab border border-k-line px-2 py-1 text-[11.5px] text-k-text-2 transition-colors hover:border-k-ink hover:text-k-ink active:cursor-grabbing"
                  >
                    + {label}
                  </button>
                ))}
              </div>

              <SourceRail
                binding={draft.binding}
                resolved={resolved}
                tokens={tokens}
              />

              <LogoRail />

              <p className="text-[11px] leading-[1.6] text-k-text-4">
                Σύρετε για μετακίνηση, τις λαβές για μέγεθος. Κουμπώνει στις άκρες και στα άλλα
                στοιχεία — κρατήστε Alt για ελεύθερη τοποθέτηση. Βελάκια για ακρίβεια, Shift για
                μεγάλα βήματα, Alt+βελάκια για μέγεθος. Ρίξτε αρχεία από τον υπολογιστή απευθείας
                πάνω στον καμβά.
              </p>
            </div>

            {/* ── Ρυθμίσεις ── */}
            <div className="min-h-0 space-y-3 overflow-y-auto border-l border-k-line pl-4">
              <LayerList
                layers={draft.layers}
                selected={selected}
                onSelect={setSelected}
                onReorder={reorder}
                onPatch={patchLayer}
                onDelete={(id) => {
                  setLayers(draft.layers.filter((l) => l.id !== id));
                  setSelected(null);
                }}
                onDuplicate={(id) => {
                  const source = draft.layers.find((l) => l.id === id);
                  if (!source) return;
                  const copy = {
                    ...structuredClone(source),
                    id: `${id}-${draft.layers.length}`,
                    name: `${source.name} 2`,
                    frame: { ...source.frame, x: source.frame.x + 3, y: source.frame.y + 3 },
                  } as Layer;
                  setDraft((d) => ({ ...d, layers: [...d.layers, copy] }));
                  setSelected(copy.id);
                }}
              />

              {layer ? (
                <LayerInspector
                  layer={layer}
                  tokens={tokens}
                  onReplay={() => setMotionKey((k) => k + 1)}
                  resolvedSrc={resolved?.tokens["{image}"] ?? ""}
                  onPatch={(patch) => patchLayer(layer.id, patch)}
                />
              ) : (
                <CellPanel draft={draft} setDraft={setDraft} aspect={aspect} />
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="ghost"
              onClick={onClear}
              className="text-k-text-3 hover:text-k-red"
              disabled={!initial}
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

      <PresetGallery
        open={gallery}
        onOpenChange={setGallery}
        binding={draft.binding.source === "products" ? "none" : draft.binding.source}
        aspect={aspect}
        onPick={(presetId) => {
          setDraft((d) => applyPreset(d, presetId));
          setSelected(null);
          setGallery(false);
        }}
      />
    </>
  );
}

/* ─────────────────────── Product set picker ─────────────────────── */

/**
 * Choosing the products a ticker rotates through.
 *
 * Order is kept and adjustable, because the order IS the running order — the
 * first product is what a visitor who never waits sees, and re-sorting by name
 * or price would quietly override that.
 */
function ProductSetPicker({
  slugs,
  onChange,
}: {
  slugs: string[];
  onChange: (slugs: string[]) => void;
}) {
  const [chosen, setChosen] = useState<Record<string, PickerProduct>>({});

  function add(product: PickerProduct) {
    setChosen((c) => ({ ...c, [product.slug]: product }));
    if (!slugs.includes(product.slug)) onChange([...slugs, product.slug]);
  }

  function move(slug: string, direction: -1 | 1) {
    const index = slugs.indexOf(slug);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= slugs.length) return;
    const next = [...slugs];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-1.5">
      <ProductCombo value="" onPick={add} />

      {slugs.length === 0 ? (
        <p className="border border-dashed border-k-line px-2.5 py-2 text-[11px] leading-[1.5] text-k-text-3">
          Κανένα προϊόν ακόμη. Προσθέστε όσα θέλετε — εμφανίζονται με τη σειρά που τα βάζετε.
        </p>
      ) : (
        <ul className="max-h-44 space-y-1 overflow-y-auto">
          {slugs.map((slug, index) => (
            <li
              key={slug}
              className="flex items-center gap-1 border border-k-line bg-white px-1.5 py-1"
            >
              <span className="numeral w-4 shrink-0 text-[10px] text-k-text-4">{index + 1}</span>
              {chosen[slug]?.images[0] && (
                <span className="relative size-6 shrink-0 border border-k-line">
                  <NextImage
                    src={chosen[slug].images[0].url}
                    alt=""
                    fill
                    sizes="24px"
                    className="object-contain p-0.5"
                    unoptimized
                  />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-[11px] text-k-ink">
                {chosen[slug]?.name ?? slug}
              </span>
              <button
                type="button"
                onClick={() => move(slug, -1)}
                disabled={index === 0}
                className="p-0.5 text-k-text-4 hover:text-k-ink disabled:opacity-30"
                aria-label="Πιο πάνω"
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => move(slug, 1)}
                disabled={index === slugs.length - 1}
                className="p-0.5 text-k-text-4 hover:text-k-ink disabled:opacity-30"
                aria-label="Πιο κάτω"
              >
                <ArrowDown className="size-3" />
              </button>
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
  );
}

/* ───────────────────────── Source rail ───────────────────────── */

/**
 * Everything the bound product or offer can lend, ready to drag.
 *
 * The cell already knows which product it shows; asking somebody to type
 * `{price}` into a text layer they first had to create is three steps for a
 * thing the editor could simply offer. Each chip drops a text layer already
 * styled for what it carries; each photograph drops an image layer.
 *
 * This is also how a product photograph gets on top of a video background —
 * the background is the cell's, the photograph is a layer, and dragging one
 * onto the other is the whole operation.
 */
function SourceRail({
  binding,
  resolved,
  tokens,
}: {
  binding: CellComposition["binding"];
  resolved: ResolvedCell | undefined;
  tokens: ReadonlyArray<{ token: string; label: string }>;
}) {
  const [images, setImages] = useState<string[]>([]);
  const [name, setName] = useState("");

  const slug =
    binding.source === "product" || binding.source === "offer" ? binding.slug : "";
  const setSize = binding.source === "products" ? binding.slugs.length : 0;

  useEffect(() => {
    if (binding.source !== "product" || !slug) {
      setImages([]);
      setName("");
      return;
    }
    let cancelled = false;
    void actionProductAssets(slug, "el").then((assets) => {
      if (cancelled || !assets) return;
      setImages(assets.images);
      setName(assets.name);
    });
    return () => {
      cancelled = true;
    };
  }, [binding.source, slug]);

  // An offer lends its two crops rather than a gallery.
  const offerImages =
    binding.source === "offer"
      ? [resolved?.tokens["{image}"], resolved?.tokens["{imageWide}"]].filter(
          (u): u is string => Boolean(u),
        )
      : [];

  const gallery = binding.source === "product" ? images : offerImages;
  if (binding.source === "products") {
    // A set lends a ticker rather than a gallery: dragging one of ten
    // photographs out of it would be picking a favourite, which is the opposite
    // of what a set is for.
    if (setSize === 0) return null;
    return (
      <div className="space-y-1.5 border border-k-line bg-k-surface-2 p-2">
        <p className="text-[11px] text-k-text-3">
          {setSize} προϊόντα — σύρετε την εναλλαγή στον καμβά
        </p>
        <button
          type="button"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(LAYER_MIME, "ticker");
            e.dataTransfer.effectAllowed = "copy";
          }}
          className="flex cursor-grab items-center gap-1.5 border border-k-line bg-white px-2 py-1 text-[11.5px] text-k-ink transition-colors hover:border-k-ink active:cursor-grabbing"
        >
          <Repeat className="size-3" />
          Εναλλαγή προϊόντων
        </button>
      </div>
    );
  }
  if (!slug || (tokens.length === 0 && gallery.length === 0)) return null;

  return (
    <div className="space-y-1.5 border border-k-line bg-k-surface-2 p-2">
      <p className="truncate text-[11px] text-k-text-3">
        Από {binding.source === "product" ? "το προϊόν" : "την προσφορά"}
        {name ? ` «${name}»` : ""} — σύρετε στον καμβά
      </p>

      {tokens.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {tokens.map((t) => {
            const value = resolved?.tokens[t.token] ?? "";
            return (
              <li key={t.token}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TOKEN_MIME, t.token);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  // The live value on the chip, not the token: an operator
                  // choosing between "{price}" and "{compare}" is guessing,
                  // while one choosing between "27,14 €" and nothing is not.
                  title={value || "Χωρίς τιμή για αυτό το προϊόν"}
                  className={cn(
                    "flex cursor-grab items-baseline gap-1.5 border bg-white px-1.5 py-1 text-[11px] transition-colors active:cursor-grabbing",
                    value
                      ? "border-k-line text-k-ink hover:border-k-ink"
                      : "border-dashed border-k-line text-k-text-5",
                  )}
                >
                  <span className="text-k-text-4">{t.label}</span>
                  {value && <span className="numeral max-w-[9rem] truncate">{value}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {gallery.length > 0 && (
        <ul className="scroll-slim flex gap-1.5 overflow-x-auto pb-1">
          {gallery.map((url) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(ASSET_MIME, url);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                className="relative block size-12 cursor-grab border border-k-line bg-white transition-colors hover:border-k-ink active:cursor-grabbing"
              >
                <NextImage
                  src={url}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-contain p-0.5"
                  unoptimized
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Logo rail ───────────────────────── */

/**
 * Every brand's logo, one drag away.
 *
 * They are already on the CDN and already the right ones. A marketing team
 * hunting through a shared drive for the FACOM logo will eventually use a wrong
 * or outdated version, and that is a supplier problem rather than a design one.
 */
function LogoRail() {
  const [logos, setLogos] = useState<Array<{ slug: string; name: string; logo: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void actionListLogos().then((rows) => {
      if (!cancelled) setLogos(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (logos.length === 0) return null;

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-k-text-4">Λογότυπα — σύρετε στον καμβά</p>
      <ul className="scroll-slim flex gap-1.5 overflow-x-auto pb-1">
        {logos.map((brand) => (
          <li key={brand.slug} className="shrink-0">
            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_MIME, brand.logo);
                e.dataTransfer.effectAllowed = "copy";
              }}
              title={brand.name}
              className="relative block size-12 cursor-grab border border-k-line bg-white transition-colors hover:border-k-ink active:cursor-grabbing"
            >
              <NextImage
                src={brand.logo}
                alt={brand.name}
                fill
                sizes="48px"
                className="object-contain p-1.5"
                unoptimized
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── Layer list ───────────────────────── */

function LayerList({
  layers,
  selected,
  onSelect,
  onReorder,
  onPatch,
  onDelete,
  onDuplicate,
}: {
  layers: Layer[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  onReorder: (id: string, direction: -1 | 1) => void;
  onPatch: (id: string, patch: Partial<Layer>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  if (layers.length === 0) {
    return (
      <p className="border border-dashed border-k-line px-3 py-3 text-[11.5px] leading-[1.6] text-k-text-3">
        Κανένα στοιχείο. Διαλέξτε παραλλαγή ή προσθέστε ένα από κάτω.
      </p>
    );
  }

  return (
    <div className="border border-k-line">
      <p className="border-b border-k-line px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-k-text-4">
        Στοιχεία · από πίσω προς τα εμπρός
      </p>
      <ul>
        {layers.map((layer, index) => {
          const Icon = LAYER_ICON[layer.kind];
          return (
            <li
              key={layer.id}
              className={cn(
                "flex items-center gap-1 border-b border-k-line px-1.5 py-1 last:border-0",
                selected === layer.id && "bg-k-surface-2",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(layer.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
              >
                <Icon className="size-3 shrink-0 text-k-text-4" />
                <span
                  className={cn(
                    "truncate text-[11.5px]",
                    layer.hidden ? "text-k-text-5 line-through" : "text-k-ink",
                  )}
                >
                  {layer.name}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onPatch(layer.id, { hidden: !layer.hidden })}
                className="p-1 text-k-text-4 hover:text-k-ink"
                aria-label={layer.hidden ? "Εμφάνιση" : "Απόκρυψη"}
              >
                {layer.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              </button>
              <button
                type="button"
                onClick={() => onReorder(layer.id, -1)}
                disabled={index === 0}
                className="p-1 text-k-text-4 hover:text-k-ink disabled:opacity-30"
                aria-label="Πιο πίσω"
              >
                <ArrowDown className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => onReorder(layer.id, 1)}
                disabled={index === layers.length - 1}
                className="p-1 text-k-text-4 hover:text-k-ink disabled:opacity-30"
                aria-label="Πιο μπροστά"
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => onDuplicate(layer.id)}
                className="p-1 text-k-text-4 hover:text-k-ink"
                aria-label="Αντιγραφή"
              >
                <Copy className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => onDelete(layer.id)}
                className="p-1 text-k-text-4 hover:text-k-red"
                aria-label="Διαγραφή"
              >
                <Trash2 className="size-3" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────────────────────── Cell panel ───────────────────────── */

function CellPanel({
  draft,
  setDraft,
  /** Η αναλογία του κελιού όπως θα αποδοθεί — το μέτρο σύγκρισης για την
   *  περικοπή του φόντου. */
  aspect,
}: {
  draft: CellComposition;
  setDraft: React.Dispatch<React.SetStateAction<CellComposition>>;
  aspect: number;
}) {
  const bg = draft.background;

  /*
   * Πόσο από το καρέ επιβιώνει.
   * ─────────────────────────────────────────────────────────────────────────
   * Το `cover` κλιμακώνει ώστε να γεμίσει και ΔΥΟ διαστάσεις, οπότε ό,τι
   * περισσεύει στη μία κόβεται συμμετρικά. Ο λόγος των δύο αναλογιών δίνει
   * ακριβώς το ποσοστό που μένει ορατό. Κάτω από 80% το θεωρούμε αρκετά για
   * να το πούμε — πάνω από αυτό η περικοπή είναι διακοσμητική άκρη.
   */
  const naturalRatio = useNaturalRatio(bg.kind, bg.kind === "video" ? bg.video : bg.image);
  const cropWarning = useMemo(() => {
    if (!naturalRatio || !aspect || (bg.fit ?? "cover") !== "cover") return null;
    const visible = Math.min(naturalRatio, aspect) / Math.max(naturalRatio, aspect);
    if (visible > 0.8) return null;
    return {
      visible: Math.round(visible * 100),
      where: naturalRatio < aspect ? "πάνω και κάτω" : "αριστερά και δεξιά",
    };
  }, [naturalRatio, aspect, bg.fit]);
  const setBg = (patch: Partial<CellComposition["background"]>) =>
    setDraft((d) => ({ ...d, background: { ...d.background, ...patch } }));

  return (
    <div className="space-y-4">
      {/* ── Δεδομένα ── */}
      <section className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-k-text-4">
          Δεδομένα κελιού
        </p>
        <Segmented
          value={draft.binding.source}
          onChange={(source) =>
            setDraft((d) => ({
              ...d,
              binding:
                source === "none"
                  ? { source: "none" }
                  : source === "products"
                    ? { source: "products", slugs: [] }
                    : { source, slug: "" },
              // A cell that has never been composed gets the matching starter
              // layers; one that has is left alone, since replacing somebody's
              // work as a side effect of changing a dropdown is never right.
              layers:
                d.layers.length > 0
                  ? d.layers
                  : source === "product"
                    ? seedProductLayers()
                    : source === "offer"
                      ? seedOfferLayers()
                      : d.layers,
            }))
          }
          options={[
            { value: "none" as const, label: "Ελεύθερο" },
            { value: "product" as const, label: "Προϊόν" },
            { value: "offer" as const, label: "Προσφορά" },
            { value: "products" as const, label: "Πολλά" },
          ]}
        />

        {draft.binding.source === "product" && (
          <ProductCombo
            value={draft.binding.slug}
            onPick={(p) => setDraft((d) => ({ ...d, binding: { source: "product", slug: p.slug } }))}
          />
        )}
        {draft.binding.source === "products" && (
          <ProductSetPicker
            slugs={draft.binding.slugs}
            onChange={(slugs) => setDraft((d) => ({ ...d, binding: { source: "products", slugs } }))}
          />
        )}
        {draft.binding.source === "offer" && (
          <OfferPicker
            value={draft.binding.slug}
            onPick={(o) => setDraft((d) => ({ ...d, binding: { source: "offer", slug: o.slug } }))}
          />
        )}
        {draft.binding.source === "products" ? (
          <div className="space-y-1">
            <Label className="text-[11px] text-k-text-3">Σύνδεσμος</Label>
            <Input
              value={draft.href}
              onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
              className="h-8 text-[12px]"
              placeholder="/prosfores"
            />
            <p className="text-[10.5px] leading-[1.5] text-k-text-4">
              Το κελί δείχνει πολλά προϊόντα, οπότε οδηγεί σε μία σελίδα που τα περιέχει — όχι στο
              καθένα ξεχωριστά.
            </p>
          </div>
        ) : draft.binding.source === "none" ? (
          <div className="space-y-1">
            <Label className="text-[11px] text-k-text-3">Σύνδεσμος</Label>
            <Input
              value={draft.href}
              onChange={(e) => setDraft((d) => ({ ...d, href: e.target.value }))}
              className="h-8 text-[12px]"
              placeholder="/katalogos"
            />
          </div>
        ) : (
          <p className="text-[10.5px] leading-[1.5] text-k-text-4">
            Ο σύνδεσμος προκύπτει από{" "}
            {draft.binding.source === "product" ? "το προϊόν" : "την προσφορά"} — δεν γράφεται.
          </p>
        )}
      </section>

      {/* ── Φόντο ── */}
      <section className="space-y-2 border-t border-k-line pt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-k-text-4">
          Φόντο · καλύπτει όλο το κελί
        </p>
        <Segmented
          value={bg.kind}
          onChange={(kind) => setBg({ kind })}
          options={[
            { value: "none" as const, label: "Χωρίς" },
            { value: "color" as const, label: "Χρώμα" },
            { value: "image" as const, label: "Εικόνα" },
            { value: "video" as const, label: "Βίντεο" },
          ]}
        />

        {(bg.kind === "color" || bg.kind === "none") && (
          <ColorPicker label="Χρώμα" value={bg.color} onChange={(color) => setBg({ color })} />
        )}

        {bg.kind === "image" && (
          <>
            <Segmented
              label="Πηγή"
              value={bg.image === "{image}" ? "bound" : "custom"}
              onChange={(mode) => setBg({ image: mode === "bound" ? "{image}" : "" })}
              options={[
                { value: "bound", label: "Από το προϊόν/προσφορά" },
                { value: "custom", label: "Δική μου" },
              ]}
            />
            {bg.image !== "{image}" && (
              <MediaField
                label="Εικόνα φόντου"
                value={bg.image}
                onChange={(url) => setBg({ image: url })}
              />
            )}
          </>
        )}

        {bg.kind === "video" && (
          <>
            <MediaField
              label="Βίντεο"
              accept="video"
              value={bg.video}
              onChange={(url) => setBg({ video: url })}
            />
            <MediaField
              label="Πρώτο καρέ"
              value={bg.poster}
              onChange={(url) => setBg({ poster: url })}
            />
          </>
        )}

        {(bg.kind === "image" || bg.kind === "video") && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label="Κάδρο X"
                value={bg.focus.x}
                min={0}
                max={100}
                suffix="%"
                onChange={(x) => setBg({ focus: { ...bg.focus, x } })}
              />
              <NumberField
                label="Κάδρο Y"
                value={bg.focus.y}
                min={0}
                max={100}
                suffix="%"
                onChange={(y) => setBg({ focus: { ...bg.focus, y } })}
              />
              <NumberField
                label="Ζουμ"
                value={bg.scale}
                min={100}
                max={200}
                suffix="%"
                onChange={(scale) => setBg({ scale })}
              />
            </div>
            <p className="text-[10.5px] leading-[1.5] text-k-text-4">
              Το κάδρο μετακινεί την περικοπή, όχι την εικόνα — για φωτογραφίες με το θέμα εκτός
              κέντρου.
            </p>
            {/*
              Πάνω από τη σκίαση, κάτω από το κάδρο.
              ──────────────────────────────────────────────────────────────
              Ανήκει δίπλα στο κάδρο και στο ζουμ, γιατί και τα τρία απαντούν
              στο ίδιο ερώτημα — τι φαίνεται από το υλικό. Το «Ολόκληρο»
              κάνει το κάδρο άχρηστο (δεν περισσεύει τίποτα να μετακινηθεί),
              γι' αυτό η επεξήγηση το λέει αντί να τα κρύψει σιωπηλά.
            */}
            <Segmented
              label="Προσαρμογή"
              value={bg.fit ?? "cover"}
              onChange={(fit) => setBg({ fit })}
              options={[
                { value: "cover" as const, label: "Γέμισμα" },
                { value: "contain" as const, label: "Ολόκληρο" },
              ]}
            />
            {cropWarning && (
              <p className="flex items-start gap-1.5 border border-k-amber/40 bg-k-amber/10 px-2.5 py-2 text-[10.5px] leading-[1.5] text-k-ink">
                <AlertTriangle className="mt-px size-3 shrink-0 text-k-amber" />
                <span>
                  Με «Γέμισμα» φαίνεται το{" "}
                  <span className="numeral font-medium">{cropWarning.visible}%</span> του καρέ —
                  κόβεται {cropWarning.where}. Αν το υλικό έχει κείμενο ή λογότυπο μέσα του, θα
                  χαθεί. Διαλέξτε «Ολόκληρο», ή δώστε στο banner ύψος που να ταιριάζει στο υλικό.
                </span>
              </p>
            )}
            <p className="text-[10.5px] leading-[1.5] text-k-text-4">
              «Γέμισμα» πιάνει όλο το κελί και κόβει ό,τι περισσεύει — για φωτογραφίες.
              «Ολόκληρο» δείχνει ακέραιο το καρέ, με κενό γύρω· η σωστή επιλογή για βίντεο ή
              λογότυπο, όπου το κόψιμο χάνει το θέμα. Με «Ολόκληρο» το κάδρο δεν κάνει τίποτα.
            </p>
            <Segmented
              label="Σκίαση"
              value={bg.overlay}
              onChange={(overlay) => setBg({ overlay })}
              options={[
                { value: "none" as const, label: "—" },
                { value: "light" as const, label: "Ελαφριά" },
                { value: "medium" as const, label: "Μεσαία" },
                { value: "strong" as const, label: "Έντονη" },
              ]}
            />
            <label className="flex items-center justify-between gap-2 border border-k-line px-2.5 py-1.5">
              <span className="text-[11.5px] text-k-ink">Αργή κίνηση φόντου</span>
              <Switch
                checked={bg.kenBurns}
                onCheckedChange={(kenBurns) => setBg({ kenBurns })}
                aria-label="Αργή κίνηση φόντου"
              />
            </label>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Cut the subject out of this layer's picture.
 *
 * A new file every time, never a replacement: the version with its background
 * is usually still right somewhere else, and overwriting would change banners
 * nobody was editing.
 *
 * A layer showing `{image}` follows whichever product the cell is bound to. A
 * cutout is one specific picture, so accepting one stops that following — which
 * the button says out loud, because discovering it later looks like a bug.
 */
function CutoutButton({
  src,
  resolvedSrc,
  onDone,
}: {
  src: string;
  resolvedSrc: string;
  onDone: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const bound = src === "{image}";
  const target = bound ? resolvedSrc : src;

  if (!target) return null;

  function run() {
    setBusy(true);
    void actionRemoveBackground(target, "layer").then((result) => {
      setBusy(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onDone(result.asset.url);
      toast.success(`Το φόντο αφαιρέθηκε — ${result.note}`);
    });
  }

  return (
    <div className="space-y-1">
      <Button variant="outline" onClick={run} disabled={busy} className="w-full">
        <Scissors className="size-3.5" />
        {busy ? "Αφαίρεση φόντου…" : "Αφαίρεση φόντου"}
      </Button>
      <p className="text-[10.5px] leading-[1.5] text-k-text-4">
        {bound
          ? "Δημιουργεί νέο αρχείο· το στοιχείο παύει να ακολουθεί το προϊόν του κελιού."
          : "Δημιουργεί νέο αρχείο στη βιβλιοθήκη. Το πρωτότυπο μένει ως έχει."}
      </p>
    </div>
  );
}

/* ───────────────────────── Inspector ───────────────────────── */

function LayerInspector({
  layer,
  tokens,
  resolvedSrc,
  onReplay,
  onPatch,
}: {
  layer: Layer;
  tokens: ReadonlyArray<{ token: string; label: string }>;
  /** What `{image}` currently points at, so a bound layer can still be cut out. */
  resolvedSrc: string;
  onReplay: () => void;
  onPatch: (patch: Partial<Layer>) => void;
}) {
  const hasText = layer.kind === "text" || layer.kind === "badge" || layer.kind === "button";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          value={layer.name}
          onChange={(e) => onPatch({ name: e.target.value } as Partial<Layer>)}
          className="h-7 border-transparent bg-transparent px-1 text-[12px] font-medium shadow-none focus-visible:border-k-line focus-visible:bg-white"
          aria-label="Όνομα στοιχείου"
        />
      </div>

      {/* ── Περιεχόμενο ── */}
      {hasText && (
        <LocalisedField
          label="Κείμενο"
          value={(layer as TextLayer).text}
          onChange={(text) => onPatch({ text } as Partial<Layer>)}
          maxChars={layer.kind === "text" ? 160 : 40}
          multiline={layer.kind === "text"}
          hint={
            tokens.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {tokens.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    onClick={() =>
                      onPatch({
                        text: {
                          ...(layer as TextLayer).text,
                          el: `${(layer as TextLayer).text.el ?? ""}${t.token}`,
                        },
                      } as Partial<Layer>)
                    }
                    className="border border-k-line px-1 py-0.5 font-mono text-[9.5px] text-k-text-3 transition-colors hover:border-k-ink hover:text-k-ink"
                    title={`Ζωντανή τιμή: ${t.label}`}
                  >
                    {t.token}
                  </button>
                ))}
              </div>
            ) : null
          }
        />
      )}

      {layer.kind === "image" && (
        <>
          <Segmented
            label="Πηγή"
            value={layer.src === "{image}" ? "bound" : "custom"}
            onChange={(mode) => onPatch({ src: mode === "bound" ? "{image}" : "" } as Partial<Layer>)}
            options={[
              { value: "bound", label: "Από το προϊόν" },
              { value: "custom", label: "Δική μου" },
            ]}
          />
          {layer.src !== "{image}" && (
            <MediaField
              label="Εικόνα"
              value={layer.src}
              onChange={(src) => onPatch({ src } as Partial<Layer>)}
            />
          )}
          <Segmented
            label="Προσαρμογή"
            value={layer.fit}
            onChange={(fit) => onPatch({ fit } as Partial<Layer>)}
            options={[
              { value: "contain" as const, label: "Ολόκληρη" },
              { value: "cover" as const, label: "Γέμισμα" },
            ]}
          />
          <NumberField
            label="Διαφάνεια"
            value={layer.opacity}
            min={0}
            max={100}
            suffix="%"
            onChange={(opacity) => onPatch({ opacity } as Partial<Layer>)}
          />
          <CutoutButton
            src={layer.src}
            resolvedSrc={resolvedSrc}
            onDone={(url) => onPatch({ src: url } as Partial<Layer>)}
          />
        </>
      )}

      {layer.kind === "ticker" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Ρυθμός"
              value={layer.interval}
              min={800}
              max={10000}
              step={250}
              suffix="ms"
              onChange={(interval) => onPatch({ interval } as Partial<Layer>)}
            />
            <Segmented
              label="Εναλλαγή"
              value={layer.effect}
              onChange={(effect) => onPatch({ effect } as Partial<Layer>)}
              options={[
                { value: "fade" as const, label: "Fade" },
                { value: "slide" as const, label: "Slide" },
              ]}
            />
          </div>
          <Segmented
            label="Προσαρμογή"
            value={layer.fit}
            onChange={(fit) => onPatch({ fit } as Partial<Layer>)}
            options={[
              { value: "contain" as const, label: "Ολόκληρη" },
              { value: "cover" as const, label: "Γέμισμα" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between gap-2 border border-k-line px-2.5 py-1.5">
              <span className="text-[11.5px] text-k-ink">Όνομα</span>
              <Switch
                checked={layer.showName}
                onCheckedChange={(showName) => onPatch({ showName } as Partial<Layer>)}
                aria-label="Όνομα προϊόντος"
              />
            </label>
            <label className="flex items-center justify-between gap-2 border border-k-line px-2.5 py-1.5">
              <span className="text-[11.5px] text-k-ink">Τιμή</span>
              <Switch
                checked={layer.showPrice}
                onCheckedChange={(showPrice) => onPatch({ showPrice } as Partial<Layer>)}
                aria-label="Τιμή προϊόντος"
              />
            </label>
          </div>
          <p className="text-[10.5px] leading-[1.5] text-k-text-4">
            Δείχνει τα προϊόντα του κελιού ένα-ένα. Σταματά όσο ο επισκέπτης έχει τον δείκτη πάνω
            του.
          </p>
        </>
      )}

      {layer.kind === "shape" && (
        <>
          <ColorPicker
            label="Χρώμα"
            value={layer.color}
            onChange={(color) => onPatch({ color } as Partial<Layer>)}
          />
          <NumberField
            label="Διαφάνεια"
            value={layer.opacity}
            min={0}
            max={100}
            suffix="%"
            onChange={(opacity) => onPatch({ opacity } as Partial<Layer>)}
          />
        </>
      )}

      {layer.kind === "badge" && (
        <Segmented
          label="Χρώμα"
          value={layer.tone}
          onChange={(tone) => onPatch({ tone } as Partial<Layer>)}
          options={[
            { value: "red" as const, label: "Κόκκ." },
            { value: "ink" as const, label: "Μαύρο" },
            { value: "amber" as const, label: "Πορτ." },
            { value: "green" as const, label: "Πράσ." },
            { value: "white" as const, label: "Λευκό" },
          ]}
        />
      )}

      {layer.kind === "button" && (
        <div className="space-y-1">
          <Label className="text-[11px] text-k-text-3">Σύνδεσμος</Label>
          <Input
            value={layer.href}
            onChange={(e) => onPatch({ href: e.target.value } as Partial<Layer>)}
            className="h-8 text-[12px]"
            placeholder="Ίδιος με το κελί"
          />
          <p className="text-[10.5px] leading-[1.5] text-k-text-4">
            {layer.href
              ? "Το κουμπί έχει δικό του προορισμό, οπότε το υπόλοιπο κελί παύει να είναι σύνδεσμος."
              : "Κενό: ακολουθεί τον προορισμό του κελιού."}
          </p>
        </div>
      )}

      {layer.kind === "button" && (
        <Segmented
          label="Στυλ"
          value={layer.variant}
          onChange={(variant) => onPatch({ variant } as Partial<Layer>)}
          options={[
            { value: "underline" as const, label: "Υπογράμμιση" },
            { value: "solid" as const, label: "Γεμάτο" },
            { value: "outline" as const, label: "Περίγραμμα" },
          ]}
        />
      )}

      {/* ── Τυπογραφία ── */}
      {hasText && <Typography layer={layer} onPatch={onPatch} />}

      {/* ── Θέση ── */}
      <section className="space-y-2 border-t border-k-line pt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-k-text-4">
          Θέση & μέγεθος
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {(["x", "y", "w", "h"] as const).map((key) => (
            <NumberField
              key={key}
              label={key.toUpperCase()}
              value={layer.frame[key]}
              step={0.5}
              suffix="%"
              onChange={(value) => onPatch({ frame: { ...layer.frame, [key]: value } } as Partial<Layer>)}
            />
          ))}
        </div>
      </section>

      {/* ── Κίνηση ── */}
      <section className="space-y-2 border-t border-k-line pt-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-k-text-4">Κίνηση</p>
        <div className="grid grid-cols-2 gap-1">
          {ANIMATIONS.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => {
                onPatch({ anim: { ...layer.anim, preset: a.value } } as Partial<Layer>);
                // Play it here, now. Picking an entrance and seeing nothing is
                // indistinguishable from a control that does not work.
                setTimeout(onReplay, 60);
              }}
              className={cn(
                "border px-2 py-1 text-[11px] transition-colors",
                layer.anim.preset === a.value
                  ? "border-k-ink bg-k-ink text-white"
                  : "border-k-line text-k-text-2 hover:border-k-ink hover:text-k-ink",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
        {layer.anim.preset !== "none" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Καθυστέρηση"
                value={layer.anim.delay}
                min={0}
                max={3000}
                step={50}
                suffix="ms"
                onChange={(delay) => onPatch({ anim: { ...layer.anim, delay } } as Partial<Layer>)}
              />
              <NumberField
                label="Διάρκεια"
                value={layer.anim.duration}
                min={100}
                max={3000}
                step={50}
                suffix="ms"
                onChange={(duration) =>
                  onPatch({ anim: { ...layer.anim, duration } } as Partial<Layer>)
                }
              />
            </div>
            <Button variant="outline" onClick={onReplay} className="w-full">
              <Play className="size-3.5" />
              Δοκιμή
            </Button>
            <p className="text-[10.5px] leading-[1.5] text-k-text-4">
              Στο site παίζει μία φορά, όταν το banner μπει στην οθόνη.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function Typography({
  layer,
  onPatch,
}: {
  layer: TextLayer | BadgeLayer | ButtonLayer;
  onPatch: (patch: Partial<Layer>) => void;
}) {
  const style = layer.style;
  const patchStyle = (patch: Record<string, unknown>) =>
    onPatch({ style: { ...style, ...patch } } as Partial<Layer>);

  return (
    <section className="space-y-2 border-t border-k-line pt-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-k-text-4">
        Τυπογραφία
      </p>

      {/* The three faces the site actually uses. Nothing else is on offer —
          a banner in a fourth typeface is the fastest way to look like a
          different company. */}
      <Segmented
        label="Γραμματοσειρά"
        value={style.font}
        onChange={(font) => patchStyle({ font })}
        options={[
          { value: "display" as const, label: "Τίτλων", title: "Artegra — τίτλοι" },
          { value: "sans" as const, label: "Κειμένου", title: "IBM Plex Sans" },
          { value: "mono" as const, label: "Αριθμών", title: "Noto Sans Mono — τιμές, κωδικοί" },
        ]}
      />

      <div className="grid grid-cols-3 gap-1.5">
        <NumberField
          label="Μέγεθος"
          value={style.size}
          min={8}
          max={140}
          onChange={(size) => patchStyle({ size })}
        />
        <NumberField
          label="Βάρος"
          value={style.weight}
          min={400}
          max={700}
          step={100}
          onChange={(weight) => patchStyle({ weight })}
        />
        <NumberField
          label="Απόσταση"
          value={style.tracking}
          min={-10}
          max={30}
          onChange={(tracking) => patchStyle({ tracking })}
        />
      </div>
      <p className="text-[10.5px] leading-[1.5] text-k-text-4">
        Το μέγεθος είναι σε κελί πλάτους 1000px και κλιμακώνεται μαζί του.
      </p>

      {layer.kind === "text" && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              label="Ύψος γραμμής"
              value={layer.style.leading}
              min={90}
              max={220}
              step={5}
              suffix="%"
              onChange={(leading) => patchStyle({ leading })}
            />
            <ColorPicker
              label="Χρώμα"
              value={layer.style.color}
              onChange={(color) => patchStyle({ color })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Segmented
              label="Στοίχιση"
              value={layer.style.align}
              onChange={(align) => patchStyle({ align })}
              options={[
                { value: "left" as const, label: "◧" },
                { value: "center" as const, label: "◫" },
                { value: "right" as const, label: "◨" },
              ]}
            />
            <Segmented
              label="Κάθετα"
              value={layer.style.valign}
              onChange={(valign) => patchStyle({ valign })}
              options={[
                { value: "start" as const, label: "⬒" },
                { value: "center" as const, label: "⬓" },
                { value: "end" as const, label: "⬔" },
              ]}
            />
          </div>
        </>
      )}

      {layer.kind === "button" && (
        <ColorPicker
          label="Χρώμα"
          value={layer.style.color}
          onChange={(color) => patchStyle({ color })}
        />
      )}

      <label className="flex items-center justify-between gap-2 border border-k-line px-2.5 py-1.5">
        <span className="text-[11.5px] text-k-ink">ΚΕΦΑΛΑΙΑ</span>
        <Switch
          checked={style.uppercase}
          onCheckedChange={(uppercase) => patchStyle({ uppercase })}
          aria-label="Κεφαλαία"
        />
      </label>
    </section>
  );
}

function ColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ColorToken;
  onChange: (value: ColorToken) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] uppercase tracking-[0.06em] text-k-text-4">{label}</Label>
      <div className="flex gap-1">
        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onClick={() => onChange(c.value)}
            className={cn(
              "size-6 border transition-transform",
              value === c.value ? "border-k-ink ring-1 ring-k-ink" : "border-k-line-2",
            )}
            style={{ backgroundColor: c.swatch }}
            aria-label={c.label}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Gallery ───────────────────────── */

function PresetGallery({
  open,
  onOpenChange,
  binding,
  aspect,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  binding: "none" | "product" | "offer";
  aspect: number;
  onPick: (presetId: string) => void;
}) {
  // Looks meant for this cell's data come first; the rest stay available,
  // because "meant for" is a hint and somebody will have a reason.
  const sorted = useMemo(() => {
    const suited = PRESETS.filter((p) => p.suits.includes(binding));
    const rest = PRESETS.filter((p) => !p.suits.includes(binding));
    return [...suited, ...rest];
  }, [binding]);

  const categories = [...new Set(sorted.map((p) => p.category))] as PresetCategory[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(95vw,72rem)] overflow-y-auto sm:max-w-none">
        <DialogHeader>
          <DialogTitle>Παραλλαγές</DialogTitle>
          <DialogDescription>
            Έτοιμες συνθέσεις. Διαλέξτε μία και μετά αλλάξτε ό,τι θέλετε πάνω στον καμβά.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {categories.map((category) => (
            <section key={category} className="space-y-2">
              <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-k-text-4">
                {CATEGORY_LABEL[category]}
              </p>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sorted
                  .filter((p) => p.category === category)
                  .map((preset) => {
                    const built = preset.build();
                    return (
                      <li key={preset.id}>
                        <button
                          type="button"
                          onClick={() => onPick(preset.id)}
                          className="group w-full border border-k-line text-left transition-colors hover:border-k-ink"
                        >
                          {/* The thumbnail is the preset itself, rendered by the
                              same component the storefront uses. */}
                          <span
                            className="block w-full overflow-hidden bg-k-surface-3"
                            style={{ aspectRatio: aspect }}
                          >
                            <CompositionRenderer
                              composition={{
                                binding: { source: "none" },
                                background: built.background,
                                layers: built.layers,
                                href: "#",
                              }}
                              resolved={DEMO}
                              locale="el"
                              interactive={false}
                            />
                          </span>
                          <span className="block px-2.5 py-2">
                            <span className="block text-[12px] font-medium text-k-ink">
                              {preset.label}
                            </span>
                            <span className="block text-[10.5px] leading-[1.5] text-k-text-4">
                              {preset.hint}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_TEXT_STYLE };
