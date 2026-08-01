"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cellStyle, validateGrid, type GridCell, type GridTemplateView } from "@/lib/banners/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Drawing a banner's layout.
 *
 * The canvas is the template's own geometry at its own aspect ratio, so what is
 * drawn is what the page will look like. Regions are painted freehand across
 * empty squares, then moved and resized directly — a layout is a shape, and the
 * fastest way to describe a shape is to draw it.
 *
 * Freehand rather than recursive splitting: split-lines are valid by
 * construction but cannot express a full-height left cell beside two stacked
 * right ones without nesting, which is the very first layout anybody asks for.
 * `validateGrid` buys the safety back and says which cells collide.
 *
 * Move and resize are both plain pointer handlers over one unit-conversion
 * helper. A drag library would own the move and leave resize hand-written
 * anyway, which is two snapping implementations for one geometry.
 */

type Rect = { x: number; y: number; w: number; h: number };

type Drag =
  | { kind: "paint"; from: { x: number; y: number }; at: { x: number; y: number } }
  | { kind: "move"; id: string; origin: GridCell; from: { x: number; y: number }; at: { x: number; y: number } }
  | {
      kind: "resize";
      id: string;
      origin: GridCell;
      edge: string;
      from: { x: number; y: number };
      at: { x: number; y: number };
    };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Muted fills so regions read as distinct areas without competing with content. */
const TINTS = [
  "bg-[#e8edf5] border-[#b9c6da]",
  "bg-[#f3ecdf] border-[#d8c9a8]",
  "bg-[#e6efe8] border-[#b2ccb8]",
  "bg-[#f2e7e7] border-[#d7b7b7]",
  "bg-[#ece8f2] border-[#c3b8d6]",
  "bg-[#e5f0f2] border-[#aecdd2]",
];

const ASPECTS = [
  { value: "auto", label: "Αυτόματο" },
  { value: "21/9", label: "21:9 — πλατύ hero" },
  { value: "16/9", label: "16:9" },
  { value: "3/1", label: "3:1 — λωρίδα" },
  { value: "2/1", label: "2:1" },
  { value: "4/3", label: "4:3" },
  { value: "1/1", label: "1:1 — τετράγωνο" },
];

/** Starting points, so the first template is not drawn from nothing. */
const PRESETS: Array<{ label: string; columns: number; rows: number; cells: Rect[] }> = [
  {
    label: "Hero 3-split",
    columns: 12,
    rows: 6,
    cells: [
      { x: 0, y: 0, w: 8, h: 6 },
      { x: 8, y: 0, w: 4, h: 3 },
      { x: 8, y: 3, w: 4, h: 3 },
    ],
  },
  {
    label: "Δύο ίσα",
    columns: 12,
    rows: 6,
    cells: [
      { x: 0, y: 0, w: 6, h: 6 },
      { x: 6, y: 0, w: 6, h: 6 },
    ],
  },
  {
    label: "Τέσσερα πλακίδια",
    columns: 12,
    rows: 6,
    cells: [
      { x: 0, y: 0, w: 6, h: 3 },
      { x: 6, y: 0, w: 6, h: 3 },
      { x: 0, y: 3, w: 6, h: 3 },
      { x: 6, y: 3, w: 6, h: 3 },
    ],
  },
];

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** The cell as the drag would leave it. The canvas renders from this, so what
 *  is under the pointer is exactly what a release will commit. */
