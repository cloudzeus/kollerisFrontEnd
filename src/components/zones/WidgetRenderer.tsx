import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";
import { cn } from "@/lib/utils";
import {
  BADGE_TONES,
  propBool,
  propString,
  propText,
  resolveTokens,
  type WidgetInstance,
} from "@/lib/zones/registry";
import type { Locale } from "@/i18n/routing";

/**
 * Renders one widget.
 *
 * Everything a widget can carry — badge, background, animation — is handled
 * here rather than in each type, so a new widget type is a body and nothing
 * else, and none of them can forget the overlay that makes text legible over a
 * photograph.
 *
 * Animation is CSS, not a library. These are one-shot entrances of a few
 * elements; a motion runtime would cost more than it animates. Every variant is
 * defined under a `motion-safe:` prefix, so `prefers-reduced-motion` disables
 * them without a second code path — motion is a flourish, and for some people
 * it is a symptom.
 *
 * The banner grid is a different renderer with its own layer model; these
 * values are not shared with it, since the two express different things.
 */

const OVERLAY: Record<string, string> = {
  none: "",
  light: "bg-[linear-gradient(180deg,transparent_20%,rgba(16,16,18,.55)_100%)]",
  medium: "bg-[linear-gradient(180deg,rgba(16,16,18,.15)_0%,rgba(16,16,18,.72)_100%)]",
  strong: "bg-[linear-gradient(180deg,rgba(16,16,18,.45)_0%,rgba(16,16,18,.88)_100%)]",
};

const ANIMATION: Record<string, string> = {
  none: "",
  "fade-up": "motion-safe:animate-[zone-fade-up_.6s_cubic-bezier(.22,1,.36,1)_both]",
  "slide-in": "motion-safe:animate-[zone-slide-in_.6s_cubic-bezier(.22,1,.36,1)_both]",
  reveal: "motion-safe:animate-[zone-reveal_.7s_cubic-bezier(.22,1,.36,1)_both]",
  zoom: "motion-safe:animate-[zone-zoom_.7s_cubic-bezier(.22,1,.36,1)_both]",
};


export type WidgetContext = {
  products: string;
  brands: string;
  categories: string;
  freeShipping: string;
};

export function WidgetRenderer({
  widget,
  locale,
  context,
  layout,
  index,
}: {
  widget: WidgetInstance;
  locale: Locale;
  context: WidgetContext;
  layout: string;
  index: number;
}) {
  const p = widget.props;
  const t = (name: string) => resolveTokens(propText(p, name, locale), context);

  const href = propString(p, "href") || "/katalogos";
  const badge = propString(p, "badge");
  const tone = propString(p, "badgeTone") || "red";
  const dark = propBool(p, "dark");
  const bgKind = propString(p, "bgKind") || "none";
  const bgImage = propString(p, "bgImage");
  const bgVideo = propString(p, "bgVideo");
  const bgPoster = propString(p, "bgPoster");
  const overlay = OVERLAY[propString(p, "bgOverlay") || "medium"] ?? "";
  const image = propString(p, "image") || bgImage;

  const animation = ANIMATION[propString(p, "animation") || "none"] ?? "";
  const delay = propString(p, "animationDelay");
  const badgeClass = BADGE_TONES.find((b) => b.value === tone)?.className ?? "bg-k-red text-white";

  const hasMedia = Boolean(image) || (bgKind === "video" && Boolean(bgVideo));
  const onDark = dark || hasMedia;

  const title = t("title");
  const eyebrow = t("eyebrow");
  const body = t("body");
  const cta = t("cta");

  return (
    <Link
      href={href}
      className={cn(
        "group relative isolate flex flex-col justify-end overflow-hidden",
        layout === "band"
          ? "min-h-[240px] px-5 py-10 lg:min-h-[320px] lg:px-16 lg:py-14"
          : "min-h-[200px] p-5 lg:p-6",
        layout === "carousel" && "w-[17rem] shrink-0 snap-start",
        onDark ? "bg-k-ink" : "bg-white",
      )}
    >
      {/* ── Φόντο ── */}
      {bgKind === "video" && bgVideo ? (
        <video
          src={bgVideo}
          poster={bgPoster || undefined}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 -z-10 size-full object-cover"
        />
      ) : image ? (
        <Image
          src={image}
          alt=""
          fill
          sizes={layout === "band" ? "100vw" : "(min-width:1024px) 33vw, 100vw"}
          className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          unoptimized
        />
      ) : null}

      {hasMedia && overlay && <div className={cn("absolute inset-0 -z-10", overlay)} />}

      {/* ── Σήμανση ── */}
      {badge && (
        <span
          className={cn(
            "absolute left-0 top-0 px-2.5 py-1 text-[10px] font-medium tracking-[0.08em]",
            badgeClass,
          )}
        >
          {badge}
        </span>
      )}

      {/* ── Κείμενο ── */}
      <div
        className={cn("flex flex-col gap-1.5", animation)}
        // Staggered by position so a grid does not fire four animations at once;
        // the operator's own delay wins when they set one.
        style={{
          animationDelay: `${delay && delay !== "0" ? Number(delay) : index * 90}ms`,
        }}
      >
        {eyebrow && (
          <span
            className={cn(
              "t-eyebrow",
              onDark ? "text-k-red" : "text-k-text-4",
            )}
          >
            {upGreek(eyebrow)}
          </span>
        )}

        {title && (
          <span
            className={cn(
              "text-balance font-semibold leading-[1.15] tracking-tight",
              layout === "band" ? "text-[26px] lg:text-[38px]" : "text-[19px] lg:text-[21px]",
              onDark ? "text-white" : "text-k-ink",
            )}
          >
            {upGreek(title)}
          </span>
        )}

        {body && (
          <span
            className={cn(
              "max-w-[46ch] text-[13px] leading-[1.55]",
              onDark ? "text-white/72" : "text-k-text-2",
            )}
          >
            {body}
          </span>
        )}

        {cta && (
          <span
            className={cn(
              "mt-1.5 inline-flex w-fit items-center gap-1.5 border-b-[1.5px] pb-0.5 text-[12.5px] font-medium tracking-wide transition-colors",
              onDark
                ? "border-k-red text-white group-hover:border-white"
                : "border-k-red text-k-ink group-hover:border-k-ink",
            )}
          >
            {upGreek(cta)}
            <span aria-hidden>→</span>
          </span>
        )}
      </div>
    </Link>
  );
}
