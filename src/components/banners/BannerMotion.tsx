"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Entrance animation for every animated layer in one banner.
 *
 * One island for the whole grid rather than a client component per layer: the
 * text stays server-rendered — which is what search engines and a failed
 * hydration both see — and the JavaScript is a single script no matter how many
 * cells animate.
 *
 * It finds `[data-anim]` inside its parent, so the layers themselves carry no
 * behaviour: a preset is data, and adding an animation to it is one string.
 *
 * Nothing is hidden until this runs. If the script never loads the banner is
 * simply a banner, fully legible, with no animation — the opposite of the usual
 * arrangement where CSS hides the content and JavaScript is what reveals it.
 */

type Split = "none" | "words" | "chars";

const PRESETS: Record<
  string,
  { from: gsap.TweenVars; split: Split; stagger?: number }
> = {
  fade: { from: { opacity: 0 }, split: "none" },
  rise: { from: { opacity: 0, y: 26 }, split: "none" },
  slide: { from: { opacity: 0, x: -34 }, split: "none" },
  scale: { from: { opacity: 0, scale: 0.94, transformOrigin: "left bottom" }, split: "none" },
  mask: { from: { clipPath: "inset(0 100% 0 0)", opacity: 0 }, split: "none" },
  words: { from: { opacity: 0, y: "0.5em" }, split: "words", stagger: 0.055 },
  chars: { from: { opacity: 0, y: "0.4em" }, split: "chars", stagger: 0.018 },
};

/**
 * Wrap each word or character in a span so they can be staggered.
 *
 * Written here rather than pulled from a plugin because it is fifteen lines and
 * the alternative is another dependency in the page bundle. Words keep their
 * trailing space so the line still breaks and still reads aloud correctly.
 */
function split(el: HTMLElement, mode: Split): HTMLElement[] {
  if (mode === "none") return [el];

  const source = el.textContent ?? "";
  if (!source.trim()) return [el];

  const pieces = mode === "words" ? source.split(/(\s+)/) : [...source];
  el.textContent = "";

  const spans: HTMLElement[] = [];
  for (const piece of pieces) {
    if (/^\s+$/.test(piece)) {
      el.appendChild(document.createTextNode(piece));
      continue;
    }
    const span = document.createElement("span");
    span.textContent = piece;
    span.style.display = "inline-block";
    span.style.willChange = "transform, opacity";
    el.appendChild(span);
    spans.push(span);
  }
  return spans.length ? spans : [el];
}

/**
 * Cycle every product ticker in the banner.
 *
 * Moves one attribute; the CSS does the rest. Paused while the pointer is over
 * a ticker, because a picture that changes the moment somebody leans in to look
 * at it is the most irritating thing a carousel does.
 */
function startTickers(root: HTMLElement): () => void {
  const timers: Array<ReturnType<typeof setInterval>> = [];
  const cleanups: Array<() => void> = [];

  for (const ticker of root.querySelectorAll<HTMLElement>("[data-ticker]")) {
    const slides = [...ticker.children].filter((c): c is HTMLElement => c instanceof HTMLElement);
    if (slides.length < 2) continue;

    const interval = Math.max(800, Number(ticker.dataset.interval ?? 2500));
    let index = slides.findIndex((s) => s.hasAttribute("data-active"));
    let paused = false;

    const timer = setInterval(() => {
      if (paused) return;
      slides[index]?.removeAttribute("data-active");
      index = (index + 1) % slides.length;
      slides[index]?.setAttribute("data-active", "");
    }, interval);
    timers.push(timer);

    const hold = () => {
      paused = true;
    };
    const release = () => {
      paused = false;
    };
    ticker.addEventListener("pointerenter", hold);
    ticker.addEventListener("pointerleave", release);
    cleanups.push(() => {
      ticker.removeEventListener("pointerenter", hold);
      ticker.removeEventListener("pointerleave", release);
    });
  }

  return () => {
    for (const timer of timers) clearInterval(timer);
    for (const cleanup of cleanups) cleanup();
  };
}

