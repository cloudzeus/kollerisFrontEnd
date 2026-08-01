"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Info, Layers, Loader2, Star, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  actionClearSpec,
  actionClearSpecSubgroup,
  actionSaveOrder,
  actionSaveSpec,
} from "@/app/admin/(protected)/catalogue/actions";
import type { PimImage, PimProduct } from "@/lib/pim/pim-types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
 * Editing one product's presentation.
 *
 * Image order is drag-and-drop and saved explicitly, unlike the zone builder
 * where order persists on drop. The difference is the blast radius: a widget
 * order affects one page of this shop, a product's photo order affects the
 * storefront, Magento and Skroutz. A deliberate save is worth the extra click.
 *
 * The main image is a click on the star rather than "first in the list",
 * because the two are genuinely different decisions — the shot that sells the
 * product is not always the one that reads best first in a gallery.
 *
 * Specs save on blur, one field at a time, matching how HDCtool accepts them.
 * Clearing a field clears it in every language, which the hint says out loud.
 */

export function ProductEditor({ product, locale }: { product: PimProduct; locale: "el" | "en" | "it" }) {
  const [images, setImages] = useState<PimImage[]>(product.images);
  const [feature, setFeature] = useState<string | null>(
    product.images.find((i) => i.isFeature)?.url ?? product.images[0]?.url ?? null,
  );
  const [specs, setSpecs] = useState<Record<string, string>>(
    Object.fromEntries(product.specs.map((s) => [s.field, s.value])),
  );
  const [confirmBulk, setConfirmBulk] = useState<{ field: string; label: string } | null>(null);
  const [pending, start] = useTransition();

  const original = product.images.map((i) => i.url).join("|");
  const currentOrder = images.map((i) => i.url).join("|");
  const originalFeature = product.images.find((i) => i.isFeature)?.url ?? null;
  const dirty = currentOrder !== original || feature !== originalFeature;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setImages((imgs) => {
      const from = imgs.findIndex((i) => i.url === active.id);
      const to = imgs.findIndex((i) => i.url === over.id);
      return arrayMove(imgs, from, to);
    });
  }

  function saveOrder() {
    start(async () => {
      const result = await actionSaveOrder(product.mtrl, images.map((i) => i.url), feature);
      if (result.ok) toast.success("Η σειρά αποθηκεύτηκε στο HDCtool.");
      else toast.error(result.error);
    });
  }

  function saveSpec(field: string, label: string) {
    const value = specs[field] ?? "";
    const before = product.specs.find((s) => s.field === field)?.value ?? "";
    if (value.trim() === before.trim()) return;

    start(async () => {
      const result = await actionSaveSpec(product.mtrl, field, value, locale);
      if (result.ok) {
        toast.success(value.trim() ? `${label}: αποθηκεύτηκε.` : `${label}: καθαρίστηκε παντού.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function clearOne(field: string, label: string) {
    start(async () => {
      const result = await actionClearSpec(product.mtrl, field);
      if (result.ok) {
        setSpecs((v) => ({ ...v, [field]: "" }));
        toast.success(`${label}: αφαιρέθηκε από το προϊόν.`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function clearSubgroup(field: string, label: string) {
    setConfirmBulk(null);
    start(async () => {
      const result = await actionClearSpecSubgroup(product.mtrl, field);
      if (result.ok) {
        setSpecs((v) => ({ ...v, [field]: "" }));
        toast.success(
          `${label}: αφαιρέθηκε από ${result.products} ${
            result.products === 1 ? "προϊόν" : "προϊόντα"
          } της υποκατηγορίας.`,
        );
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2 border-l-[3px] border-k-blue border border-k-line bg-white px-4 py-3 text-[12px] leading-[1.55] text-k-text-2">
        <Info className="mt-px size-3.5 shrink-0 text-k-blue" />
        Οι αλλαγές γράφονται στο HDCtool και ισχύουν παντού — και στο Magento και στο Skroutz. Στο
        κατάστημα εμφανίζονται μετά τον επόμενο συγχρονισμό.
      </p>

      {/* ── Φωτογραφίες ── */}
      <section className="border border-k-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-k-line px-4 py-2.5">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-k-ink">Φωτογραφίες</h2>
            <p className="mt-0.5 text-[11.5px] text-k-text-3">
              Σύρετε για σειρά. Το αστέρι ορίζει την κύρια.
            </p>
          </div>
          {dirty && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setImages(product.images);
                  setFeature(originalFeature);
                }}
                disabled={pending}
                className="text-[12px]"
              >
                <Undo2 className="size-3" />
                Αναίρεση
              </Button>
              <Button size="sm" onClick={saveOrder} disabled={pending}>
                {pending && <Loader2 className="size-3.5 animate-spin" />}
                Αποθήκευση σειράς
              </Button>
            </div>
          )}
        </div>

        {images.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12.5px] text-k-text-3">
            Το προϊόν δεν έχει φωτογραφίες.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={images.map((i) => i.url)} strategy={rectSortingStrategy}>
              <ul className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-6">
                {images.map((img, index) => (
                  <ImageTile
                    key={img.url}
                    image={img}
                    index={index}
                    isFeature={feature === img.url}
                    onFeature={() => setFeature(img.url)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {/* ── Χαρακτηριστικά ── */}
      <section className="border border-k-line bg-white">
        <div className="border-b border-k-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold tracking-tight text-k-ink">Χαρακτηριστικά</h2>
          <p className="mt-0.5 text-[11.5px] text-k-text-3">
            Αποθηκεύονται όταν φύγετε από το πεδίο. Άδειασμα σβήνει την τιμή σε όλες τις γλώσσες.
          </p>
        </div>

        <div className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {product.specs.map((s) => {
            const changed = (specs[s.field] ?? "") !== s.value;
            const filled = (specs[s.field] ?? "").trim().length > 0;
            return (
              <div key={s.field}>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`s-${s.field}`} className="text-[12px] text-k-text-2">
                    {s.label}
                  </Label>
                  {filled && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => clearOne(s.field, s.label)}
                        disabled={pending}
                        title="Αφαίρεση από αυτό το προϊόν"
                        aria-label={`Αφαίρεση «${s.label}» από αυτό το προϊόν`}
                        className="grid size-6 place-items-center text-k-text-5 transition-colors hover:bg-k-surface-3 hover:text-k-red disabled:opacity-40"
                      >
                        <Trash2 className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmBulk({ field: s.field, label: s.label })}
                        disabled={pending}
                        title="Αφαίρεση από όλη την υποκατηγορία"
                        aria-label={`Αφαίρεση «${s.label}» από όλη την υποκατηγορία`}
                        className="grid size-6 place-items-center text-k-text-5 transition-colors hover:bg-k-surface-3 hover:text-k-red disabled:opacity-40"
                      >
                        <Layers className="size-3" />
                      </button>
                    </div>
                  )}
                </div>
                <Input
                  id={`s-${s.field}`}
                  value={specs[s.field] ?? ""}
                  onChange={(e) => setSpecs((v) => ({ ...v, [s.field]: e.target.value }))}
                  onBlur={() => saveSpec(s.field, s.label)}
                  disabled={pending}
                  className={cn("mt-1 text-[12.5px]", changed && "border-k-ink")}
                  placeholder="—"
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Only the bulk delete confirms. Clearing one field on one product is a
          keystroke to undo; clearing it across a subgroup touches products
          nobody is looking at. */}
      <AlertDialog open={confirmBulk != null} onOpenChange={(o) => !o && setConfirmBulk(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[15px]">
              Αφαίρεση «{confirmBulk?.label}» από όλη την υποκατηγορία;
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px] leading-[1.6]">
              Σβήνεται από <strong className="text-k-ink">κάθε προϊόν</strong> της ίδιας τελικής
              υποκατηγορίας, σε όλες τις γλώσσες, και σε όλα τα κανάλια. Δεν αναιρείται.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmBulk && clearSubgroup(confirmBulk.field, confirmBulk.label)}
              className="bg-k-red hover:bg-k-red-hover"
            >
              Αφαίρεση από όλα
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ImageTile({
  image,
  index,
  isFeature,
  onFeature,
}: {
  image: PimImage;
  index: number;
  isFeature: boolean;
  onFeature: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.url,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative aspect-square border bg-white transition-shadow",
        isFeature ? "border-k-ink" : "border-k-line",
        isDragging && "z-10 shadow-lg",
      )}
    >
      <Image src={image.url} alt="" fill sizes="160px" className="object-contain p-2" unoptimized />

      <span className="numeral absolute left-1 top-1 bg-k-ink/80 px-1 py-px text-[9px] text-white">
        {index + 1}
      </span>

      <button
        {...attributes}
        {...listeners}
        className="absolute inset-x-0 bottom-0 grid h-6 cursor-grab touch-none place-items-center bg-k-ink/0 text-k-text-5 opacity-0 transition-opacity group-hover:bg-k-ink/70 group-hover:text-white group-hover:opacity-100 active:cursor-grabbing"
        aria-label={`Μετακίνηση εικόνας ${index + 1}`}
      >
        <GripVertical className="size-3.5" />
      </button>

      <button
        type="button"
        onClick={onFeature}
        className={cn(
          "absolute right-1 top-1 grid size-6 place-items-center transition-colors",
          isFeature
            ? "bg-k-ink text-white"
            : "bg-white/85 text-k-text-4 opacity-0 hover:text-k-ink group-hover:opacity-100",
        )}
        aria-label={isFeature ? "Κύρια φωτογραφία" : "Ορισμός ως κύρια"}
        title={isFeature ? "Κύρια φωτογραφία" : "Ορισμός ως κύρια"}
      >
        <Star className={cn("size-3", isFeature && "fill-current")} />
      </button>
    </li>
  );
}
