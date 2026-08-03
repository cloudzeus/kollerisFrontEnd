"use client";

import { useTranslations } from "next-intl";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { upGreek } from "@/lib/greek";

/**
 * Product gallery with zoom.
 *
 * Two zoom modes, because the two inputs want different things:
 *
 *  - Desktop: hover magnifies in place, with `transform-origin` following the
 *    cursor. The origin is written straight to the node's style inside a rAF
 *    rather than through React state — a mousemove handler that re-renders a
 *    900px image sixty times a second is how a gallery ends up feeling heavy.
 *  - Touch and keyboard: a fullscreen lightbox, since there is no hover to
 *    magnify with and pinch-zoom inside a page fights the page's own scroll.
 *
 * The thumb strip, the dots and the counter all read one piece of state, so the
 * three can never disagree about which shot is showing.
 */
export function ProductGallery({
  images,
  alt,
  discountLabel,
}: {
  images: Array<{ id: string; url: string }>;
  alt: string;
  discountLabel: string | null;
}) {
  const t = useTranslations("pdp.ProductGallery");
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const current = images[active];

  const frame = useRef<HTMLDivElement | null>(null);
  const zoomed = useRef<HTMLImageElement | null>(null);
  const raf = useRef<number | null>(null);

  const track = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const box = frame.current;
    const node = zoomed.current;
    if (!box || !node) return;

    const rect = box.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      node.style.transformOrigin = `${x}% ${y}%`;
    });
  }, []);

  const resetZoom = useCallback(() => {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    const node = zoomed.current;
    if (node) node.style.transformOrigin = "center center";
  }, []);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
    },
    [],
  );


  /*
   * Thumb-rail scrolling.
   *
   * `overflows` is derived from the image count rather than measured, so the
   * arrows are in the first paint instead of appearing a frame later and
   * shifting the rail. Six is what fits beside a 540px image at 88+10px each.
   */
  const rail = useRef<HTMLDivElement | null>(null);
  const overflows = images.length > 6;
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(overflows);

  const syncRail = useCallback(() => {
    const node = rail.current;
    if (!node) return;
    setCanScrollUp(node.scrollTop > 4);
    setCanScrollDown(node.scrollTop + node.clientHeight < node.scrollHeight - 4);
  }, []);

  const scrollRail = useCallback((direction: 1 | -1) => {
    // Three thumbs a press — a full page would lose the customer's place in
    // a rail where every frame looks like the one before it.
    rail.current?.scrollBy({ top: direction * 294, behavior: "smooth" });
  }, []);

  // The rail also takes wheel and trackpad input, so measure once mounted: the
  // arrows must reflect whatever height actually resolved, not the guess.
  useEffect(syncRail, [syncRail, images.length]);

  // Arrow keys move between shots whenever the gallery holds focus.
  const onKey = (event: React.KeyboardEvent) => {
    if (images.length < 2) return;
    if (event.key === "ArrowRight") setActive((i) => (i + 1) % images.length);
    if (event.key === "ArrowLeft") setActive((i) => (i - 1 + images.length) % images.length);
  };

  return (
    <>
      {/*
        The thumb column exists only when there are thumbs.
        ─────────────────────────────────────────────────────────────────────
        Reserving `88px` unconditionally put the single image of a one-photo
        product INTO the thumbnail column: grid auto-placement fills the first
        track, and `lg:order-2` cannot move a lone item elsewhere because there
        is nothing to order it against. `max-w-full` then squeezed a 640px photo
        to 0px wide, so the page rendered a correctly-loaded image inside an
        empty grey box — which is what it was doing on every product with one
        photo.
      */}
      <div
        className={`grid gap-4 lg:gap-5 ${
          images.length > 1 ? "lg:grid-cols-[88px_1fr]" : "lg:grid-cols-1"
        }`}
      >
        {images.length > 1 && (
          /*
           * Thumb rail.
           *
           * On desktop it is capped at the height of the main image and
           * scrolls, with arrows once it overflows. A product with eight shots
           * used to run the rail 250px past the bottom of the photo it belongs
           * to, dragging the whole page down with it.
           *
           * Mobile keeps wrapping. A horizontal scroller there would fight the
           * page's own vertical scroll for the same gesture, and the rail is
           * only ever two rows.
           */
          <div className="order-2 lg:order-1 lg:flex lg:flex-col lg:gap-1.5">
            {overflows && (
              <RailArrow
                direction="up"
                disabled={!canScrollUp}
                onClick={() => scrollRail(-1)}
              />
            )}

            <div
              ref={rail}
              onScroll={syncRail}
              /*
               * No painted scrollbar, and no horizontal one at all.
               *
               * The thumbs are exactly as wide as the column that holds them,
               * so the `pr-1` that used to leave room for a scrollbar pushed
               * the content 4px past the edge. `overflow-y-auto` alone then
               * turns the other axis into `auto` too — CSS will not leave one
               * axis visible while the other scrolls — so hovering the rail
               * raised a vertical bar AND a horizontal one for those 4px.
               * The rail has arrows; it does not need either.
               */
              className="scroll-none flex flex-wrap gap-2.5 lg:max-h-[540px] lg:flex-col lg:flex-nowrap lg:overflow-x-hidden lg:overflow-y-auto"
            >
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActive(index)}
                  aria-label={t("eikona", { n: index + 1 })}
                  aria-current={index === active}
                  className={`flex h-[72px] w-[72px] shrink-0 items-center justify-center border bg-white p-1.5 transition-colors lg:h-[88px] lg:w-[88px] ${
                    index === active ? "border-k-ink" : "border-k-line hover:border-k-line-2"
                  }`}
                >
                  <Image
                    src={image.url}
                    alt=""
                    width={80}
                    height={80}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>

            {overflows && (
              <RailArrow
                direction="down"
                disabled={!canScrollDown}
                onClick={() => scrollRail(1)}
                count={images.length}
              />
            )}
          </div>
        )}

        <div className="order-1 min-w-0 lg:order-2">
          <div
            ref={frame}
            role="group"
            tabIndex={0}
            aria-label={t("eikona_apo", { alt: alt, n: active + 1, length: images.length })}
            onKeyDown={onKey}
            onMouseMove={track}
            onMouseLeave={resetZoom}
            onClick={() => current && setLightbox(true)}
            className="group/zoom relative flex h-[320px] cursor-zoom-in items-center justify-center overflow-hidden border border-k-line bg-k-surface-2 p-8 outline-none focus-visible:border-k-ink lg:h-[540px] lg:p-11"
          >
            {discountLabel && (
              <span className="t-badge pointer-events-none absolute top-0 left-0 z-10 bg-k-red px-2.5 py-1.5 text-white">
                {discountLabel}
              </span>
            )}

            {current ? (
              <Image
                ref={zoomed}
                key={current.id}
                src={current.url}
                alt={alt}
                width={900}
                height={900}
                priority
                sizes="(max-width: 1024px) 100vw, 640px"
                className="max-h-full max-w-full object-contain transition-transform duration-300 ease-out will-change-transform lg:group-hover/zoom:scale-[2.2]"
              />
            ) : (
              <p className="t-footer-tag text-center text-k-text-4">{upGreek(t("choris_eikona"))}</p>
            )}

            {/* Affordance. Fades while zooming so it never sits over the detail
                the customer leaned in to look at. */}
            {current && (
              <span className="t-brand-count pointer-events-none absolute right-3 bottom-3 z-10 flex items-center gap-1.5 border border-k-line-2 bg-white/92 px-2 py-1.5 text-k-text-3 transition-opacity lg:group-hover/zoom:opacity-0">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                >
                  <circle cx="10.5" cy="10.5" r="7" />
                  <line x1="15.8" y1="15.8" x2="22" y2="22" />
                  <line x1="10.5" y1="7.5" x2="10.5" y2="13.5" />
                  <line x1="7.5" y1="10.5" x2="13.5" y2="10.5" />
                </svg>
                <span className="hidden lg:inline">ZOOM</span>
                <span className="lg:hidden">{upGreek(t("megethynsi"))}</span>
              </span>
            )}

            {images.length > 1 && (
              <div className="pointer-events-none absolute bottom-3.5 left-0 flex w-full justify-center gap-1.5">
                {images.map((image, index) => (
                  <span
                    key={image.id}
                    className={`rounded-pill block h-1.5 transition-all ${
                      index === active ? "w-5 bg-k-ink" : "w-1.5 bg-k-line-2"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {images.length > 1 && (
            <p className="t-footer-tag mt-3 text-right text-k-text-4">
              {active + 1} / {images.length}
            </p>
          )}
        </div>
      </div>

      {lightbox && current && (
        <Lightbox
          images={images}
          active={active}
          alt={alt}
          onMove={setActive}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  );
}

/**
 * One rail arrow. Desktop only — the mobile rail wraps instead of scrolling.
 *
 * Disabled at the ends rather than hidden: a control that vanishes at the top
 * of a list makes the rail jump by its own height on the first press.
 */
function RailArrow({
  direction,
  disabled,
  onClick,
  count,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onClick: () => void;
  count?: number;
}) {
  const t = useTranslations("pdp.ProductGallery");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "up" ? t("proigoymenes_eikones") : t("epomenes_eikones")}
      className="hidden h-7 w-[88px] shrink-0 cursor-pointer items-center justify-center gap-1.5 border border-k-line bg-white text-k-text-3 transition-colors hover:border-k-ink hover:text-k-ink disabled:cursor-default disabled:border-k-line disabled:text-k-text-6 disabled:hover:border-k-line lg:flex"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {direction === "up" ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
      </svg>
      {count != null && <span className="t-brand-count">{count}</span>}
    </button>
  );
}

/** Fullscreen viewer — the touch and keyboard path to a bigger image. */
function Lightbox({
  images,
  active,
  alt,
  onMove,
  onClose,
}: {
  images: Array<{ id: string; url: string }>;
  active: number;
  alt: string;
  onMove: (index: number) => void;
  onClose: () => void;
}) {
  const t = useTranslations("pdp.ProductGallery");
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onMove((active + 1) % images.length);
      if (event.key === "ArrowLeft") onMove((active - 1 + images.length) % images.length);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [active, images.length, onMove, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-k-ink-deep/97">
      <div className="flex shrink-0 items-center justify-between border-b border-white/12 px-4 py-3 lg:px-8">
        <span className="t-eyebrow text-k-red">{upGreek(t("megethynsi"))}</span>
        <span className="t-brand-count font-mono text-white/50">
          {active + 1} / {images.length}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("kleisimo")}
          className="flex h-10 w-10 items-center justify-center text-2xl leading-none text-white transition-colors hover:text-k-red"
        >
          ×
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4 lg:p-10">
        <Image
          src={images[active].url}
          alt={alt}
          width={1600}
          height={1600}
          className="max-h-full max-w-full object-contain"
        />
      </div>

      {images.length > 1 && (
        <div className="flex shrink-0 justify-center gap-2 border-t border-white/12 p-3 lg:p-4">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => onMove(index)}
              aria-label={t("eikona_2", { n: index + 1 })}
              aria-current={index === active}
              className={`flex h-14 w-14 items-center justify-center border bg-white p-1 transition-colors lg:h-16 lg:w-16 ${
                index === active ? "border-k-red" : "border-white/20 hover:border-white/50"
              }`}
            >
              <Image
                src={image.url}
                alt=""
                width={72}
                height={72}
                className="h-full w-full object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
