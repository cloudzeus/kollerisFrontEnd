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
  sameContent,
  type BannerContent,
  type BannerView,
  type CellWidget,
  type GridCell,
} from "@/lib/banners/contract";
import type { ResolvedWidget } from "@/lib/banners/resolve";
import { ZONES } from "@/lib/zones/registry";
import { BannerRenderer } from "@/components/banners/BannerRenderer";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { WidgetModal } from "@/components/admin/banners/WidgetModal";
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
  const [content, setContent] = useState<BannerContent>(banner.draft ?? { widgets: {} });
  const [saved, setSaved] = useState<BannerContent>(banner.draft ?? { widgets: {} });
  const [editing, setEditing] = useState<GridCell | null>(null);
  const [preview, setPreview] = useState(false);
  const [resolved, setResolved] = useState<Record<string, ResolvedWidget>>({});
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
      const restored = banner.published ?? { widgets: {} };
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
            <BannerRenderer template={template} widgets={widgets} interactive={false} />

            {/* Στόχοι κλικ, στην ίδια γεωμετρία με τον renderer */}
            <div className="banner-shell absolute inset-0">
              <div className="banner-grid" style={gridVars(template)}>
                {template.cells.map((cell) => {
                  const has = Boolean(content.widgets[cell.id]);
                  return (
                    <button
                      key={cell.id}
                      type="button"
                      style={cellVars(cell)}
                      onClick={() => setEditing(cell)}
                      className={cn(
                        "group flex items-center justify-center border-2 border-transparent transition-colors hover:border-k-ink/70",
                        !has && "bg-white/40",
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

      <WidgetModal
        cell={editing}
        widget={editing ? (content.widgets[editing.id] ?? null) : null}
        onClose={() => setEditing(null)}
        onSave={(widget: CellWidget) => {
          if (!editing) return;
          setContent((c) => ({ ...c, widgets: { ...c.widgets, [editing.id]: widget } }));
          setEditing(null);
        }}
        onClear={() => {
          if (!editing) return;
          setContent((c) => {
            const widgets = { ...c.widgets };
            delete widgets[editing.id];
            return { ...c, widgets };
          });
          setEditing(null);
        }}
      />

      <PreviewModal
        open={preview}
        onOpenChange={setPreview}
        template={template}
        widgets={widgets}
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
