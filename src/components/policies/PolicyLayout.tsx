import { Link } from "@/i18n/navigation";
import type { PolicyContent } from "@/lib/policies/types";
import { upGreek } from "@/lib/greek";

/**
 * The shell every legal page uses.
 *
 * Deliberately the same hero-band-contact shape as `/syxnes-erotiseis` and
 * `/etaireia` — a visitor should not be able to tell a policy page apart from
 * the rest of the site by its layout, only by its content being legal prose
 * instead of a product story. The prose itself renders through
 * `.prose-kolleris`, the same class the blog already uses for HTML body copy.
 */
export function PolicyLayout({
  content,
  homeLabel,
  contactLabel,
  updatedLabel,
}: {
  content: PolicyContent;
  homeLabel: string;
  contactLabel: string;
  /** e.g. "Τελευταία ενημέρωση" / "Last updated" / "Ultimo aggiornamento". */
  updatedLabel: string;
}) {
  return (
    <main id="main">
      <div className="shell-x bg-k-ink-deep">
        <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
          <Link href="/" className="text-white/60 hover:text-white">
            {upGreek(homeLabel)}
          </Link>
          <span className="text-k-red">/</span>
          <span className="text-white">{upGreek(content.title)}</span>
        </nav>

        <div className="pt-2.5 pb-9 lg:pb-12">
          <h1 className="font-artegra text-[24px] leading-[1.16] font-medium text-balance text-white lg:text-[36px]">
            {upGreek(content.title)}
          </h1>
          <p className="t-account-label mt-3 text-white/45">
            {updatedLabel}: {content.updated}
          </p>
        </div>
      </div>

      <section className="band-base">
        <div className="shell-x max-w-[860px] py-9 lg:py-14">
          <div className="prose-kolleris">
            {content.intro && <p>{content.intro}</p>}
            {content.sections.map((section, index) => (
              <div key={section.heading ?? index}>
                {section.heading && <h2>{section.heading}</h2>}
                {section.paragraphs?.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
                {section.list && (
                  <ul>
                    {section.list.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="band-ink band-grid">
        <div className="rule-hazard" />
        <div className="shell-x py-9 lg:py-12">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <p className="t-h2 text-balance text-white">{upGreek(contactLabel)}</p>
            <div className="flex flex-wrap gap-3">
              <a
                href="tel:+302104111355"
                className="t-btn bg-k-red px-8 py-4 text-white transition-colors hover:bg-k-red-hover"
              >
                210 411 1355
              </a>
              <Link
                href="/epikoinonia"
                className="t-btn-outline border-[1.5px] border-white/34 px-7 py-4 text-white transition-colors hover:border-white hover:bg-white hover:text-k-ink"
              >
                {upGreek(contactLabel)}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
