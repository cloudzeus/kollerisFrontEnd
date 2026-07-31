"use client";

import gsap from "gsap";
import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Hover behaviour for a product card — a client SHELL, nothing more.
 *
 * The card's entire contents are server-rendered and arrive as `children`; this
 * component never re-renders them. It only attaches a paused GSAP timeline and
 * plays it forward on enter, backward on leave, so an interrupted hover rewinds
 * from wherever it reached instead of snapping.
 *
 * It finds its targets by `data-` attribute rather than taking refs, so the
 * markup can stay on the server side of the boundary.
 *
 * The timeline is skipped entirely under `prefers-reduced-motion`; the
 * quick-view bar then simply appears on focus, so the feature stays reachable.
 */
export function CardHoverShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLElement | null>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const ctx = gsap.context(() => {
      const media = element.querySelector<HTMLElement>("[data-card-media]");
      const bar = element.querySelector<HTMLElement>("[data-card-quickview]");

      if (reduceMotion) {
        if (bar) gsap.set(bar, { yPercent: 0, autoAlpha: 0 });
        return;
      }

      if (bar) gsap.set(bar, { yPercent: 100, autoAlpha: 0 });

      timeline.current = gsap
        .timeline({ paused: true, defaults: { ease: "power2.out", duration: 0.32 } })
        .to(element, { y: -4, boxShadow: "0 14px 28px rgba(0,0,0,.10)" }, 0)
        .to(media, { scale: 1.06 }, 0)
        .to(bar, { yPercent: 0, autoAlpha: 1, duration: 0.26 }, 0.04);
    }, element);

    return () => {
      ctx.revert();
      timeline.current = null;
    };
  }, []);

  const enter = useCallback(() => timeline.current?.play(), []);
  const leave = useCallback(() => timeline.current?.reverse(), []);

  return (
    <article
      ref={root}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      className={className}
    >
      {children}
    </article>
  );
}
