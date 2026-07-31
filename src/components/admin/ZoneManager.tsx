"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye,
  EyeOff,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import {
  actionAdd,
  actionRemove,
  actionReorder,
  actionToggle,
  actionUpdate,
} from "@/app/admin/(protected)/zones/actions";
import {
  WIDGETS,
  WIDGETS_BY_TYPE,
  propText,
  type WidgetInstance,
  type ZoneDef,
} from "@/lib/zones/registry";
import { cn } from "@/lib/utils";
import { WidgetForm, type Props } from "@/components/admin/WidgetForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Arranging one zone.
 *
 * Drag to reorder, click to edit in a side sheet, toggle without deleting. The
 * sheet rather than a modal is deliberate — editing a widget is a task somebody
 * does while looking at where it sits in the list, and a centred dialog covers
 * exactly that.
 *
 * Order is persisted on drop rather than behind a save button. A list that
 * silently reverts because nobody pressed save is the worst outcome available
 * here, and reordering is trivially reversible by dragging back.
 *
 * Disabling is offered next to deleting because "take it off the page for now"
 * is far more common than "throw the settings away", and only one of those is
 * recoverable.
 */

export function ZoneManager({
  zone,
  widgets: initial,
}: {
  zone: ZoneDef;
  widgets: WidgetInstance[];
}) {
  const [widgets, setWidgets] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WidgetInstance | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WidgetInstance | null>(null);
  const [pending, start] = useTransition();

  const sensors = useSensors(
    // 6px of slack, or a click on the drag handle registers as a tiny drag and
    // the row never opens.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const full = zone.max != null && widgets.length >= zone.max;

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = widgets.findIndex((w) => w.id === active.id);
    const to = widgets.findIndex((w) => w.id === over.id);
    const next = arrayMove(widgets, from, to);
    setWidgets(next);

    start(async () => {
      const result = await actionReorder(zone.id, next.map((w) => w.id));
      if (!result.ok) {
        setWidgets(widgets); // put it back rather than leave the UI lying
        toast.error(result.error);
      }
    });
  }

  function add(type: string) {
    start(async () => {
      const result = await actionAdd(zone.id, type);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAdding(false);
      toast.success("Προστέθηκε. Συμπληρώστε τα στοιχεία του.");
      // Reload rather than guess the server's generated id and defaults.
      window.location.reload();
    });
  }

  function save(id: string, props: Props) {
    start(async () => {
      const result = await actionUpdate(id, props);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setWidgets((ws) => ws.map((w) => (w.id === id ? { ...w, props } : w)));
      setEditing(null);
      toast.success("Αποθηκεύτηκε.");
    });
  }

  function toggle(w: WidgetInstance) {
    const next = !w.enabled;
    setWidgets((ws) => ws.map((x) => (x.id === w.id ? { ...x, enabled: next } : x)));
    start(async () => {
      await actionToggle(w.id, next);
      toast.success(next ? "Εμφανίζεται στη σελίδα." : "Αποκρύφθηκε από τη σελίδα.");
    });
  }

  function remove(w: WidgetInstance) {
    setConfirmDelete(null);
    start(async () => {
      await actionRemove(w.id);
      setWidgets((ws) => ws.filter((x) => x.id !== w.id));
      toast.success("Διαγράφηκε.");
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px] text-k-text-3">
          <Badge className="bg-k-surface-3 text-k-text-2">{LAYOUT_LABEL[zone.layout]}</Badge>
          <span>
            {widgets.length}
            {zone.max != null ? ` από ${zone.max}` : ""} widgets
          </span>
          {pending && <Loader2 className="size-3 animate-spin" />}
        </div>

        <Button size="sm" onClick={() => setAdding(true)} disabled={full || pending}>
          <Plus className="size-3.5" />
          Προσθήκη
        </Button>
      </div>

      {widgets.length === 0 ? (
        <div className="grid place-items-center gap-2 border border-dashed border-k-line-2 bg-white px-6 py-14 text-center">
          <p className="text-[13px] text-k-text-2">Η ζώνη είναι άδεια.</p>
          <p className="max-w-[42ch] text-[11.5px] leading-[1.55] text-k-text-4">
            {zone.description}
          </p>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="mt-1">
            <Plus className="size-3.5" />
            Προσθήκη widget
          </Button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={widgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {widgets.map((w) => (
                <WidgetCard
                  key={w.id}
                  widget={w}
                  onEdit={() => setEditing(w)}
                  onToggle={() => toggle(w)}
                  onDelete={() => setConfirmDelete(w)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {full && (
        <p className="mt-2 text-[11.5px] text-k-text-4">
          Η ζώνη είναι γεμάτη. Αφαιρέστε ένα widget για να προσθέσετε άλλο.
        </p>
      )}

      {/* ── Προσθήκη ── */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-[34rem]">
          <DialogHeader>
            <DialogTitle className="text-[15px]">Προσθήκη widget</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              {zone.label} · {zone.description}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {WIDGETS.filter((def) => zone.accepts.includes(def.type)).map((def) => (
              <li key={def.type}>
                <button
                  type="button"
                  onClick={() => add(def.type)}
                  disabled={pending}
                  className="w-full border border-k-line bg-white p-3 text-left transition-colors hover:border-k-ink hover:bg-k-surface-2 disabled:opacity-50"
                >
                  <span className="block text-[13px] font-medium text-k-ink">{def.label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-k-text-3">
                    {def.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* ── Επεξεργασία ── */}
      <Sheet open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-[30rem]">
          {editing && (
            <EditSheet
              widget={editing}
              pending={pending}
              onSave={(props) => save(editing.id, props)}
              onCancel={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* ── Διαγραφή ── */}
      <AlertDialog open={confirmDelete != null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">Διαγραφή widget;</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              Οι ρυθμίσεις του χάνονται. Αν θέλετε απλώς να μη φαίνεται στη σελίδα, χρησιμοποιήστε
              την απόκρυψη.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && remove(confirmDelete)}
              className="bg-k-red hover:bg-k-red-hover"
            >
              Διαγραφή
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const LAYOUT_LABEL: Record<string, string> = {
  stack: "Στοίβα",
  grid: "Πλέγμα",
  band: "Λωρίδα",
  carousel: "Κύλινδρος",
};

function WidgetCard({
  widget,
  onEdit,
  onToggle,
  onDelete,
}: {
  widget: WidgetInstance;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });
  const def = WIDGETS_BY_TYPE.get(widget.type);
  const title = propText(widget.props, "title", "el") || def?.label || widget.type;
  const bgKind = typeof widget.props.bgKind === "string" ? widget.props.bgKind : "none";
  const image =
    (typeof widget.props.image === "string" && widget.props.image) ||
    (typeof widget.props.bgImage === "string" && widget.props.bgImage) ||
    "";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 border border-k-line bg-white p-2.5 transition-shadow",
        isDragging && "z-10 shadow-lg",
        !widget.enabled && "opacity-55",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-k-text-5 transition-colors hover:text-k-ink active:cursor-grabbing"
        aria-label="Μετακίνηση"
      >
        <GripVertical className="size-4" />
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="relative grid size-11 shrink-0 place-items-center border border-k-line bg-k-surface-2">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="size-full object-contain p-0.5" />
          ) : bgKind === "video" ? (
            <Video className="size-4 text-k-text-5" />
          ) : (
            <ImageIcon className="size-4 text-k-text-5" />
          )}
        </span>

        <span className="min-w-0">
          <span className="block truncate text-[13px] text-k-ink">{title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-k-text-4">
            {def?.label ?? widget.type}
            {bgKind !== "none" && <span>· φόντο {bgKind === "video" ? "βίντεο" : "εικόνα"}</span>}
            {!widget.enabled && <span className="text-k-amber">· κρυφό</span>}
          </span>
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onToggle}
          className="grid size-7 place-items-center text-k-text-4 transition-colors hover:bg-k-surface-3 hover:text-k-ink"
          aria-label={widget.enabled ? "Απόκρυψη" : "Εμφάνιση"}
          title={widget.enabled ? "Απόκρυψη από τη σελίδα" : "Εμφάνιση στη σελίδα"}
        >
          {widget.enabled ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="grid size-7 place-items-center text-k-text-4 transition-colors hover:bg-k-surface-3 hover:text-k-red"
          aria-label="Διαγραφή"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </li>
  );
}

function EditSheet({
  widget,
  pending,
  onSave,
  onCancel,
}: {
  widget: WidgetInstance;
  pending: boolean;
  onSave: (props: Props) => void;
  onCancel: () => void;
}) {
  const [props, setProps] = useState<Props>(widget.props);
  const def = WIDGETS_BY_TYPE.get(widget.type);
  const dirty = JSON.stringify(props) !== JSON.stringify(widget.props);

  return (
    <>
      <SheetHeader className="border-b border-k-line px-5 py-4">
        <SheetTitle className="text-[15px]">{def?.label ?? widget.type}</SheetTitle>
        <p className="text-[12px] text-k-text-3">{def?.description}</p>
      </SheetHeader>

      <div className="px-5 py-5">
        <WidgetForm type={widget.type} value={props} onChange={setProps} />
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-k-line bg-white px-5 py-3">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Άκυρο
        </Button>
        <Button onClick={() => onSave(props)} disabled={pending || !dirty}>
          {pending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
          Αποθήκευση
        </Button>
      </div>
    </>
  );
}
