import {
  BADGE_TONES,
  propBool,
  propString,
  propText,
  type WidgetInstance,
  type ZoneDef,
} from "@/lib/zones/registry";
import { cn } from "@/lib/utils";

/**
 * What the zone will look like.
 *
 * A scaled approximation, not an iframe of the real page. An iframe would be
 * truer and would also mean a full render per keystroke; this is close enough to
 * answer the questions somebody actually has while arranging tiles — is the
 * badge visible on that photo, does the title fit, is the order right.
 *
 * Disabled widgets are shown greyed rather than hidden, because the preview is
 * also how you check that hiding one did what you meant.
 */

const OVERLAY: Record<string, string> = {
  none: "",
  light: "bg-k-ink/25",
  medium: "bg-k-ink/50",
  strong: "bg-k-ink/70",
};

export function ZonePreview({ zone, widgets }: { zone: ZoneDef; widgets: WidgetInstance[] }) {
  if (widgets.length === 0) {
    return (
      <div className="grid place-items-center border border-dashed border-k-line-2 bg-white px-4 py-12 text-center text-[12px] text-k-text-4">
        Άδεια ζώνη
      </div>
    );
  }

  return (
    <div
      className={cn(
        "border border-k-line bg-white p-3",
        zone.layout === "grid" && "grid gap-2",
        zone.layout === "grid" && zone.columns === 2 && "grid-cols-2",
        zone.layout === "grid" && zone.columns === 3 && "grid-cols-2",
        zone.layout === "stack" && "space-y-2",
        zone.layout === "band" && "space-y-2",
        zone.layout === "carousel" && "flex gap-2 overflow-x-auto",
      )}
    >
      {widgets.map((w) => (
        <Tile key={w.id} widget={w} layout={zone.layout} />
      ))}
    </div>
  );
}

function Tile({ widget, layout }: { widget: WidgetInstance; layout: string }) {
  const title = propText(widget.props, "title", "el");
  const eyebrow = propText(widget.props, "eyebrow", "el");
  const body = propText(widget.props, "body", "el");
  const badge = propString(widget.props, "badge");
  const tone = propString(widget.props, "badgeTone") || "red";
  const dark = propBool(widget.props, "dark");
  const bgKind = propString(widget.props, "bgKind") || "none";
  const image = propString(widget.props, "image") || propString(widget.props, "bgImage");
  const overlay = OVERLAY[propString(widget.props, "bgOverlay") || "medium"] ?? "";
  const animation = propString(widget.props, "animation");
  const badgeClass =
    BADGE_TONES.find((t) => t.value === tone)?.className ?? "bg-k-red text-white";

  const hasMedia = Boolean(image) || bgKind === "video";

  return (
    <div
      className={cn(
        "relative overflow-hidden border border-k-line",
        layout === "carousel" && "w-36 shrink-0",
        layout === "band" ? "aspect-[16/5]" : "aspect-[4/3]",
        dark || hasMedia ? "bg-k-ink" : "bg-k-surface-2",
        !widget.enabled && "opacity-40 grayscale",
      )}
    >
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 size-full object-cover" />
      )}
      {bgKind === "video" && !image && (
        <div className="absolute inset-0 grid place-items-center text-[9px] uppercase tracking-widest text-white/40">
          βίντεο
        </div>
      )}
      {hasMedia && overlay && <div className={cn("absolute inset-0", overlay)} />}

      {badge && (
        <span className={cn("absolute left-1.5 top-1.5 px-1 py-px text-[8px]", badgeClass)}>
          {badge}
        </span>
      )}

      <div className="relative flex h-full flex-col justify-end gap-0.5 p-2">
        {eyebrow && (
          <span
            className={cn(
              "text-[7px] uppercase tracking-[0.1em]",
              dark || hasMedia ? "text-k-red" : "text-k-text-4",
            )}
          >
            {eyebrow}
          </span>
        )}
        <span
          className={cn(
            "line-clamp-2 text-[10px] font-semibold leading-tight",
            dark || hasMedia ? "text-white" : "text-k-ink",
          )}
        >
          {title || "Χωρίς τίτλο"}
        </span>
        {body && (
          <span
            className={cn(
              "line-clamp-2 text-[8px] leading-tight",
              dark || hasMedia ? "text-white/70" : "text-k-text-3",
            )}
          >
            {body}
          </span>
        )}
      </div>

      {animation && animation !== "none" && (
        <span className="absolute right-1.5 top-1.5 bg-white/85 px-1 py-px text-[7px] uppercase tracking-wider text-k-ink">
          κίνηση
        </span>
      )}
    </div>
  );
}
