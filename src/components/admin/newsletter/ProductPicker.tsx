"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { GripVertical, Plus, Search, X } from "lucide-react";
import { campaignBrandsAction, searchProductsAction } from "@/lib/newsletter/campaign-actions";
import type { PickedProduct } from "@/lib/newsletter/campaign";
import { cn } from "@/lib/utils";

/**
 * Επιλογή και σειρά των προϊόντων της καμπάνιας.
 *
 * ── Γιατί δύο στήλες και όχι λίστα με checkbox ─────────────────────────────
 *
 * Επειδή η ΣΕΙΡΑ μετράει. Το template βάζει τα προϊόντα δύο-δύο σε σειρές, και
 * το πρώτο ζευγάρι είναι ό,τι βλέπει κανείς χωρίς scroll. Μια λίστα με
 * checkbox δίνει «ποια», ποτέ «με ποια σειρά» — και η σειρά θα καθοριζόταν από
 * το πώς τυχαίνει να είναι ταξινομημένη η αναζήτηση.
 *
 * ── Το drag ΔΕΝ είναι ο μόνος δρόμος ───────────────────────────────────────
 *
 * Κάθε αποτέλεσμα έχει και κουμπί «+», και κάθε επιλεγμένο έχει βελάκια σειράς
 * μέσω πληκτρολογίου (dnd-kit KeyboardSensor). Διεπαφή όπου η μόνη οδός είναι
 * το σύρσιμο αποκλείει όποιον δουλεύει με πληκτρολόγιο ή σε tablet — και εδώ
 * δουλεύει το marketing, όχι μηχανικοί.
 */

