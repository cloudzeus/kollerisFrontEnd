import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { signOut } from "@/lib/account/actions";
import type { AccountUser } from "@/lib/account/contract";
import { COMPANY_ROLE_LABELS } from "@/lib/account/contract";
import { upGreek } from "@/lib/greek";

/**
 * Account rail + page frame — a SERVER component.
 *
 * The rail is where the two account types visibly differ. An individual sees
 * their own orders, addresses and warranties. A company sees all of that plus
 * the sections that only exist because the account is a COMPANY: partner
 * pricing, invoices, and the users who may order on its behalf.
 *
 * Sections whose pages have not been built are rendered as disabled rows rather
 * than omitted. Omitting them would make the account area look complete; a
 * dead link would be worse. This way the shape is honest and nothing 404s.
 */

/** The label is a message key: this list must be able to speak three languages. */
type Item = { href: string; label: string; ready: boolean; companyOnly?: boolean };

const ITEMS: Item[] = [
  { href: "/logariasmos", label: "nav_logariasmos", ready: true },
  { href: "/logariasmos/stoicheia", label: "nav_logariasmos_stoicheia", ready: true },
  { href: "/logariasmos/paraggelies", label: "nav_logariasmos_paraggelies", ready: true },
  { href: "/logariasmos/dieuthynseis", label: "nav_logariasmos_dieuthynseis", ready: true },
  { href: "/logariasmos/eggyiseis", label: "nav_logariasmos_eggyiseis", ready: false },
  { href: "/logariasmos/epistrofes", label: "nav_logariasmos_epistrofes", ready: false },
  { href: "/logariasmos/agapimena", label: "nav_logariasmos_agapimena", ready: true },
  { href: "/logariasmos/axiologiseis", label: "nav_logariasmos_axiologiseis", ready: true },
  // ── Company only ──
  { href: "/b2b", label: "nav_b2b", ready: true, companyOnly: true },
  { href: "/b2b/xristes", label: "nav_b2b_xristes", ready: true, companyOnly: true },
  { href: "/b2b/timologia", label: "nav_b2b_timologia", ready: false, companyOnly: true },
  { href: "/b2b/listes", label: "nav_b2b_listes", ready: false, companyOnly: true },
];

export function AccountShell({
  user,
  active,
  title,
  lead,
  children,
}: {
  user: AccountUser;
  active: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("account.AccountShell");
  const isCompany = user.accountType === "company";
  const items = ITEMS.filter((item) => !item.companyOnly || isCompany);
  const company = user.company;

  return (
    <main>
      <div className="shell-x bg-k-ink-deep">
        <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
          <Link href="/" className="text-white/60 hover:text-white">
            {upGreek(t("archiki"))}
          </Link>
          <span className="text-k-red">/</span>
          <span className="text-white">{upGreek(isCompany ? t("etairikos_logariasmos") : t("o_logariasmos_moy"))}</span>
        </nav>

        <div className="flex flex-col gap-5 pt-2.5 pb-7 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div className="min-w-0">
            <h1 className="font-display text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
              {upGreek(title)}
            </h1>
            {lead && (
              <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
                {lead}
              </p>
            )}
          </div>

          <div className="shrink-0 border-l-[3px] border-k-red pl-4">
            <span className="t-eyebrow block text-k-red">
              {upGreek(isCompany ? t("etaireia") : t("idiotis"))}
            </span>
            <span className="mt-1.5 block text-[13px] leading-[1.35] text-white lg:text-[15px]">
              {isCompany && company ? upGreek(company.name) : `${user.firstName} ${user.lastName}`}
            </span>
            <span className="t-brand-count mt-1 block text-white/45">
              {isCompany && user.role
                ? upGreek(COMPANY_ROLE_LABELS[user.role])
                : user.email}
            </span>
          </div>
        </div>
      </div>

      <div className="shell-w bg-white lg:grid lg:grid-cols-[280px_1fr] lg:items-start">
        <aside className="border-b border-k-line lg:border-r lg:border-b-0">
          <ul className="flex overflow-x-auto lg:flex-col lg:overflow-visible">
            {items.map((item) => {
  const t = useTranslations("account.AccountShell");
              const isActive = item.href === active;
              if (!item.ready) {
                return (
                  <li key={item.href} className="shrink-0">
                    <span
                      aria-disabled
                      title={t("den_echei_energopoiithei_akomi")}
                      className="t-nav-sub flex cursor-not-allowed items-center gap-2 border-b border-transparent px-4 py-3.5 text-k-text-5 lg:border-b-k-line lg:px-6"
                    >
                      {upGreek(t(item.label))}
                      <span className="t-brand-count shrink-0 border border-k-line-2 px-1 py-px text-k-text-5">
                        {upGreek(t("syntoma"))}
                      </span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href} className="shrink-0">
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`t-nav-sub flex items-center gap-2 border-b-2 px-4 py-3.5 whitespace-nowrap transition-colors lg:border-b lg:border-l-2 lg:px-6 ${
                      isActive
                        ? "border-b-k-red bg-k-surface-2 text-k-ink lg:border-b-k-line lg:border-l-k-red"
                        : "border-b-transparent text-k-text-3 hover:text-k-ink lg:border-b-k-line lg:border-l-transparent"
                    }`}
                  >
                    {upGreek(t(item.label))}
                  </Link>
                </li>
              );
            })}
          </ul>

          <form action={signOut} className="p-4 lg:px-6 lg:py-5">
            <button
              type="submit"
              className="t-btn-sm w-full border-[1.5px] border-k-ink px-5 py-3 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek(t("aposyndesi"))}
            </button>
          </form>
        </aside>

        <div className="min-w-0 px-4 py-6 lg:px-10 lg:pt-8 lg:pb-12">{children}</div>
      </div>
    </main>
  );
}
