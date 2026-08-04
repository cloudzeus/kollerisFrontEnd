"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampFrame,
  type CellComposition,
  type Frame,
  type Layer,
} from "@/lib/banners/contract";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import { CompositionRenderer } from "@/components/banners/CompositionRenderer";
import { BannerMotion } from "@/components/banners/BannerMotion";
import { cn } from "@/lib/utils";

/**
 * Direct manipulation of one cell's layers.
 *
 * The canvas IS the renderer — the same component the storefront uses, with a
 * transparent layer of drag targets on top. Nothing here draws a second
 * approximation of a text block, so what is being dragged is the thing itself.
 *
 * Everything is in percentages of the cell, so a composition arranged on a
 * 900px canvas holds together at any width the cell is rendered at.
 *
 * Snapping is to whole percent, with a 1.5% magnet to the edges, the centres
 * and to the other layers' edges. Guides are drawn only while a snap is active,
 * so the canvas is quiet until it has something to say. Hold Alt to place
 * freely.
 */

type Drag =
  | { kind: "move"; id: string; origin: Frame; from: { x: number; y: number } }
  | { kind: "resize"; id: string; origin: Frame; edge: string; from: { x: number; y: number } };

/** Lines the dragged layer wants to land on, in percent. */
type Guides = { x: number[]; y: number[] };

const MAGNET = 1.5;

function snap(value: number, candidates: number[], free: boolean): { value: number; hit: number | null } {
  if (free) return { value: Math.round(value * 10) / 10, hit: null };
  let best: number | null = null;
  let distance = MAGNET;
  for (const candidate of candidates) {
    const delta = Math.abs(candidate - value);
    if (delta < distance) {
      distance = delta;
      best = candidate;
    }
  }
  return best == null ? { value: Math.round(value), hit: null } : { value: best, hit: best };
}

