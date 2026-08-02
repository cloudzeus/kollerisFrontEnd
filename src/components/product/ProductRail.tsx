"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Horizontal product rail with arrows — a client SHELL.
 *
 * The cards arrive server-rendered as `children` and are never re-rendered by
 * this component; it owns a scroll container, two buttons and whether they are
 * disabled. That is the entire client cost of the feature.
 *
 * How many products show is decided by CSS, not by a prop: each card is sized
 * with `basis` + `min-width`, so a 1440px band fits five and a 900px one fits
 * three, and the rest stay reachable through the arrows. Passing a count from
 * the server would mean guessing the viewport, and the guess is wrong on every
 * screen it was not measured on.
 *
 * Note this is the ONE place a horizontal scroller is right on this site. On
 * the listing page it was banned — there it hides products the customer came to
 * compare. Here it is a sideline: five suggestions with the rest one arrow away,
 * against a wall of 40 that pushes the footer off the page.
 */
export function ProductRail({ children }: { children: React.ReactNode }) {
  const rail = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const sync = useCallback(() => {
    const node = rail.current;
    if (!node) return;
    // 4px of slack: sub-pixel widths mean the end is rarely an exact integer.
    setCanLeft(node.scrollLeft > 4);
    setCanRight(node.scrollLeft + node.clientWidth < node.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    const node = rail.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    // Re-measure on resize: how many cards fit is a CSS decision, so the only
    // way to know whether the arrows are still needed is to watch the box.
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => observer.disconnect();
  }, [sync]);

  const scroll = useCallback((direction: 1 | -1) => {
    const node = rail.current;
    if (!node) return;
    const card = node.firstElementChild as HTMLElement | null;
    // One card plus its gap, times three — a full page would leave the customer
    // with no overlap to orient by.
    const step = card ? (card.offsetWidth + 16) * 3 : node.clientWidth * 0.8;
    node.scrollBy({ left: direction * step, behavior: "smooth" });
  }, []);

  const showArrows = canLeft || canRight;

  return (
    <div className="relative">
      <div
        ref={rail}
        onScroll={sync}
        className="scroll-slim -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 lg:gap-4"
      >
        {children}
      </div>

      {showArrows && (
        <>
          <Arrow
            direction="left"
            disabled={!canLeft}
            onClick={() => scroll(-1)}
            className="left-0 -translate-x-1/2"
          />
          <Arrow
            direction="right"
            disabled={!canRight}
            onClick={() => scroll(1)}
            className="right-0 translate-x-1/2"
          />
        </>
      )}
    </div>
  );
}

/**
 * Disabled at the ends rather than hidden — a control that disappears makes the
 * rail jump sideways under the cursor on the last press.
 *
 * `hidden lg:flex`: on touch the gesture IS the control, and an overlay button
 * would sit on top of a product card.
 */
function Arrow({
  direction,
  disabled,
  onClick,
  className,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
  className: string;
}) {
  const t = useTranslations("product.ProductRail");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? t("proigoymena_proionta") : t("epomena_proionta")}
      className={`absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center border border-k-line-2 bg-white text-k-ink shadow-[0_4px_14px_rgba(0,0,0,.10)] transition-colors hover:border-k-ink hover:bg-k-ink hover:text-white disabled:cursor-default disabled:border-k-line disabled:bg-white disabled:text-k-text-6 disabled:shadow-none lg:flex ${className}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {direction === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 6l6 6-6 6" />}
      </svg>
    </button>
  );
}
