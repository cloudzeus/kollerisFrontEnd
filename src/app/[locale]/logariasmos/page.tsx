import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { Dashboard } from "@/components/account/Dashboard";
import { getAccountDashboard } from "@/lib/account/dashboard";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { COMPANY_ROLE_LABELS } from "@/lib/account/contract";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "logariasmos.page" });
  return {
    title: t("titlos_o_logariasmos_moy"),
    robots: { index: false, follow: false },
  };
}

/**
 * Account overview.
 *
 * The same page for both account types — what differs is how much of it there
 * is. An individual sees their own details and their order history. A company
 * additionally sees the company card: ΑΦΜ, partner discount, credit, and who
 * else may order on its behalf.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const t = await getTranslations("logariasmos.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const guard = await requireCustomer(locale, "/logariasmos");
  const { user } = guard;
  const dashboard = await getAccountDashboard(user.id, user.email);
  const company = user.company;
  const isCompany = user.accountType === "company";
  const discount = company?.partnerFactor ? Math.round((1 - company.partnerFactor) * 100) : null;

  return (
    <AccountChrome locale={locale}>
      <AccountShell
        user={user}
        active="/logariasmos"
        title={t("kalos_irthate", { firstName: user.firstName })}
        lead={
          isCompany
            ? t("o_etairikos_sas_logariasmos_times")
            : t("oi_paraggelies_oi_dieythynseis_kai")
        }
      >
        {/*
          The old body was a grid of facts about the account. It has been
          replaced wholesale rather than added to: the facts are still
          available on «Τα στοιχεία μου», and a page that leads with them is a
          page that answers a question nobody asked.
        */}
        <Dashboard data={dashboard} locale={locale} />
      </AccountShell>
    </AccountChrome>
  );
}

function Card({
  label,
  value,
  meta,
  mono = false,
}: {
  label: string;
  value: string;
  meta?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-white p-4 lg:p-5">
      <span className="t-account-label text-k-text-4">{upGreek(label)}</span>
      <span
        className={`text-[15px] leading-[1.25] font-semibold text-k-ink ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
      {meta && <span className="t-brand-count text-k-text-4">{meta}</span>}
    </div>
  );
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}
