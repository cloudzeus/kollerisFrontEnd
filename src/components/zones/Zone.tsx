import { getZone } from "@/lib/zones/zones";
import { getPublishedBanner } from "@/lib/banners/banners";
import { resolveCells } from "@/lib/banners/resolve";
import { ZONES_BY_ID, type WidgetInstance } from "@/lib/zones/registry";
import { cn } from "@/lib/utils";
import { BannerRenderer } from "@/components/banners/BannerRenderer";
import { WidgetRenderer, type WidgetContext } from "@/components/zones/WidgetRenderer";
import type { Locale } from "@/i18n/routing";

/**
 * Renders one zone.
 *
 * A zone can hold either a banner — a saved grid with a widget per cell — or
 * the older flat list of widgets. The banner wins when one is assigned, which
 * is what makes the two coexist: pages built the old way keep working
 * untouched, and a zone converts the moment somebody assigns a banner to it.
 *
 * The layout of the list form comes from the zone definition, not from the
 * widgets, so a tile dropped into a 400px column and the same tile in a
 * full-width band are laid out by the slot rather than by whoever configured
 * them. A banner brings its own geometry and ignores the slot's.
 *
 * An empty zone renders nothing at all — no wrapper, no spacing. A page with an
 * unfilled zone should look like a page without that zone, not like one with a
 * gap in it.
 */
/**
 * Does this zone actually have something to render?
 *
 * `<Zone/>` is a React element, so it is truthy even when it renders nothing.
 * A caller that writes `zone ? zone : fallback` therefore always picks the
 * zone — which is how the homepage hero came to show a 400px column of empty
 * white beside it, with a perfectly good fallback sitting unreachable in the
 * same file. Callers that need to choose have to ask.
 */
export async function zoneHasContent(id: string): Promise<boolean> {
  if (!ZONES_BY_ID.has(id)) return false;
  if (await getPublishedBanner(id)) return true;
  return (await getZone(id)).length > 0;
}

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

  const banner = await getPublishedBanner(id);
  if (banner) {
    return (
      <BannerRenderer
        template={banner.template}
        content={banner.content}
        resolved={await resolveCells(banner.content, locale)}
        locale={locale}
        className={className}
      />
    );
  }

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
