import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Shared eyebrow + H2 (+ optional right-hand link) used by every homepage band.
 * On mobile the handoff stacks the link below the heading rather than beside it.
 */
export function SectionHeading({
  eyebrow,
  title,
  action,
  center = false,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: { href: string; label: string };
  center?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={
        center
          ? "mb-6 text-center lg:mb-[34px]"
          : "mb-[18px] flex flex-col gap-3 lg:mb-8 lg:flex-row lg:items-end lg:justify-between lg:gap-4"
      }
    >
      <div>
        <p className="t-eyebrow mb-2 text-k-red lg:mb-3">{upGreek(eyebrow)}</p>
        <h2 className="t-h2 text-k-ink">{upGreek(title)}</h2>
        {children}
      </div>

      {action && (
        <Link
          href={action.href}
          className="t-link-mono self-start border-b-[1.5px] border-k-red pb-[3px] text-k-ink transition-colors hover:text-k-red"
        >
          {upGreek(action.label)} →
        </Link>
      )}
    </div>
  );
}
