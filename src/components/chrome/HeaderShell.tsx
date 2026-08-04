"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

/**
 * Sticky, condensing header shell — a client SHELL and nothing more.
 *
 * The entire header, nav and utility bar arrive as server-rendered `children`;
 * this component never re-renders them. It only watches scroll and toggles one
 * attribute on its own root, which CSS reacts to. That is why a header carrying
 * a 24-category mega-menu costs no client render on every scroll frame.
 *
 * What it does:
 *  - past 140px, drops the utility bar and shrinks the search row 96 → 64px
 *  - keeps `--header-h` accurate, because the mega-menu, the PLP sidebar and
 *    `scroll-padding-top` all measure themselves against it
 *  - focuses the search on `/` or `⌘K`, the two shortcuts anyone who searches
 *    a 5.305-code catalogue for a living will already have in their fingers
 *
 * `prefers-reduced-motion` removes the height transition — the condensing is
 * still useful, the animation is what some people cannot tolerate.
 */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations("chrome.HeaderShell");
  const root = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = root.current;
    if (!node) return;

    let condensed = false;
    let frame: number | null = null;

    const measure = () => {
      frame = null;
      const next = window.scrollY > 140;
      if (next !== condensed) {
        condensed = next;
        node.dataset.condensed = next ? "true" : "false";
      }
      // Read AFTER the attribute flip so the value matches what is painted.
      document.documentElement.style.setProperty(
        "--header-h",
        `${Math.round(node.getBoundingClientRect().height)}px`,
      );
    };

    const onScroll = () => {
      if (frame == null) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      /*
       * `key` is not guaranteed.
       *
       * It is always there on a keystroke a person makes, but this listener
       * sees every keydown on the window, including ones dispatched by password
       * managers, extensions and autofill. A plain `new Event("keydown")` has no
       * `key` at all, and `.toLowerCase()` on it took the whole page down with a
       * TypeError — from a shortcut nobody had pressed.
       */
      const key = event.key;
      if (typeof key !== "string") return;

      const wants =
        (key === "/" && !typing) ||
        (key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey));
      if (!wants) return;

      /*
       * The VISIBLE one.
       *
       * The header carries two search inputs, one for each breakpoint, and only
       * one is on screen at a time. `querySelector` returns the first in the
       * document, which on desktop is the hidden mobile field: the shortcut
       * fired, focused something nobody could see, and looked broken.
       */
      const input = [...node.querySelectorAll<HTMLInputElement>("[data-search-input]")].find(
        (candidate) => candidate.offsetParent !== null,
      );
      if (!input) return;
      event.preventDefault();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header
      ref={root}
      data-condensed="false"
      className="site-header sticky top-0 z-40"
    >
      {/*
        Keyboard users landed on 24 mega-menu categories, a search field, a
        locale switcher and a mini-cart before reaching a single product. The
        skip link is invisible until focused, which is the whole point.
      */}
      <a
        href="#main"
        className="t-btn-sm sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-k-ink focus:px-5 focus:py-3 focus:text-white"
      >
        {t("metavasi_sto_periechomeno")}
      </a>
      {children}
    </header>
  );
}
