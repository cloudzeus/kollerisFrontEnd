import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";
import { cn } from "@/lib/utils";
import type { OfferRow, OfferWidgetKind } from "@/lib/offers/offer-types";
import { OfferCountdown } from "@/components/offers/OfferCountdown";
import type { Locale } from "@/i18n/routing";

/**
 * A campaign, presented.
 *
 * Four ready-made looks rather than a layout editor: an offer is a headline, a
 * saving and a deadline, and the useful question is which shape suits the slot —
 * not where to drag the badge. The banner grid already exists for the cases that
 * need drawing.
 *
 * One component for the storefront and for the wizard's preview, so what an
 * operator approves is the thing that ships.
 *
 * Motion is CSS. Every entrance sits behind `motion-safe:`, so
 * `prefers-reduced-motion` removes it with no second code path; the marquee and
 * the pulse stop dead for the same reason. Only the countdown needs JavaScript,
 * because a deadline that does not move is a picture of a deadline.
 */

export type OfferView = Pick<
  OfferRow,
  | "slug" | "badge" | "href" | "image" | "imageWide" | "video" | "endsAt"
  | "discount" | "discountValue" | "bogoBuy" | "bogoFree" | "widget"
> & { title: string; description: string };

/** The saving in the fewest honest words. Empty when there is no arithmetic. */
export function savingLabel(offer: Pick<OfferView, "discount" | "discountValue" | "bogoBuy" | "bogoFree">): string {
  switch (offer.discount) {
    case "percent":
      return offer.discountValue ? `−${offer.discountValue}%` : "";
    case "amount":
      return offer.discountValue ? `−${offer.discountValue}€` : "";
    case "bogo":
      return offer.bogoBuy && offer.bogoFree ? `${offer.bogoBuy}+${offer.bogoFree}` : "";
    default:
      return "";
  }
}

export function OfferWidget({
  offer,
  locale,
  className,
  interactive = true,
}: {
  offer: OfferView;
  locale: Locale;
  className?: string;
  /**
   * Whether the widget is a link.
   *
   * Off inside the admin. The localised `Link` needs next-intl's provider and
   * `/admin` sits outside the locale tree on purpose — rendering one there
   * throws "No intl context found" and takes the screen down. A preview has
   * nowhere to navigate to anyway.
   */
  interactive?: boolean;
}) {
  const props = { offer, locale, className, interactive };
  switch (offer.widget) {
    case "card":
      return <Card {...props} />;
    case "marquee":
      return <Marquee {...props} />;
    case "countdown":
      return <Countdown {...props} />;
    default:
      return <Strip {...props} />;
  }
}

/**
 * The widget's outer box: an anchor on the storefront, a plain div in a preview.
 *
 * Written once here rather than branched in four places — the last two times
 * this pattern appeared it was forgotten in one of them.
 */