function SelectedCard({
  product,
  index,
  onRemove,
}: {
  product: PickedProduct;
  index: number;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex gap-3 border border-neutral-200 bg-white p-2.5",
        isDragging && "z-10 opacity-90 shadow-lg",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Μετακίνηση: ${product.name}`}
        className="flex w-6 shrink-0 cursor-grab items-center justify-center text-neutral-300 hover:text-neutral-600 active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Η θέση είναι πληροφορία: δείχνει σε ποιο ζευγάρι πέφτει το προϊόν. */}
      <span className="absolute top-1.5 left-8 bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] leading-none text-white tabular-nums">
        {index + 1}
      </span>

      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image}
          alt=""
          className="h-14 w-14 shrink-0 border border-neutral-100 object-contain"
        />
      ) : (
        <div className="h-14 w-14 shrink-0 bg-neutral-100" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] text-neutral-500">
          {product.brand} · {product.code}
        </p>
        <p className="line-clamp-2 text-[12px] leading-snug font-medium">{product.name}</p>
        <p className="mt-0.5 text-[12px]">
          {product.priceOld && (
            <span className="mr-1.5 text-neutral-400 line-through">{product.priceOld}</span>
          )}
          <span className="font-semibold">{product.price}</span>
          {product.discount && (
            <span className="ml-1.5 bg-red-50 px-1 text-[10px] font-semibold text-red-600">
              −{product.discount}%
            </span>
          )}
        </p>
      </div>

      <button
        type="button"
        onClick={() => onRemove(product.id)}
        aria-label={`Αφαίρεση: ${product.name}`}
        className="h-6 w-6 shrink-0 self-start text-neutral-300 transition-colors hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

export function ProductPicker({
  selected,
  onChange,
}: {
  selected: PickedProduct[];
  onChange: (next: PickedProduct[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [mtrmark, setMtrmark] = useState<number | null>(null);
  const [onSaleOnly, setOnSaleOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [brands, setBrands] = useState<Array<{ mtrmark: number; name: string }>>([]);
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [pending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    // 6px χαλάρωση: χωρίς αυτό, κάθε κλικ στη λαβή μετριέται ως μικροσύρσιμο.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const selectedIds = useMemo(() => new Set(selected.map((p) => p.id)), [selected]);

  useEffect(() => {
    campaignBrandsAction().then(setBrands).catch(() => setBrands([]));
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      startTransition(async () =>
        setResults(await searchProductsAction({ query, mtrmark, onSaleOnly, inStockOnly })),
      );
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, mtrmark, onSaleOnly, inStockOnly]);

  const add = (p: PickedProduct) => {
    if (selectedIds.has(p.id)) return;
    onChange([...selected, p]);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = selected.findIndex((p) => p.id === active.id);
    const to = selected.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(selected, from, to));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ── Αναζήτηση ───────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Αναζήτηση με όνομα ή κωδικό…"
            className="h-10 w-full border border-neutral-300 pr-3 pl-9 text-[13px] outline-none focus:border-neutral-900"
          />
        </div>
        {/*
          Τα φίλτρα κάτω από το πεδίο και όχι σε συρτάρι: με 9.434 προϊόντα, η
          αναζήτηση με κείμενο μόνη της δεν φτάνει. Το πραγματικό ερώτημα όταν
          χτίζεις newsletter προσφορών είναι «τι KNIPEX έχει έκπτωση και είναι
          σε απόθεμα», και αυτό είναι τρία φίλτρα, όχι μια φράση.
        */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={mtrmark ?? ""}
            onChange={(e) => setMtrmark(e.target.value ? Number(e.target.value) : null)}
            aria-label="Φίλτρο μάρκας"
            className="h-8 border border-neutral-300 bg-white px-2 text-[12px] outline-none focus:border-neutral-900"
          >
            <option value="">Όλες οι μάρκες</option>
            {brands.map((b) => (
              <option key={b.mtrmark} value={b.mtrmark}>
                {b.name}
              </option>
            ))}
          </select>

          <label className="flex cursor-pointer items-center gap-1.5 border border-neutral-300 bg-white px-2.5 py-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={onSaleOnly}
              onChange={(e) => setOnSaleOnly(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Μόνο σε προσφορά
          </label>
          {onSaleOnly && results.length === 0 && !pending && (
            /*
              Το φίλτρο επιστρέφει σήμερα ΠΑΝΤΑ μηδέν, και είναι σωστό.
              «Σε προσφορά» σημαίνει διαγραμμένη τιμή, και το `priceList`
              μηδενίστηκε σκόπιμα σε όλο τον κατάλογο: συγκρίναμε δύο
              τιμοκαταλόγους και 68% των προϊόντων φαινόταν μόνιμα εκπτωτικό.
              Χωρίς αυτή τη γραμμή, το κενό αποτέλεσμα μοιάζει με βλάβη.
            */
            <span className="text-[11px] text-amber-700">
              Δεν υπάρχουν ακόμη διαγραμμένες τιμές στον κατάλογο.
            </span>
          )}

          <label className="flex cursor-pointer items-center gap-1.5 border border-neutral-300 bg-white px-2.5 py-1.5 text-[12px]">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Μόνο σε απόθεμα
          </label>
        </div>

        <p className="mt-1.5 text-[11px] text-neutral-500">
          {pending
            ? "Αναζήτηση…"
            : `${results.length} αποτελέσματα${query.trim().length < 2 ? " — τα πιο πρόσφατα" : ""}`}
        </p>

        <ul className="mt-3 max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
          {results.map((p) => {
            const already = selectedIds.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => add(p)}
                  disabled={already}
                  className={cn(
                    "flex w-full items-center gap-3 border p-2 text-left transition-colors",
                    already
                      ? "cursor-default border-neutral-100 bg-neutral-50 opacity-60"
                      : "border-neutral-200 bg-white hover:border-neutral-900",
                  )}
                >
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-11 w-11 shrink-0 object-contain" />
                  ) : (
                    <div className="h-11 w-11 shrink-0 bg-neutral-100" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-[10px] text-neutral-500">
                      {p.brand} · {p.code}
                    </span>
                    <span className="line-clamp-1 text-[12px] font-medium">{p.name}</span>
                    <span className="text-[12px] text-neutral-600">{p.price}</span>
                  </span>
                  <span className="shrink-0 text-neutral-400">
                    {already ? (
                      <span className="text-[11px]">επιλεγμένο</span>
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </span>
                </button>
              </li>
            );
          })}
          {!pending && results.length === 0 && (
            <li className="border border-dashed border-neutral-200 p-6 text-center text-[12px] text-neutral-500">
              Κανένα προϊόν. Δοκιμάστε κωδικό ή μάρκα.
            </li>
          )}
        </ul>
      </div>

      {/* ── Επιλεγμένα ──────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col">
        <div className="flex items-baseline justify-between">
          <p className="text-[13px] font-semibold">Στην καμπάνια</p>
          <p className="text-[11px] text-neutral-500">
            {selected.length} {selected.length === 1 ? "προϊόν" : "προϊόντα"}
            {selected.length % 2 === 1 && " · το τελευταίο θα είναι μόνο του στη σειρά"}
          </p>
        </div>

        {selected.length === 0 ? (
          <div className="mt-3 flex h-[220px] items-center justify-center border border-dashed border-neutral-300 bg-neutral-50 px-6 text-center">
            <p className="text-[12px] leading-relaxed text-neutral-500">
              Προσθέστε προϊόντα από αριστερά.
              <br />
              Σύρετέ τα για να αλλάξετε σειρά — μπαίνουν δύο ανά γραμμή.
            </p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={selected.map((p) => p.id)} strategy={rectSortingStrategy}>
              <ul className="mt-3 max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                {selected.map((p, i) => (
                  <SelectedCard
                    key={p.id}
                    product={p}
                    index={i}
                    onRemove={(id) => onChange(selected.filter((x) => x.id !== id))}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
