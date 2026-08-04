"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Loader2, Plus, Undo2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  actionAssign,
  actionDiscardDraft,
  actionPublish,
  actionRenameBanner,
  actionResolve,
  actionSaveDraft,
  actionUnassign,
} from "@/app/admin/(protected)/banners/actions";
import {
  bannerState,
  cellVars,
  gridVars,
  resolveBands,
  sameContent,
  type BannerContent,
  type BannerView,
  type CellComposition,
  type GridCell,
} from "@/lib/banners/contract";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import { ZONES } from "@/lib/zones/registry";
import { BannerRenderer } from "@/components/banners/BannerRenderer";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { CellEditor } from "@/components/admin/banners/CellEditor";
import { PreviewModal } from "@/components/admin/banners/PreviewModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Composing one banner.
 *
 * The canvas is the real renderer against the real resolver, so a cell bound to
 * a product shows that product's name, photograph and price rather than the
 * slug somebody typed. Clicking a cell configures it.
 *
 * Draft and published are kept apart on purpose. Everything here writes to the
 * draft; the storefront keeps showing the published version until Publish is
 * pressed. The state badge calls out `modified` — a live banner with unpublished
 * edits is where somebody is most likely to assume their change is already
 * visible.
 *
 * Placements are in the rail rather than on another screen, because publishing
 * affects every zone the banner sits in and the editor has to say which those
 * are before the button is pressed.
 */

/**
 * How wide a cell is against its height, in the template's own units.
 *
 * The editing canvas has to have the cell's real proportions or every
 * composition is arranged against a shape that does not exist. A template with
 * no aspect ratio is assumed to be roughly 16:7 overall, which is what the
 * thumbnails use.
 */
function cellAspect(template: BannerView["template"], cell: GridCell): number {
  const [w, h] = (template.aspect ?? "16/7").split("/").map(Number);
  const bannerAspect = w && h ? w / h : 16 / 7;
  const unitAspect = (template.rows / template.columns) * bannerAspect;
  return (cell.w / cell.h) * unitAspect;
}

const STATE: Record<string, { label: string; className: string }> = {
  empty: { label: "Κενό", className: "bg-k-surface-3 text-k-text-3" },
  draft: { label: "Πρόχειρο", className: "bg-k-amber text-white" },
  published: { label: "Δημοσιευμένο", className: "bg-k-green text-white" },
  modified: { label: "Μη δημοσιευμένες αλλαγές", className: "bg-k-amber text-white" },
};

