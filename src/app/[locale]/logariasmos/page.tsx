import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
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
        {user.status === "pending" && (
          <p className="mb-6 flex items-start gap-2.5 border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
            <span aria-hidden className="mt-1 block h-1.5 w-1.5 shrink-0 bg-k-amber" />
            {t("o_logariasmos_sas_einai_se")}
          </p>
        )}

        <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-3">
          <Card label={t("stoicheia")} value={`${user.firstName} ${user.lastName}`} meta={user.email} />
          <Card
            label={t("tilefono")}
            value={user.phone ?? "—"}
            meta={user.lastLoginAt ? t("teleytaia_syndesi", { n: formatDate(user.lastLoginAt, locale) }) : undefined}
          />
          {isCompany && company ? (
            <>
              <Card label={t("afm")} value={company.afm} meta={company.doy ?? undefined} mono />
              <Card
                label={t("times_synergati")}
                value={discount != null ? `−${discount}%` : t("se_egkrisi")}
                meta={discount != null ? t("se_olo_ton_katalogo") : t("energopoioyntai_meta_tin_egkrisi")}
              />
              <Card
                label={t("rolos_sas")}
                value={user.role ? COMPANY_ROLE_LABELS[user.role] : "—"}
                meta={
                  user.spendLimit != null
                    ? t("orio_ana_paraggelia", { n: formatMoney(user.spendLimit, locale) })
                    : t("choris_orio_dapanis")
                }
              />
              <Card
                label={t("pistosi")}
                value={company.creditLimit != null ? formatMoney(company.creditLimit, locale) : "—"}
                meta={
                  company.creditUsed != null && company.creditLimit != null
                    ? t("diathesima", { n: formatMoney(company.creditLimit - company.creditUsed, locale) })
                    : t("den_echei_energopoiithei_akomi")
                }
              />
            </>
          ) : (
            <Card label={t("typos_logariasmoy")} value={t("idiotis")} meta={t("lianikes_times_me_fpa")} />
          )}
        </div>

        {!isCompany && (
          <div className="mt-8 border-l-[3px] border-k-red bg-k-surface-2 p-5 lg:p-6">
            <p className="t-eyebrow text-k-red">{upGreek(t("agorazete_gia_etaireia"))}</p>
            <p className="mt-2 max-w-xl text-[12.5px] leading-[1.6] text-k-text-2">
              {t("enas_etairikos_logariasmos_dinei_times")}
            </p>
            <Link
              href="/eggrafi"
              className="t-btn-sm mt-4 inline-block bg-k-ink px-6 py-3 text-white transition-colors hover:bg-k-red"
            >
              {upGreek(t("aitisi_b2b"))} →
            </Link>
          </div>
        )}

        {isCompany && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/b2b"
              className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
            >
              {upGreek(t("etairikos_logariasmos"))} →
            </Link>
            <Link
              href="/b2b/xristes"
              className="t-btn-sm border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek(t("christes_roloi"))}
            </Link>
          </div>
        )}
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
