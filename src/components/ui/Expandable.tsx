"use client";

import { useId, useState } from "react";
import { upGreek } from "@/lib/greek";

/**
 * Clamp-with-expand — the pattern every long block on this site should use.
 *
 * Product copy here runs 800–1.400 characters of machine-written prose. Shown
 * in full it buries the specs, the related products and the footer under a wall
 * nobody reads; cut without a way back it hides real information. Clamped with
 * a toggle is the only version that serves both the skimmer and the engineer.
 *
 * No measurement effect: whether the toggle appears is decided by the caller
 * from the content length it already has. Measuring after paint means the
 * button pops in a frame late and the layout shifts under the cursor.
 *
 * `hidden` is never used to hide the overflow — the text stays in the DOM and
 * in the accessibility tree, so a crawler and a screen reader both get all of
 * it regardless of the visual clamp.
 */
export function Expandable({
  children,
  lines = 4,
  /** Pass false when the content is short enough that clamping is pointless. */
  collapsible = true,
  moreLabel = "Περισσότερα",
  lessLabel = "Λιγότερα",
  className = "",
}: {
  children: React.ReactNode;
  lines?: number;
  collapsible?: boolean;
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!collapsible) return <div className={className}>{children}</div>;

  return (
    <div className={className}>
      <div
        id={id}
        style={open ? undefined : { WebkitLineClamp: lines }}
        className={
          open
            ? ""
            : // Fades the last line rather than cutting it dead, so it reads as
              // "there is more" instead of "the text is broken".
              "relative overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-8 after:bg-gradient-to-t after:from-[var(--expandable-fade,#fff)] after:to-transparent"
        }
      >
        {children}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="t-card-cta mt-3.5 inline-flex cursor-pointer items-center gap-2 border-b-[1.5px] border-k-red pb-[3px] text-k-ink transition-colors hover:text-k-red"
      >
        {upGreek(open ? lessLabel : moreLabel)}
        <span aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
    </div>
  );
}
