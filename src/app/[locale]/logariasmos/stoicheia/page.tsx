import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { ProfileForm } from "@/components/account/AuthForms";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { upGreek } from "@/lib/greek";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: `setRequestLocale` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "stoicheia.page" });
  return {
    title: t("titlos_stoicheia_logariasmoy"),
    robots: { index: false, follow: false },
  };
}

/** Personal details. Identical for both account types — a person is a person. */
export default async function ProfilePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const t = await getTranslations("stoicheia.page");
  const { locale } = await params;
  setRequestLocale(locale);

  const guard = await requireCustomer(locale, "/logariasmos/stoicheia");
  const { user } = guard;
  const company = user.company;

  return (
    <AccountChrome locale={locale}>
      <AccountShell
        user={user}
        active="/logariasmos/stoicheia"
        title={t("stoicheia_logariasmoy")}
        lead={t("ta_prosopika_sas_stoicheia_ta")}
      >
        <ProfileForm user={user} />

        {company && (
          <section className="mt-10 border-t border-k-line pt-8">
            <p className="t-eyebrow text-k-red">{upGreek(t("stoicheia_etaireias"))}</p>
            <p className="mt-2 max-w-xl text-[12.5px] leading-[1.6] text-k-text-3">
              {t("proerchontai_apo_to_mitroo_tis")}
            </p>

            <dl className="mt-5 max-w-xl border-t border-k-line">
              {[
                [t("eponymia"), company.name],
                [t("afm"), company.afm],
                [t("doy"), company.doy],
                [t("drastiriotita"), company.profession],
                [t("edra"), company.billAddress],
                [t("poli"), [company.billPostcode, company.billCity].filter(Boolean).join(" ")],
                [t("kodikos_pelati"), company.trdr != null ? String(company.trdr) : null],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-4 border-b border-k-line py-2.5">
                  <dt className="w-2/5 shrink-0 text-[12px] text-k-text-3">{label}</dt>
                  <dd className="min-w-0 flex-1 font-mono text-[12.5px] font-medium text-k-ink">
                    {value || "—"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </AccountShell>
    </AccountChrome>
  );
}