function applyDrag(cells: GridCell[], drag: Drag, columns: number, rows: number): GridCell[] {
  if (drag.kind === "paint") return cells;

  const du = drag.at.x - drag.from.x;
  const dv = drag.at.y - drag.from.y;
  const o = drag.origin;

  return cells.map((c) => {
    if (c.id !== drag.id) return c;

    if (drag.kind === "move") {
      return {
        ...c,
        x: clamp(o.x + du, 0, columns - o.w),
        y: clamp(o.y + dv, 0, rows - o.h),
      };
    }

    let { x, y, w, h } = o;
    if (drag.edge.includes("e")) w = clamp(o.w + du, 1, columns - o.x);
    if (drag.edge.includes("s")) h = clamp(o.h + dv, 1, rows - o.y);
    if (drag.edge.includes("w")) {
      x = clamp(o.x + du, 0, o.x + o.w - 1);
      w = o.x + o.w - x;
    }
    if (drag.edge.includes("n")) {
      y = clamp(o.y + dv, 0, o.y + o.h - 1);
      h = o.y + o.h - y;
    }
    return { ...c, x, y, w, h };
  });
}

function paintRect(drag: Extract<Drag, { kind: "paint" }>): Rect {
  const x = Math.min(drag.from.x, drag.at.x);
  const y = Math.min(drag.from.y, drag.at.y);
  return {
    x,
    y,
    w: Math.abs(drag.at.x - drag.from.x) + 1,
    h: Math.abs(drag.at.y - drag.from.y) + 1,
  };
}

export type SaveTemplateInput = {
  id?: string;
  name: string;
  columns: number;
  rows: number;
  cells: GridCell[];
  aspect: string | null;
};

