import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  cellVars,
  gridVars,
  resolveBands,
  type BannerContent,
  type GridTemplateView,
} from "@/lib/banners/contract";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import { CompositionRenderer, hasOwnLinks } from "@/components/banners/CompositionRenderer";
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
  /* One data attribute per width band; the CSS picks the arrangement. */
  const bands = resolveBands(
    template.cells,
    template.rows,
    template.aspect,
    content.maxHeight,
    content.wideLayout,
  );
  const bandAttrs = {
    "data-b-tablet": bands.tablet,
    "data-b-desktop": bands.desktop,
    "data-b-wide": bands.wide,
    "data-b-ultra": bands.ultra,
  };

  return (
    <div className={cn("banner-shell", className)}>
      <div className="banner-grid bg-k-line" style={gridVars(template, content.maxHeight)}
        {...bandAttrs} data-banner-grid>
        {template.cells.map((cell, index) => {
          const composition = content.cells?.[cell.id];
          const cellResolved = resolved.get(cell.id);

          // `order` only bites while the grid is collapsed to one column;
          // above the breakpoint every cell is placed explicitly.
          const placement = {
            ...cellVars(cell),
            order: cell.mobile?.order ?? index,
          };
          const collapse = cell.mobile?.hidden ? "bn-mobile-hidden" : undefined;

          if (!composition) {
            return (
              <div key={cell.id} style={placement} className={cn("min-w-0 bg-white", collapse)} />
            );
          }

          const body = (
            <CompositionRenderer
              composition={composition}
              resolved={cellResolved}
              locale={locale}
              interactive={interactive}
            />
          );

          // A cell whose buttons carry their own destinations is not itself a
          // link — see `hasOwnLinks`.
          if (!interactive || hasOwnLinks(composition)) {
            return (
              <div key={cell.id} style={placement} className={cn("min-w-0", collapse)}>
                {body}
              </div>
            );
          }

          return (
            <Link
              key={cell.id}
              href={cellResolved?.href || composition.href || "/katalogos"}
              style={placement}
              className={cn("group min-w-0", collapse)}
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
