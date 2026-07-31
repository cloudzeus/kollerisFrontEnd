import { getZone } from "@/lib/zones/zones";
import { ZONES_BY_ID, type WidgetInstance } from "@/lib/zones/registry";
import { cn } from "@/lib/utils";
import { WidgetRenderer, type WidgetContext } from "@/components/zones/WidgetRenderer";
import type { Locale } from "@/i18n/routing";

/**
 * Renders one zone.
 *
 * The layout comes from the zone definition, not from the widgets, so a tile
 * dropped into a 400px column and the same tile in a full-width band are laid
 * out by the slot rather than by whoever configured them.
 *
 * An empty zone renders nothing at all — no wrapper, no spacing. A page with an
 * unfilled zone should look like a page without that zone, not like one with a
 * gap in it.
 */
export async function Zone({
  id,
  locale,
  context,
  className,
}: {
  id: string;
  locale: Locale;
  /** Live figures for {token} substitution. */
  context: WidgetContext;
  className?: string;
}) {
  const def = ZONES_BY_ID.get(id);
  if (!def) return null;

  const widgets = await getZone(id);
  if (widgets.length === 0) return null;

  return (
    <div className={cn(layoutClass(def.layout, def.columns), className)}>
      {widgets.map((w: WidgetInstance, index) => (
        <WidgetRenderer
          key={w.id}
          widget={w}
          locale={locale}
          context={context}
          layout={def.layout}
          index={index}
        />
      ))}
    </div>
  );
}

function layoutClass(layout: string, columns?: number): string {
  switch (layout) {
    case "grid":
      return cn(
        "shell-x grid gap-0.5 bg-k-line",
        columns === 2 && "sm:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 lg:grid-cols-4",
      );
    case "band":
      // Bands stack full-bleed; each widget is its own edge-to-edge strip.
      return "flex flex-col";
    case "carousel":
      // `scroll-slim` and snap points: a horizontal scroller with no snap
      // leaves cards half-visible at rest, which reads as broken.
      return "scroll-slim flex snap-x snap-mandatory gap-0.5 overflow-x-auto bg-k-line";
    case "stack":
    default:
      return "grid gap-0.5 bg-k-line";
  }
}