export function GridBuilder({
  template,
  onSave,
}: {
  template: GridTemplateView | null;
  onSave: (input: SaveTemplateInput) => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? "");
  const [columns, setColumns] = useState(template?.columns ?? 12);
  const [rows, setRows] = useState(template?.rows ?? 6);
  const [aspect, setAspect] = useState(template?.aspect ?? "auto");
  const [cells, setCells] = useState<GridCell[]>(template?.cells ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, start] = useTransition();

  const canvasRef = useRef<HTMLDivElement>(null);

  /* ─── pointer → grid units ─── */

  const unitAt = useCallback(
    (clientX: number, clientY: number) => {
      const r = canvasRef.current!.getBoundingClientRect();
      return {
        x: clamp(Math.floor(((clientX - r.left) / r.width) * columns), 0, columns - 1),
        y: clamp(Math.floor(((clientY - r.top) / r.height) * rows), 0, rows - 1),
      };
    },
    [columns, rows],
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const at = unitAt(e.clientX, e.clientY);
      setDrag((d) => (d && (d.at.x !== at.x || d.at.y !== at.y) ? { ...d, at } : d));
    };
    const up = () => {
      setDrag((d) => {
        if (!d) return null;
        if (d.kind === "paint") {
          const rect = paintRect(d);
          setCells((cs) =>
            cs.some((c) => overlaps(rect, c))
              ? cs // refused — the preview was already showing red
              : [...cs, { id: newId(), name: `Ζώνη ${cs.length + 1}`, ...rect }],
          );
        } else {
          setCells((cs) => applyDrag(cs, d, columns, rows));
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, unitAt, columns, rows]);

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest<HTMLElement>("[data-edge]");
    const cellEl = target.closest<HTMLElement>("[data-cell-id]");
    const at = unitAt(e.clientX, e.clientY);
    e.preventDefault();

    if (handle && cellEl) {
      const origin = cells.find((c) => c.id === cellEl.dataset.cellId);
      if (!origin) return;
      setSelected(origin.id);
      setDrag({ kind: "resize", id: origin.id, origin, edge: handle.dataset.edge!, from: at, at });
      return;
    }
    if (cellEl) {
      const origin = cells.find((c) => c.id === cellEl.dataset.cellId);
      if (!origin) return;
      setSelected(origin.id);
      setDrag({ kind: "move", id: origin.id, origin, from: at, at });
      return;
    }
    setSelected(null);
    setDrag({ kind: "paint", from: at, at });
  }

  /* ─── derived ─── */

  const view = drag ? applyDrag(cells, drag, columns, rows) : cells;
  const painting = drag?.kind === "paint" ? paintRect(drag) : null;
  const paintBlocked = painting ? cells.some((c) => overlaps(painting, c)) : false;

  const check = useMemo(() => validateGrid(view, columns, rows), [view, columns, rows]);

  /** Which squares nothing covers — holes are the failure people cannot see in a
   *  list of coordinates, so they are shaded on the canvas itself. */
  const free = useMemo(() => {
    const set = new Set<string>();
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) set.add(`${x}:${y}`);
    for (const c of view) {
      for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) set.delete(`${x}:${y}`);
      }
    }
    return set;
  }, [view, columns, rows]);

  /* ─── keyboard: the non-drag path to the same edits ─── */

  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      const nudge = (dx: number, dy: number) => {
        e.preventDefault();
        setCells((cs) =>
          cs.map((c) => {
            if (c.id !== selected) return c;
            if (e.shiftKey) {
              return {
                ...c,
                w: clamp(c.w + dx, 1, columns - c.x),
                h: clamp(c.h + dy, 1, rows - c.y),
              };
            }
            return { ...c, x: clamp(c.x + dx, 0, columns - c.w), y: clamp(c.y + dy, 0, rows - c.h) };
          }),
        );
      };

      if (e.key === "ArrowLeft") nudge(-1, 0);
      else if (e.key === "ArrowRight") nudge(1, 0);
      else if (e.key === "ArrowUp") nudge(0, -1);
      else if (e.key === "ArrowDown") nudge(0, 1);
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setCells((cs) => cs.filter((c) => c.id !== selected));
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, columns, rows]);

  /* ─── actions ─── */

  function applyPreset(p: (typeof PRESETS)[number]) {
    setColumns(p.columns);
    setRows(p.rows);
    setCells(p.cells.map((r, i) => ({ id: newId(), name: `Ζώνη ${i + 1}`, ...r })));
    setSelected(null);
  }

  /** Turn the leftover empty squares into cells, one maximal rectangle at a
   *  time. Filling holes by hand is the tedious part of an otherwise quick job. */
  function fillHoles() {
    const grid: boolean[][] = Array.from({ length: rows }, () => Array(columns).fill(false));
    for (const c of cells) {
      for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) grid[y][x] = true;
    }
    const added: GridCell[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        if (grid[y][x]) continue;
        let w = 0;
        while (x + w < columns && !grid[y][x + w]) w++;
        let h = 1;
        outer: while (y + h < rows) {
          for (let i = 0; i < w; i++) if (grid[y + h][x + i]) break outer;
          h++;
        }
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = true;
        added.push({ id: newId(), name: `Ζώνη ${cells.length + added.length + 1}`, x, y, w, h });
      }
    }
    if (added.length === 0) {
      toast.info("Δεν υπάρχουν κενά.");
      return;
    }
    setCells((cs) => [...cs, ...added]);
  }

  function save() {
    start(async () => {
      const result = await onSave({
        id: template?.id,
        name,
        columns,
        rows,
        cells,
        aspect: aspect === "auto" ? null : aspect,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Το πλέγμα αποθηκεύτηκε.");
      if (!template) router.replace(`/admin/banners/templates/${result.id}`);
      else router.refresh();
    });
  }

  const tint = (id: string) => TINTS[view.findIndex((c) => c.id === id) % TINTS.length];

  /* ─── how the grid stacks on a phone ─── */

  /** Drawn order unless somebody has said otherwise; hidden cells sink last. */
  const mobileOrder = [...cells].sort((a, b) => {
    if (Boolean(a.mobile?.hidden) !== Boolean(b.mobile?.hidden)) return a.mobile?.hidden ? 1 : -1;
    return (a.mobile?.order ?? cells.indexOf(a)) - (b.mobile?.order ?? cells.indexOf(b));
  });

  /** Renumber every visible cell after a move, so the stored order is always a
   *  clean sequence rather than a set of gaps somebody has to reason about. */
  function renumber(next: GridCell[]) {
    let position = 0;
    setCells(
      cells.map((c) => {
        const index = next.findIndex((n) => n.id === c.id);
        const hidden = Boolean(next[index]?.mobile?.hidden);
        return { ...c, mobile: { hidden, order: hidden ? 999 : position++ } };
      }),
    );
  }

  function moveMobile(id: string, direction: -1 | 1) {
    const index = mobileOrder.findIndex((c) => c.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= mobileOrder.length) return;
    const next = [...mobileOrder];
    [next[index], next[target]] = [next[target], next[index]];
    renumber(next);
  }

  function toggleMobile(id: string) {
    renumber(
      mobileOrder.map((c) =>
        c.id === id ? { ...c, mobile: { ...c.mobile, hidden: !c.mobile?.hidden } } : c,
      ),
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      {/* ── Καμβάς ── */}
      <div className="space-y-3">
        {!check.ok && cells.length > 0 && (
          <p
            role="status"
            className="flex items-start gap-2 border border-k-amber/40 bg-k-amber/10 px-3 py-2 text-[12px] leading-[1.5] text-k-ink"
          >
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-k-amber" />
            {check.error}
          </p>
        )}
        {check.ok && cells.length > 0 && (
          <p className="flex items-center gap-2 border border-k-green/30 bg-k-green/10 px-3 py-2 text-[12px] text-k-ink">
            <Check className="size-3.5 shrink-0 text-k-green" />
            Το πλέγμα είναι έγκυρο — {cells.length}{" "}
            {cells.length === 1 ? "κελί" : "κελιά"}, χωρίς κενά ή επικαλύψεις.
          </p>
        )}

        <div
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          className="relative touch-none select-none border border-k-line bg-white"
          style={{
            aspectRatio: aspect === "auto" ? undefined : aspect,
            height: aspect === "auto" ? rows * 58 : undefined,
          }}
        >
          {/* Πλέγμα υποβάθρου — και οι στόχοι για ζωγραφική */}
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`,
            }}
            aria-hidden
          >
            {Array.from({ length: columns * rows }, (_, i) => {
              const x = i % columns;
              const y = Math.floor(i / columns);
              return (
                <div
                  key={i}
                  className={cn(
                    "border-b border-r border-k-line/50",
                    free.has(`${x}:${y}`) && "bg-[repeating-linear-gradient(45deg,transparent,transparent_5px,rgba(0,0,0,.045)_5px,rgba(0,0,0,.045)_10px)]",
                  )}
                />
              );
            })}
          </div>

          {/* Κελιά */}
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`,
              gridTemplateRows: `repeat(${rows}, minmax(0,1fr))`,
            }}
          >
            {view.map((c) => (
              <div key={c.id} style={cellStyle(c)} className="relative p-[3px]">
                <div
                  data-cell-id={c.id}
                  className={cn(
                    "flex size-full cursor-grab flex-col items-center justify-center border text-center transition-shadow",
                    tint(c.id),
                    selected === c.id && "ring-2 ring-k-ink ring-offset-1",
                    drag?.kind !== "paint" && drag?.id === c.id && "cursor-grabbing shadow-lg",
                  )}
                >
                  <span className="pointer-events-none max-w-full truncate px-2 text-[12px] font-medium text-k-ink">
                    {c.name}
                  </span>
                  <span className="numeral pointer-events-none text-[10.5px] text-k-text-3">
                    {c.w}×{c.h}
                  </span>

                  {selected === c.id &&
                    ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((edge) => (
                      <span
                        key={edge}
                        data-edge={edge}
                        className={cn(
                          "absolute z-10 bg-k-ink",
                          edge.length === 2
                            ? "size-2"
                            : edge === "n" || edge === "s"
                              ? "left-1/2 h-1.5 w-4 -translate-x-1/2"
                              : "top-1/2 h-4 w-1.5 -translate-y-1/2",
                          edge.includes("n") && "-top-1",
                          edge.includes("s") && "-bottom-1",
                          edge.includes("w") && "-left-1",
                          edge.includes("e") && "-right-1",
                          edge === "n" || edge === "s" ? "cursor-ns-resize" : "",
                          edge === "e" || edge === "w" ? "cursor-ew-resize" : "",
                          edge === "nw" || edge === "se" ? "cursor-nwse-resize" : "",
                          edge === "ne" || edge === "sw" ? "cursor-nesw-resize" : "",
                        )}
                      />
                    ))}
                </div>
              </div>
            ))}

            {/* Προεπισκόπηση ζωγραφικής */}
            {painting && (
              <div
                style={cellStyle({ id: "", name: "", ...painting })}
                className="pointer-events-none p-[3px]"
              >
                <div
                  className={cn(
                    "flex size-full items-center justify-center border-2 border-dashed",
                    paintBlocked
                      ? "border-k-red bg-k-red/10 text-k-red"
                      : "border-k-ink/50 bg-k-ink/5 text-k-text-2",
                  )}
                >
                  <span className="numeral text-[11px] font-medium">
                    {paintBlocked ? "επικάλυψη" : `${painting.w}×${painting.h}`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-[11.5px] leading-[1.6] text-k-text-3">
          Σύρετε πάνω στα κενά τετράγωνα για νέο κελί. Σύρετε ένα κελί για μετακίνηση, τις λαβές του
          για αλλαγή μεγέθους. Με επιλεγμένο κελί: βελάκια για μετακίνηση, Shift+βελάκια για μέγεθος,
          Delete για διαγραφή.
        </p>
      </div>

      {/* ── Ρυθμίσεις ── */}
      <div className="space-y-4">
        <div className="space-y-3 border border-k-line bg-white p-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name" className="text-[11.5px]">
              Όνομα πλέγματος
            </Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="π.χ. Hero 3-split"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-cols" className="text-[11.5px]">
                Στήλες
              </Label>
              <Input
                id="tpl-cols"
                type="number"
                min={1}
                max={24}
                value={columns}
                onChange={(e) => setColumns(clamp(Number(e.target.value) || 1, 1, 24))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-rows" className="text-[11.5px]">
                Γραμμές
              </Label>
              <Input
                id="tpl-rows"
                type="number"
                min={1}
                max={24}
                value={rows}
                onChange={(e) => setRows(clamp(Number(e.target.value) || 1, 1, 24))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11.5px]">Αναλογία</Label>
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASPECTS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-[1.5] text-k-text-4">
              Καθορίζει το ύψος του banner σε κάθε πλάτος οθόνης.
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={pending || !check.ok || !name.trim()} className="flex-1">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Αποθήκευση
            </Button>
            {free.size > 0 && (
              <Button variant="outline" onClick={fillHoles} title="Γέμισμα κενών">
                <Plus className="size-3.5" />
                Κενά
              </Button>
            )}
          </div>
        </div>

        {/* Κελιά */}
        <div className="border border-k-line bg-white">
          <p className="border-b border-k-line px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
            Κελιά
          </p>
          {cells.length === 0 ? (
            <p className="px-3 py-4 text-[12px] leading-[1.6] text-k-text-3">
              Κανένα κελί ακόμη. Σύρετε πάνω στον καμβά ή ξεκινήστε από ένα έτοιμο σχέδιο.
            </p>
          ) : (
            <ul>
              {cells.map((c) => (
                <li
                  key={c.id}
                  onMouseEnter={() => setSelected(c.id)}
                  className={cn(
                    "flex items-center gap-2 border-b border-k-line px-2 py-1.5 last:border-0",
                    selected === c.id && "bg-k-surface-2",
                  )}
                >
                  <span className={cn("size-3 shrink-0 border", tint(c.id))} aria-hidden />
                  <Input
                    value={c.name}
                    onChange={(e) =>
                      setCells((cs) =>
                        cs.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)),
                      )
                    }
                    maxLength={40}
                    className="h-7 border-transparent bg-transparent px-1 text-[12px] shadow-none focus-visible:border-k-line focus-visible:bg-white"
                    aria-label={`Όνομα κελιού ${c.name}`}
                  />
                  <span className="numeral shrink-0 text-[10.5px] text-k-text-4">
                    {c.w}×{c.h}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCells((cs) => cs.filter((x) => x.id !== c.id));
                      setSelected(null);
                    }}
                    className="shrink-0 p-1 text-k-text-4 transition-colors hover:text-k-red"
                    aria-label={`Διαγραφή ${c.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Σε κινητό */}
        {cells.length > 0 && (
          <div className="border border-k-line bg-white">
            <p className="flex items-center gap-1.5 border-b border-k-line px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
              <Smartphone className="size-3" />
              Σε κινητό
            </p>
            <div className="space-y-2 p-2">
              <p className="text-[11px] leading-[1.55] text-k-text-3">
                Το πλέγμα γίνεται μία στήλη. Ορίστε τη σειρά και κρύψτε όσα κελιά δεν αξίζουν το
                scroll.
              </p>
              <ul className="space-y-1">
                {mobileOrder.map((c, index) => (
                  <li
                    key={c.id}
                    className={cn(
                      "flex items-center gap-1.5 border border-k-line px-2 py-1.5",
                      c.mobile?.hidden && "bg-k-surface-2",
                    )}
                  >
                    <span className="numeral w-4 shrink-0 text-[10.5px] text-k-text-4">
                      {c.mobile?.hidden ? "—" : index + 1}
                    </span>
                    <span className={cn("size-3 shrink-0 border", tint(c.id))} aria-hidden />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[11.5px]",
                        c.mobile?.hidden ? "text-k-text-5 line-through" : "text-k-ink",
                      )}
                    >
                      {c.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveMobile(c.id, -1)}
                      disabled={index === 0 || Boolean(c.mobile?.hidden)}
                      className="p-0.5 text-k-text-4 hover:text-k-ink disabled:opacity-30"
                      aria-label="Πιο πάνω"
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveMobile(c.id, 1)}
                      disabled={index === mobileOrder.length - 1 || Boolean(c.mobile?.hidden)}
                      className="p-0.5 text-k-text-4 hover:text-k-ink disabled:opacity-30"
                      aria-label="Πιο κάτω"
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMobile(c.id)}
                      className="p-0.5 text-k-text-4 hover:text-k-ink"
                      aria-label={c.mobile?.hidden ? "Εμφάνιση σε κινητό" : "Απόκρυψη σε κινητό"}
                    >
                      {c.mobile?.hidden ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {mobileOrder.every((c) => c.mobile?.hidden) && (
                <p className="border border-k-amber/40 bg-k-amber/10 px-2 py-1.5 text-[11px] text-k-ink">
                  Όλα τα κελιά είναι κρυμμένα — σε κινητό δεν θα φαίνεται τίποτα.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Έτοιμα σχέδια */}
        <div className="border border-k-line bg-white">
          <p className="flex items-center gap-1.5 border-b border-k-line px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
            <Sparkles className="size-3" />
            Έτοιμα σχέδια
          </p>
          <div className="grid grid-cols-3 gap-2 p-2">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="group space-y-1 border border-k-line p-1.5 text-left transition-colors hover:border-k-ink"
                title={p.label}
              >
                <span
                  className="grid h-9 w-full gap-px"
                  style={{
                    gridTemplateColumns: `repeat(${p.columns}, minmax(0,1fr))`,
                    gridTemplateRows: `repeat(${p.rows}, minmax(0,1fr))`,
                  }}
                  aria-hidden
                >
                  {p.cells.map((c, i) => (
                    <span
                      key={i}
                      style={cellStyle({ id: "", name: "", ...c })}
                      className="bg-k-surface-3 group-hover:bg-k-ink/25"
                    />
                  ))}
                </span>
                <span className="block truncate text-[10.5px] text-k-text-3">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