export function BannerEditor({
  banner,
  placements,
}: {
  banner: BannerView;
  /** zone id → the banner currently in it, for every zone that has one. */
  placements: Record<string, { id: string; name: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState(banner.name);
  const [content, setContent] = useState<BannerContent>(banner.draft ?? { cells: {} });
  const [saved, setSaved] = useState<BannerContent>(banner.draft ?? { cells: {} });
  const [editing, setEditing] = useState<GridCell | null>(null);
  const [preview, setPreview] = useState(false);
  const [resolved, setResolved] = useState<Record<string, ResolvedCell>>({});
  const [busy, start] = useTransition();

  const dirty = !sameContent(content, saved);
  const state = bannerState(content, banner.published);
  const template = banner.template;

  /* ── the canvas shows what the storefront would ── */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const next = await actionResolve(content, "el");
      if (!cancelled) setResolved(next);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [content]);

  const widgets = useMemo(() => new Map(Object.entries(resolved)), [resolved]);

  /* ── actions ── */

  function save(): Promise<boolean> {
    return new Promise((resolve) => {
      start(async () => {
        const result = await actionSaveDraft(banner.id, content);
        if (!result.ok) {
          toast.error(result.error);
          resolve(false);
          return;
        }
        setSaved(content);
        resolve(true);
      });
    });
  }

  function publish() {
    start(async () => {
      // Publishing copies the STORED draft, so an unsaved edit would publish
      // the previous version. Save first, always.
      if (dirty) {
        const written = await actionSaveDraft(banner.id, content);
        if (!written.ok) {
          toast.error(written.error);
          return;
        }
        setSaved(content);
      }
      const result = await actionPublish(banner.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.zones.length === 0
          ? "Δημοσιεύτηκε. Δεν είναι τοποθετημένο σε καμία ζώνη ακόμη."
          : `Δημοσιεύτηκε σε ${result.zones.length} ${result.zones.length === 1 ? "ζώνη" : "ζώνες"}.`,
      );
      setPreview(false);
      router.refresh();
    });
  }

  function discard() {
    start(async () => {
      const result = await actionDiscardDraft(banner.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const restored = banner.published ?? { cells: {} };
      setContent(restored);
      setSaved(restored);
      toast.success("Οι αλλαγές αναιρέθηκαν.");
      router.refresh();
    });
  }

  function rename() {
    if (name.trim() === banner.name) return;
    start(async () => {
      const result = await actionRenameBanner(banner.id, name);
      if (!result.ok) {
        toast.error(result.error);
        setName(banner.name);
        return;
      }
      router.refresh();
    });
  }

  function assign(zone: string) {
    const taken = placements[zone];
    start(async () => {
      const result = await actionAssign(zone, banner.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        taken && taken.id !== banner.id
          ? `Τοποθετήθηκε — αντικατέστησε το «${taken.name}».`
          : "Τοποθετήθηκε.",
      );
      router.refresh();
    });
  }

  function unassign(zone: string) {
    start(async () => {
      await actionUnassign(zone);
      toast.success("Αφαιρέθηκε από τη ζώνη.");
      router.refresh();
    });
  }

  const freeZones = ZONES.filter((z) => !banner.placements.includes(z.id));

  /* One data attribute per width band; the CSS picks the arrangement. */
  const bands = resolveBands(
    template.cells,
    template.rows,
    template.aspect,
    content.maxHeight,
    content.wideLayout,
  );
  const bandAttrs = {
    "data-b-tablet": bands.tablet,
    "data-b-desktop": bands.desktop,
    "data-b-wide": bands.wide,
    "data-b-ultra": bands.ultra,
  };

  return (
    <PageShell
      title={banner.name}
      description={`Πλέγμα: ${template.name} · ${template.cells.length} κελιά`}
      actions={
        <>
          <span className={cn("px-2 py-1 text-[11px] font-medium", STATE[state].className)}>
            {STATE[state].label}
          </span>
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye className="size-3.5" />
            Προεπισκόπηση
          </Button>
          <Button variant="outline" onClick={() => save().then((ok) => ok && toast.success("Αποθηκεύτηκε."))} disabled={!dirty || busy}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Αποθήκευση
          </Button>
          <Button onClick={publish} disabled={busy}>
            <Upload className="size-3.5" />
            Δημοσίευση
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Καμβάς ── */}
        <div className="space-y-3">
          <div className="relative border border-k-line bg-white">
            <BannerRenderer
              template={template}
              content={content}
              resolved={widgets}
              locale="el"
              interactive={false}
              motion={false}
            />

            {/* Στόχοι κλικ, στην ίδια γεωμετρία με τον renderer */}
            <div className="banner-shell absolute inset-0">
              <div className="banner-grid" style={gridVars(template, content.maxHeight)}
        {...bandAttrs}>
                {template.cells.map((cell, index) => {
                  const has = Boolean(content.cells[cell.id]);
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      style={{ ...cellVars(cell), order: cell.mobile?.order ?? index }}
                      onClick={() => setEditing(cell)}
                      className={cn(
                        "group flex items-center justify-center border-2 border-transparent transition-colors hover:border-k-ink/70",
                        !has && "bg-white/40",
                        cell.mobile?.hidden && "bn-mobile-hidden",
                      )}
                      aria-label={`Επεξεργασία: ${cell.name}`}
                    >
                      <span
                        className={cn(
                          "flex items-center gap-1.5 bg-k-ink px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity",
                          has && "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <Plus className="size-3" />
                        {has ? cell.name : "Προσθήκη widget"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="text-[11.5px] leading-[1.6] text-k-text-3">
            Ο καμβάς δείχνει το πραγματικό αποτέλεσμα. Κάντε κλικ σε ένα κελί για να ορίσετε τι
            δείχνει. Οι αλλαγές μένουν στο πρόχειρο μέχρι τη δημοσίευση.
          </p>
        </div>

        {/* ── Ρυθμίσεις ── */}
        <div className="space-y-4">
          <Panel title="Banner">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="bn-name" className="text-[11.5px] text-k-text-3">
                  Όνομα
                </label>
                <Input
                  id="bn-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={rename}
                  maxLength={80}
                />
              </div>
              <p className="text-[11.5px] text-k-text-3">
                Πλέγμα:{" "}
                <Link
                  href={`/admin/banners/templates/${template.id}`}
                  className="text-k-ink underline underline-offset-2"
                >
                  {template.name}
                </Link>
              </p>
              {banner.publishedAt && (
                <p className="text-[11px] text-k-text-4">
                  Τελευταία δημοσίευση:{" "}
                  {new Intl.DateTimeFormat("el-GR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "Europe/Athens",
                  }).format(new Date(banner.publishedAt))}
                  {banner.publishedBy ? ` · ${banner.publishedBy}` : ""}
                </p>
              )}
              {/*
                Height, per banner.
                ───────────────────────────────────────────────────────────
                The grid gives the arrangement; how tall it may get is this
                banner's own business — the same three-cell hero is 520px in
                one zone and 40vh in another. It sits in the draft, so it is
                previewed and published like every other edit.
              */}
              <div className="space-y-1.5">
                <label htmlFor="bn-maxh" className="text-[11.5px] text-k-text-3">
                  Μέγιστο ύψος
                </label>
                <div className="flex gap-2">
                  <Input
                    id="bn-maxh"
                    type="number"
                    min={content.maxHeight?.unit === "vh" ? 10 : 120}
                    max={content.maxHeight?.unit === "vh" ? 100 : 2000}
                    step={content.maxHeight?.unit === "vh" ? 5 : 10}
                    placeholder="Χωρίς όριο"
                    value={content.maxHeight?.value ?? ""}
                    onChange={(e) =>
                      setContent((c) => ({
                        ...c,
                        maxHeight: Number(e.target.value)
                          ? { value: Number(e.target.value), unit: c.maxHeight?.unit ?? "px" }
                          : null,
                      }))
                    }
                  />
                  <Select
                    value={content.maxHeight?.unit ?? "px"}
                    onValueChange={(unit) =>
                      setContent((c) =>
                        c.maxHeight
                          ? { ...c, maxHeight: { ...c.maxHeight, unit: unit as "px" | "vh" } }
                          : c,
                      )
                    }
                  >
                    <SelectTrigger className="w-[92px] shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="px">px</SelectItem>
                      <SelectItem value="vh">% οθόνης</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-[11px] leading-[1.5] text-k-text-4">
                  Η αναλογία του πλέγματος βγάζει το ύψος από το πλάτος, οπότε σε πλατιά
                  οθόνη το banner μεγαλώνει χωρίς όριο. Κενό = χωρίς όριο.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11.5px] text-k-text-3">Σε πλατιές οθόνες</label>
                <Select
                  value={content.wideLayout ?? "auto"}
                  onValueChange={(v) =>
                    setContent((c) => ({ ...c, wideLayout: v as "auto" | "grid" | "row" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Αυτόματα</SelectItem>
                    <SelectItem value="grid">Όπως το πλέγμα</SelectItem>
                    <SelectItem value="row">Όλα σε μία σειρά</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] leading-[1.5] text-k-text-4">
                  Πάνω από 1408px. Στο «Αυτόματα» μπαίνουν σε μία σειρά μόνο όταν το
                  ταβάνι ύψους αφήνει τα στοιβαγμένα κελιά κάτω από 240px. Κάθε κελί
                  παίρνει το πλάτος που του δίνουν οι στήλες του — ένα 8/4/4 γίνεται
                  50/25/25.
                </p>
              </div>

              {state === "modified" && (
                <Button variant="outline" onClick={discard} disabled={busy} className="w-full">
                  <Undo2 className="size-3.5" />
                  Επαναφορά στη δημοσιευμένη
                </Button>
              )}
            </div>
          </Panel>

          <Panel
            title="Τοποθέτηση"
            description="Σε ποιες ζώνες εμφανίζεται. Η δημοσίευση τις ενημερώνει όλες."
          >
            <div className="space-y-2">
              {banner.placements.length === 0 ? (
                <p className="text-[12px] leading-[1.6] text-k-text-3">
                  Δεν είναι τοποθετημένο πουθενά — δεν εμφανίζεται στο site.
                </p>
              ) : (
                <ul className="space-y-1">
                  {banner.placements.map((zone) => {
                    const def = ZONES.find((z) => z.id === zone);
                    return (
                      <li
                        key={zone}
                        className="flex items-center justify-between gap-2 border border-k-line px-2.5 py-1.5"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[12px] text-k-ink">
                            {def?.label ?? zone}
                          </span>
                          <span className="block text-[10.5px] text-k-text-4">
                            {def?.page ?? "Άγνωστη σελίδα"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => unassign(zone)}
                          className="shrink-0 p-1 text-k-text-4 transition-colors hover:text-k-red"
                          aria-label={`Αφαίρεση από ${def?.label ?? zone}`}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Select value="" onValueChange={assign}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Προσθήκη σε ζώνη…" />
                </SelectTrigger>
                <SelectContent>
                  {freeZones.map((z) => {
                    const taken = placements[z.id];
                    return (
                      <SelectItem key={z.id} value={z.id}>
                        <span className="flex flex-col items-start">
                          <span>{z.label}</span>
                          <span className="text-[10.5px] text-k-text-4">
                            {z.page}
                            {taken ? ` · θα αντικαταστήσει «${taken.name}»` : ""}
                          </span>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </Panel>
        </div>
      </div>

      <CellEditor
        cell={editing}
        composition={editing ? (content.cells[editing.id] ?? null) : null}
        resolved={editing ? resolved[editing.id] : undefined}
        // The cell's real proportions, so the editing canvas is not a lie about
        // the shape the composition has to fit.
        aspect={editing ? cellAspect(template, editing) : 16 / 9}
        onClose={() => setEditing(null)}
        onSave={(composition: CellComposition) => {
          if (!editing) return;
          setContent((c) => ({ ...c, cells: { ...c.cells, [editing.id]: composition } }));
          setEditing(null);
        }}
        onClear={() => {
          if (!editing) return;
          setContent((c) => {
            const cells = { ...c.cells };
            delete cells[editing.id];
            return { ...c, cells };
          });
          setEditing(null);
        }}
      />

      <PreviewModal
        open={preview}
        onOpenChange={setPreview}
        template={template}
        content={content}
        resolved={widgets}
        footer={
          <>
            <Button variant="outline" onClick={() => setPreview(false)}>
              Επιστροφή
            </Button>
            <Button onClick={publish} disabled={busy}>
              <Upload className="size-3.5" />
              Δημοσίευση
            </Button>
          </>
        }
      />
    </PageShell>
  );
}
