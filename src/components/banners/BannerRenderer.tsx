import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";
import { cn } from "@/lib/utils";
import { ANIMATION, OVERLAY, animationDelay, badgeClass } from "@/components/banners/chrome";
import { cellVars, gridVars, type GridTemplateView } from "@/lib/banners/contract";
import type { ResolvedWidget } from "@/lib/banners/resolve";

/**
 * A banner on the page.
 *
 * One component for the storefront, the editor canvas and the preview modal.
 * A preview built from a second implementation is a promise about the real one
 * that nothing keeps; this way it is WYSIWYG by construction.
 *
 * The grid is the template's own geometry, so a cell drawn 9 units wide is 9
 * units wide everywhere. Below the tablet breakpoint the grid collapses to a
 * single column in cell order — a 12-column layout at 390px is unreadable, and
 * the drawn order is the only ordering information the template carries.
 */

export function BannerRenderer({
  template,
  widgets,
  className,
  /** The editor renders cells without links, so clicking one opens its config. */
  interactive = true,
}: {
  template: GridTemplateView;
  widgets: Map<string, ResolvedWidget>;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div className={cn("banner-shell", className)}>
      <div className="banner-grid bg-k-line" style={gridVars(template)} data-banner-grid>
        {template.cells.map((cell, index) => {
          const widget = widgets.get(cell.id);
          return (
            <div key={cell.id} style={cellVars(cell)} className="min-w-0">
              {widget ? (
                <BannerCell widget={widget} index={index} interactive={interactive} />
              ) : (
                <div className="size-full bg-white" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BannerCell({
  widget: w,
  index,
  interactive = true,
}: {
  widget: ResolvedWidget;
  index: number;
  interactive?: boolean;
}) {
  const hasMedia = w.media.kind !== "none" && Boolean(w.media.image || w.media.video);
  // Text over a photograph is white text; text on a bare cell is ink on white.
  // The operator's `dark` forces the first without needing a background.
  const onDark = w.chrome.dark || hasMedia;
  const overlay = OVERLAY[w.chrome.overlay] ?? "";
  const animation = ANIMATION[w.chrome.animation] ?? "";

  const body = (
    <>
      {w.media.kind === "video" && w.media.video ? (
        <video
          src={w.media.video}
          poster={w.media.poster || undefined}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 -z-10 size-full object-cover"
        />
      ) : w.media.image ? (
        <Image
          src={w.media.image}
          alt=""
          fill
          sizes="(min-width:1024px) 50vw, 100vw"
          className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          unoptimized
        />
      ) : null}

      {hasMedia && overlay && <div className={cn("absolute inset-0 -z-10", overlay)} />}

      {w.chrome.badge && (
        <span
          className={cn(
            "absolute left-0 top-0 px-2.5 py-1 text-[10px] font-medium tracking-[0.08em]",
            badgeClass(w.chrome.badgeTone),
          )}
        >
          {w.chrome.badge}
        </span>
      )}

      <div
        className={cn("flex flex-col gap-1.5", animation)}
        style={{ animationDelay: animationDelay(w.chrome, index) }}
      >
        {w.eyebrow && (
          <span className={cn("t-eyebrow", onDark ? "text-k-red" : "text-k-text-4")}>
            {upGreek(w.eyebrow)}
          </span>
        )}

        {w.title && (
          <span
            className={cn(
              "text-balance text-[19px] font-semibold leading-[1.15] tracking-tight lg:text-[24px]",
              onDark ? "text-white" : "text-k-ink",
            )}
          >
            {upGreek(w.title)}
          </span>
        )}

        {w.body && (
          <span
            className={cn(
              "max-w-[46ch] text-[13px] leading-[1.55]",
              onDark ? "text-white/72" : "text-k-text-2",
            )}
          >
            {w.body}
          </span>
        )}

        {(w.price || w.comparePrice) && (
          <span className="mt-0.5 flex items-baseline gap-2">
            {w.price && (
              <span
                className={cn(
                  "numeral text-[17px] font-semibold tracking-tight",
                  onDark ? "text-white" : "text-k-ink",
                )}
              >
                {w.price}
              </span>
            )}
            {w.comparePrice && (
              <span
                className={cn(
                  "numeral text-[12.5px] line-through",
                  onDark ? "text-white/55" : "text-k-text-4",
                )}
              >
                {w.comparePrice}
              </span>
            )}
          </span>
        )}

        {w.countdownTo && <Countdown to={w.countdownTo} onDark={onDark} />}

        {w.cta && (
          <span
            className={cn(
              "mt-1.5 inline-flex w-fit items-center gap-1.5 border-b-[1.5px] pb-0.5 text-[12.5px] font-medium tracking-wide transition-colors",
              onDark
                ? "border-k-red text-white group-hover:border-white"
                : "border-k-red text-k-ink group-hover:border-k-ink",
            )}
          >
            {upGreek(w.cta)}
            <span aria-hidden>→</span>
          </span>
        )}
      </div>
    </>
  );

  const shell = cn(
    "group relative isolate flex size-full flex-col justify-end overflow-hidden p-5 lg:p-6",
    onDark ? "bg-k-ink" : "bg-white",
  );

  // Inside the editor the cell is a button target, so it must not be a link.
  if (!interactive) return <div className={shell}>{body}</div>;

  return (
    <Link href={w.href} className={shell}>
      {body}
    </Link>
  );
}

/**
 * Server-rendered countdown.
 *
 * The remaining time is printed once, at render. A ticking clock needs a client
 * component in every cell that has one, and a banner is not a checkout timer —
 * "ends in 3 days" is the information, and the second hand is decoration that
 * costs hydration on the landing page.
 */
function Countdown({ to, onDark }: { to: string; onDark: boolean }) {
  const ms = new Date(to).getTime() - Date.now();
  if (ms <= 0) return null;

  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const label =
    days > 0
      ? `Λήγει σε ${days} ${days === 1 ? "ημέρα" : "ημέρες"}`
      : `Λήγει σε ${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;

  return (
    <span
      className={cn(
        "numeral mt-0.5 w-fit border px-2 py-0.5 text-[11.5px] font-medium",
        onDark ? "border-white/30 text-white" : "border-k-line text-k-text-2",
      )}
    >
      {label}
    </span>
  );
}