function Shell({
  href,
  interactive,
  className,
  children,
}: {
  href: string;
  interactive: boolean;
  className: string;
  children: React.ReactNode;
}) {
  if (!interactive) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

type WidgetProps = { offer: OfferView; locale: Locale; className?: string; interactive: boolean };

/* ───────────────────────────── Λωρίδα ───────────────────────────── */

function Strip({ offer, className, interactive }: WidgetProps) {
  const saving = savingLabel(offer);

  return (
    <Shell
      href={offer.href}
      interactive={interactive}
      className={cn(
        "group relative isolate flex flex-wrap items-center gap-x-6 gap-y-3 overflow-hidden bg-k-ink px-5 py-6 lg:px-12 lg:py-8",
        className,
      )}
    >
      {offer.image && (
        <span
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-25 transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url(${offer.imageWide || offer.image})` }}
          aria-hidden
        />
      )}

      {saving && (
        <span className="motion-safe:animate-[offer-pop_.5s_cubic-bezier(.22,1.4,.36,1)_both] shrink-0 bg-k-red px-3 py-2 font-mono text-[26px] font-semibold leading-none text-white lg:text-[34px]">
          {saving}
        </span>
      )}

      <span className="min-w-0 flex-1 motion-safe:animate-[offer-rise_.6s_cubic-bezier(.22,1,.36,1)_both] motion-safe:[animation-delay:80ms]">
        <span className="block text-balance text-[20px] font-semibold leading-[1.15] tracking-tight text-white lg:text-[28px]">
          {upGreek(offer.title)}
        </span>
        {offer.description && (
          <span className="mt-1 block max-w-[62ch] text-[13px] leading-[1.55] text-white/70">
            {offer.description}
          </span>
        )}
      </span>

      <span className="motion-safe:animate-[offer-rise_.6s_cubic-bezier(.22,1,.36,1)_both] motion-safe:[animation-delay:160ms] inline-flex shrink-0 items-center gap-1.5 border-b-[1.5px] border-k-red pb-0.5 text-[12.5px] font-medium tracking-wide text-white transition-colors group-hover:border-white">
        {upGreek(offer.badge || "Δείτε την προσφορά")}
        <span aria-hidden>→</span>
      </span>
    </Shell>
  );
}

/* ───────────────────────────── Κάρτα ───────────────────────────── */

function Card({ offer, className, interactive }: WidgetProps) {
  const saving = savingLabel(offer);

  return (
    <Shell
      href={offer.href}
      interactive={interactive}
      className={cn(
        "group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden bg-k-ink p-5",
        className,
      )}
    >
      {offer.image && (
        <span
          className="absolute inset-0 -z-10 bg-cover bg-center transition-transform duration-700 group-hover:scale-[1.06]"
          style={{ backgroundImage: `url(${offer.image})` }}
          aria-hidden
        />
      )}
      <span
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(16,16,18,.15)_0%,rgba(16,16,18,.85)_100%)]"
        aria-hidden
      />

      {saving && (
        <span className="motion-safe:animate-[offer-pop_.5s_cubic-bezier(.22,1.4,.36,1)_both] absolute right-4 top-4 bg-k-red px-2.5 py-1.5 font-mono text-[19px] font-semibold leading-none text-white">
          {saving}
        </span>
      )}

      <span className="motion-safe:animate-[offer-rise_.6s_cubic-bezier(.22,1,.36,1)_both] block">
        {offer.badge && (
          <span className="t-eyebrow mb-1.5 block text-k-red">{upGreek(offer.badge)}</span>
        )}
        <span className="block text-balance text-[21px] font-semibold leading-[1.15] tracking-tight text-white">
          {upGreek(offer.title)}
        </span>
        {offer.description && (
          <span className="mt-1.5 block text-[12.5px] leading-[1.5] text-white/70">
            {offer.description}
          </span>
        )}
      </span>
    </Shell>
  );
}

/* ───────────────────────────── Ταινία ───────────────────────────── */

/**
 * The same line, running.
 *
 * Two copies of the track side by side, translated by exactly half: the loop is
 * seamless because the second copy is where the first was when the animation
 * restarts. `aria-hidden` on the duplicate — a screen reader should hear the
 * offer once, not twice.
 */
function Marquee({ offer, className, interactive }: WidgetProps) {
  const saving = savingLabel(offer);
  const line = [offer.title, saving, offer.badge].filter(Boolean).join("  ·  ");

  return (
    <Shell
      href={offer.href}
      interactive={interactive}
      className={cn("group relative block overflow-hidden bg-k-red py-3", className)}
    >
      <span className="flex w-max motion-safe:animate-[offer-marquee_22s_linear_infinite] group-hover:[animation-play-state:paused]">
        {[0, 1].map((copy) => (
          <span key={copy} className="flex shrink-0" aria-hidden={copy === 1 ? true : undefined}>
            {Array.from({ length: 4 }, (_, i) => (
              <span
                key={i}
                className="whitespace-nowrap px-6 text-[15px] font-semibold tracking-[0.06em] text-white lg:text-[17px]"
              >
                {upGreek(line)}
              </span>
            ))}
          </span>
        ))}
      </span>
    </Shell>
  );
}

/* ─────────────────────────── Μέτρηση ─────────────────────────── */

function Countdown({ offer, className, interactive }: WidgetProps) {
  const saving = savingLabel(offer);

  return (
    <Shell
      href={offer.href}
      interactive={interactive}
      className={cn(
        "group relative isolate flex flex-col items-center gap-4 overflow-hidden bg-k-ink px-5 py-8 text-center lg:py-12",
        className,
      )}
    >
      {offer.image && (
        <span
          className="absolute inset-0 -z-10 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${offer.imageWide || offer.image})` }}
          aria-hidden
        />
      )}

      <span className="motion-safe:animate-[offer-rise_.6s_cubic-bezier(.22,1,.36,1)_both] block">
        {saving && (
          <span className="mb-2 inline-block bg-k-red px-2.5 py-1 font-mono text-[15px] font-semibold text-white">
            {saving}
          </span>
        )}
        <span className="block text-balance text-[22px] font-semibold leading-[1.15] tracking-tight text-white lg:text-[30px]">
          {upGreek(offer.title)}
        </span>
        {offer.description && (
          <span className="mx-auto mt-1.5 block max-w-[52ch] text-[13px] leading-[1.55] text-white/70">
            {offer.description}
          </span>
        )}
      </span>

      {/* The one place a client component earns its weight: a deadline that
          does not move is a picture of a deadline. */}
      <OfferCountdown endsAt={offer.endsAt ? offer.endsAt.toISOString() : null} />
    </Shell>
  );
}

export const WIDGET_LABEL: Record<OfferWidgetKind, string> = {
  strip: "Λωρίδα",
  card: "Κάρτα",
  marquee: "Ταινία",
  countdown: "Αντίστροφη μέτρηση",
};

export const WIDGET_HINT: Record<OfferWidgetKind, string> = {
  strip: "Πλήρες πλάτος. Διαβάζεται σε κάθε οθόνη — η ασφαλής επιλογή.",
  card: "Πλακίδιο 4:5 με την εικόνα από πίσω. Για πλέγματα και στήλες.",
  marquee: "Τρέχουσα γραμμή. Δυνατή, αλλά μόνο μία ανά σελίδα.",
  countdown: "Δείχνει πόσο μένει. Χρειάζεται ημερομηνία λήξης.",
};