export function CellCanvas({
  composition,
  resolved,
  selected,
  onSelect,
  onChange,
  onDropAt,
  motionKey,
  aspect,
}: {
  composition: CellComposition;
  resolved: ResolvedCell | undefined;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChange: (layers: Layer[]) => void;
  /**
   * Something was dropped on the canvas — a layer kind from the palette, a logo
   * from the rail, or files from the desktop. The canvas reports where; what to
   * make of it is the editor's decision.
   */
  onDropAt?: (transfer: DataTransfer, at: { x: number; y: number }) => void;
  /**
   * Bumped to replay the entrance animations here.
   *
   * The canvas is otherwise still — an entrance that fires on every keystroke is
   * a distraction, not a preview. But an animation you can only judge by opening
   * another window is one that looks broken, so it plays on demand.
   */
  motionKey?: number;
  /** The cell's real proportions, so the canvas is not a lie about its shape. */
  aspect: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<Guides>({ x: [], y: [] });
  const [free, setFree] = useState(false);
  const [over, setOver] = useState(false);

  const layers = composition.layers;

  /* ── pointer → percent ── */
  const pointAt = useCallback((clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * 100, y: ((clientY - r.top) / r.height) * 100 };
  }, []);

  /** Edges and centres of everything except the layer being moved. */
  const targets = useCallback(
    (exceptId: string): Guides => {
      const x = [0, 50, 100];
      const y = [0, 50, 100];
      for (const layer of layers) {
        if (layer.id === exceptId || layer.hidden) continue;
        x.push(layer.frame.x, layer.frame.x + layer.frame.w);
        y.push(layer.frame.y, layer.frame.y + layer.frame.h);
      }
      return { x, y };
    },
    [layers],
  );

  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const at = pointAt(e.clientX, e.clientY);
      const dx = at.x - drag.from.x;
      const dy = at.y - drag.from.y;
      const o = drag.origin;
      const guide = targets(drag.id);
      const loose = e.altKey;
      const hits: Guides = { x: [], y: [] };

      let next: Frame;

      if (drag.kind === "move") {
        // Both the leading and trailing edge look for a magnet, so a block
        // snaps flush right as readily as flush left.
        const left = snap(o.x + dx, guide.x, loose);
        const right = snap(o.x + dx + o.w, guide.x, loose);
        const top = snap(o.y + dy, guide.y, loose);
        const bottom = snap(o.y + dy + o.h, guide.y, loose);

        const useRight = right.hit != null && left.hit == null;
        const useBottom = bottom.hit != null && top.hit == null;

        if (left.hit != null) hits.x.push(left.hit);
        if (useRight) hits.x.push(right.hit!);
        if (top.hit != null) hits.y.push(top.hit);
        if (useBottom) hits.y.push(bottom.hit!);

        next = {
          x: useRight ? right.value - o.w : left.value,
          y: useBottom ? bottom.value - o.h : top.value,
          w: o.w,
          h: o.h,
        };
      } else {
        let { x, y, w, h } = o;
        if (drag.edge.includes("e")) {
          const edge = snap(o.x + o.w + dx, guide.x, loose);
          if (edge.hit != null) hits.x.push(edge.hit);
          w = edge.value - o.x;
        }
        if (drag.edge.includes("w")) {
          const edge = snap(o.x + dx, guide.x, loose);
          if (edge.hit != null) hits.x.push(edge.hit);
          x = edge.value;
          w = o.x + o.w - x;
        }
        if (drag.edge.includes("s")) {
          const edge = snap(o.y + o.h + dy, guide.y, loose);
          if (edge.hit != null) hits.y.push(edge.hit);
          h = edge.value - o.y;
        }
        if (drag.edge.includes("n")) {
          const edge = snap(o.y + dy, guide.y, loose);
          if (edge.hit != null) hits.y.push(edge.hit);
          y = edge.value;
          h = o.y + o.h - y;
        }
        next = { x, y, w, h };
      }

      setFree(loose);
      setGuides(hits);
      onChange(
        layers.map((l) => (l.id === drag.id ? { ...l, frame: clampFrame(next) } : l)),
      );
    };

    const up = () => {
      setDrag(null);
      setGuides({ x: [], y: [] });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [drag, layers, onChange, pointAt, targets]);

  /* ── keyboard: the non-drag path to the same edits ── */
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      // Same guard as the header shortcut: this is a window listener, and an
      // event dispatched by an extension or a password manager can arrive with
      // no `key` at all.
      if (typeof e.key !== "string" || !e.key.startsWith("Arrow")) return;
      e.preventDefault();

      const step = e.shiftKey ? 5 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      onChange(
        layers.map((l) => {
          if (l.id !== selected) return l;
          // Alt turns the arrows into a resize, matching the drag handles.
          const frame = e.altKey
            ? { ...l.frame, w: l.frame.w + dx, h: l.frame.h + dy }
            : { ...l.frame, x: l.frame.x + dx, y: l.frame.y + dy };
          return { ...l, frame: clampFrame(frame) };
        }),
      );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, layers, onChange]);

  function startDrag(e: React.PointerEvent, layer: Layer) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(layer.id);
    const at = pointAt(e.clientX, e.clientY);
    const edge = (e.target as HTMLElement).dataset.edge;
    setDrag(
      edge
        ? { kind: "resize", id: layer.id, origin: layer.frame, edge, from: at }
        : { kind: "move", id: layer.id, origin: layer.frame, from: at },
    );
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={() => onSelect(null)}
      onDragOver={(e) => {
        if (!onDropAt) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!onDropAt) return;
        e.preventDefault();
        setOver(false);
        onDropAt(e.dataTransfer, pointAt(e.clientX, e.clientY));
      }}
      className={cn(
        "relative touch-none select-none border border-k-line bg-white",
        over && "outline-dashed outline-2 outline-offset-2 outline-k-red",
      )}
      style={{ aspectRatio: aspect }}
    >
      <CompositionRenderer composition={composition} resolved={resolved} locale="el" interactive={false} />
      {motionKey ? <BannerMotion key={motionKey} /> : null}

      {/* ── Οδηγοί ── */}
      {guides.x.map((x) => (
        <span
          key={`x${x}`}
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-k-red"
          style={{ left: `${x}%` }}
        />
      ))}
      {guides.y.map((y) => (
        <span
          key={`y${y}`}
          className="pointer-events-none absolute inset-x-0 z-20 h-px bg-k-red"
          style={{ top: `${y}%` }}
        />
      ))}

      {/* ── Χειριστήρια ── */}
      {layers.map((layer) =>
        layer.hidden ? null : (
          <div
            key={layer.id}
            onPointerDown={(e) => startDrag(e, layer)}
            className={cn(
              "absolute z-10 cursor-grab",
              selected === layer.id
                ? "outline outline-2 outline-k-red"
                : "outline-dashed outline-1 outline-transparent hover:outline-k-ink/40",
            )}
            style={{
              left: `${layer.frame.x}%`,
              top: `${layer.frame.y}%`,
              width: `${layer.frame.w}%`,
              height: `${layer.frame.h}%`,
            }}
          >
            {selected === layer.id && (
              <>
                <span className="absolute -top-5 left-0 whitespace-nowrap bg-k-red px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {layer.name}
                </span>
                {["nw", "ne", "sw", "se", "n", "s", "e", "w"].map((edge) => (
                  <span
                    key={edge}
                    data-edge={edge}
                    className={cn(
                      "absolute z-10 bg-k-red",
                      edge.length === 2
                        ? "size-2"
                        : edge === "n" || edge === "s"
                          ? "left-1/2 h-1.5 w-4 -translate-x-1/2 cursor-ns-resize"
                          : "top-1/2 h-4 w-1.5 -translate-y-1/2 cursor-ew-resize",
                      edge.includes("n") && "-top-1",
                      edge.includes("s") && "-bottom-1",
                      edge.includes("w") && "-left-1",
                      edge.includes("e") && "-right-1",
                      edge === "nw" || edge === "se" ? "cursor-nwse-resize" : "",
                      edge === "ne" || edge === "sw" ? "cursor-nesw-resize" : "",
                    )}
                  />
                ))}
              </>
            )}
          </div>
        ),
      )}

      {drag && (
        <span className="numeral pointer-events-none absolute bottom-1 right-1 z-30 bg-k-ink px-1.5 py-0.5 text-[10px] text-white">
          {free ? "ελεύθερα" : "κούμπωμα"}
        </span>
      )}
    </div>
  );
}
