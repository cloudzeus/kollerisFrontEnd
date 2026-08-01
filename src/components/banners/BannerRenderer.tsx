import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  cellVars,
  gridVars,
  type BannerContent,
  type GridTemplateView,
} from "@/lib/banners/contract";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import { CompositionRenderer } from "@/components/banners/CompositionRenderer";
import { BannerMotion } from "@/components/banners/BannerMotion";
import type { Locale } from "@/i18n/routing";

/**
 * A banner on the page.
 *
 * One component for the storefront, the editor canvas and the preview modal. A
 * preview built from a second implementation is a promise about the real one
 * that nothing keeps; this way it is WYSIWYG by construction.
 *
 * The grid is the template's own geometry, so a cell drawn 9 units wide is 9
 * units wide everywhere. Below the tablet breakpoint the grid collapses to a
 * single column in cell order — a 12-column layout at 390px is unreadable, and
 * the drawn order is the only ordering information the template carries.
 */

export function BannerRenderer({
  template,
  content,
  resolved,
  locale,
  className,
  /** The editor renders cells without links, so clicking one opens its editor. */
  interactive = true,
  motion = true,
}: {
  template: GridTemplateView;
  content: BannerContent;
  resolved: Map<string, ResolvedCell>;
  locale: Locale;
  className?: string;
  interactive?: boolean;
  /** Off on the editor canvas: an entrance that replays on every keystroke is
   *  not a preview, it is a distraction. On in the preview modal. */
  motion?: boolean;
}) {
  return (
    <div className={cn("banner-shell", className)}>
      <div className="banner-grid bg-k-line" style={gridVars(template)} data-banner-grid>
        {template.cells.map((cell) => {
          const composition = content.cells?.[cell.id];
          const cellResolved = resolved.get(cell.id);

          if (!composition) {
            return <div key={cell.id} style={cellVars(cell)} className="min-w-0 bg-white" />;
          }

          const body = (
            <CompositionRenderer
              composition={composition}
              resolved={cellResolved}
              locale={locale}
            />
          );

          if (!interactive) {
            return (
              <div key={cell.id} style={cellVars(cell)} className="min-w-0">
                {body}
              </div>
            );
          }

          return (
            <Link
              key={cell.id}
              href={cellResolved?.href || composition.href || "/katalogos"}
              style={cellVars(cell)}
              className="group min-w-0"
            >
              {body}
            </Link>
          );
        })}
        {motion && <BannerMotion />}
      </div>
    </div>
  );
}
