import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { Dashboard } from "@/components/account/Dashboard";
import { getAccountDashboard } from "@/lib/account/dashboard";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";

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
export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const t = await getTranslations("logariasmos.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const guard = await requireCustomer(locale, "/logariasmos");
  const { user } = guard;
  const dashboard = await getAccountDashboard(user.id, user.email);
  const isCompany = user.accountType === "company";

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
