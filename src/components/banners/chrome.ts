import { BADGE_TONES } from "@/lib/zones/registry";
import type { WidgetChrome } from "@/lib/banners/contract";

/**
 * Presentation shared by every widget, wherever it is rendered.
 *
 * Two renderers exist — the zone list and the banner grid — and both need the
 * same overlay ramps, the same entrance animations and the same badge tones.
 * Kept here so they cannot drift into two sets of values that look nearly the
 * same and photograph differently.
 *
 * Animation is CSS, not a library: these are one-shot entrances of a few
 * elements, and a motion runtime would cost more than it animates. Every
 * variant sits behind `motion-safe:`, so `prefers-reduced-motion` disables it
 * without a second code path — motion is a flourish, and for some people it is
 * a symptom.
 */

/** Legibility over a photograph. Without it, white text lands on white sky. */
export const OVERLAY: Record<string, string> = {
  none: "",
  light: "bg-[linear-gradient(180deg,transparent_20%,rgba(16,16,18,.55)_100%)]",
  medium: "bg-[linear-gradient(180deg,rgba(16,16,18,.15)_0%,rgba(16,16,18,.72)_100%)]",
  strong: "bg-[linear-gradient(180deg,rgba(16,16,18,.45)_0%,rgba(16,16,18,.88)_100%)]",
};

export const ANIMATION: Record<string, string> = {
  none: "",
  "fade-up": "motion-safe:animate-[zone-fade-up_.6s_cubic-bezier(.22,1,.36,1)_both]",
  "slide-in": "motion-safe:animate-[zone-slide-in_.6s_cubic-bezier(.22,1,.36,1)_both]",
  reveal: "motion-safe:animate-[zone-reveal_.7s_cubic-bezier(.22,1,.36,1)_both]",
  zoom: "motion-safe:animate-[zone-zoom_.7s_cubic-bezier(.22,1,.36,1)_both]",
};

export const badgeClass = (tone: string): string =>
  BADGE_TONES.find((b) => b.value === tone)?.className ?? "bg-k-red text-white";

/**
 * When a cell fires its entrance.
 *
 * Staggered by position so a grid does not play four animations at once; the
 * operator's own delay wins whenever they set one.
 */
export const animationDelay = (chrome: WidgetChrome, index: number): string =>
  `${chrome.animationDelay || index * 90}ms`;

export { BADGE_TONES };