export function BannerMotion() {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = anchor.current?.parentElement;
    if (!root) return;

    // Motion is a flourish, and for some people it is a symptom. The ticker
    // still runs — what it shows IS the content, and the CSS drops the
    // transition — but nothing else animates.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return startTickers(root);
    }

    const tickers = startTickers(root);
    const targets = [...root.querySelectorAll<HTMLElement>("[data-anim]")];
    if (targets.length === 0) return tickers;


    /**
     * Nothing is touched until the page is actually being looked at.
     *
     * A `from` tween applies its start state the moment it is created — the
     * text goes to opacity 0 immediately and only the ticker brings it back.
     * The ticker runs on requestAnimationFrame, which does not run in a hidden
     * document. So arming while hidden hides the content and then never
     * reveals it: a background tab, a prerender or an embedded pane would show
     * a banner with no text in it, permanently.
     *
     * The fix is not a longer timeout, it is not arming at all. A hidden page
     * has no viewer, so there is no entrance to miss; when it becomes visible
     * the animation is set up then, from an untouched starting point.
     */
    let disarm: (() => void) | null = null;

    const arm = () => {
      if (disarm) return;

      const tweens: gsap.core.Tween[] = [];

      for (const el of targets) {
        const preset = PRESETS[el.dataset.anim ?? ""];
        if (!preset) continue;

        const delay = Number(el.dataset.animDelay ?? 0) / 1000;
        const duration = Number(el.dataset.animDuration ?? 700) / 1000;

        // Split the inner span, not the positioned box — the box carries the
        // layout and has to keep its own transform. Guarded so a second mount
        // in development does not split the pieces into pieces.
        const inner = el.firstElementChild as HTMLElement | null;
        const subject = preset.split === "none" ? el : (inner ?? el);
        const already = subject.dataset.split === "done";
        const pieces = already
          ? [...subject.children].filter((c): c is HTMLElement => c instanceof HTMLElement)
          : split(subject, preset.split);
        if (preset.split !== "none") subject.dataset.split = "done";

        // `from` with immediateRender: the resting state is whatever the server
        // rendered, and the animation only ever describes where it comes from.
        // Paused, so a banner further down the page still plays to somebody.
        tweens.push(
          gsap.from(pieces, {
            ...preset.from,
            duration,
            delay,
            ease: "power3.out",
            stagger: preset.stagger,
            paused: true,
          }),
        );
      }

      if (tweens.length === 0) {
        disarm = () => {};
        return;
      }

      let settled = false;

      const play = () => {
        if (settled) return;
        settled = true;
        for (const tween of tweens) tween.play();
        listen(false);
      };

      /** Give up on animating and show the resting state. Content always wins. */
      const reveal = () => {
        if (settled) return;
        settled = true;
        for (const tween of tweens) tween.progress(1).kill();
        listen(false);
      };

      /** Measured rather than observed: an IntersectionObserver is one more
       *  thing that does not fire in a hidden document. */
      const check = () => {
        const box = root.getBoundingClientRect();
        if (box.height === 0) return;
        if (box.top < window.innerHeight * 0.9 && box.bottom > 0) play();
      };

      const failsafe = setTimeout(reveal, 4000);
      const listen = (on: boolean) => {
        const fn = on ? window.addEventListener : window.removeEventListener;
        fn("scroll", check, { passive: true } as AddEventListenerOptions);
        fn("resize", check, { passive: true } as AddEventListenerOptions);
        if (!on) clearTimeout(failsafe);
      };

      listen(true);
      check();

      disarm = () => {
        listen(false);
        for (const tween of tweens) tween.revert();
      };
    };

    const onVisible = () => {
      if (document.hidden) return;
      document.removeEventListener("visibilitychange", onVisible);
      arm();
    };

    if (document.hidden) document.addEventListener("visibilitychange", onVisible);
    else arm();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      tickers?.();
      disarm?.();
    };
  }, []);

  // A zero-size anchor so the island can find its own parent without the
  // renderer having to thread a ref through a server component.
  return <span ref={anchor} className="hidden" aria-hidden />;
}
