import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { ProfileForm } from "@/components/account/AuthForms";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Στοιχεία λογαριασμού",
  robots: { index: false, follow: false },
};

/** Personal details. Identical for both account types — a person is a person. */
export default async function ProfilePage({ params }: { params: Promise<{ locale: Locale }> }) {
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
        title="Στοιχεία λογαριασμού"
        lead="Τα προσωπικά σας στοιχεία. Τα εταιρικά αλλάζουν μόνο από διαχειριστή."
      >
        <ProfileForm user={user} />

        {company && (
          <section className="mt-10 border-t border-k-line pt-8">
            <p className="t-eyebrow text-k-red">{upGreek("Στοιχεία εταιρείας")}</p>
            <p className="mt-2 max-w-xl text-[12.5px] leading-[1.6] text-k-text-3">
              Προέρχονται από το μητρώο της ΑΑΔΕ και το SoftOne. Για διόρθωση καλέστε
              μας στο 210 411 1355 — δεν αλλάζουν από εδώ, γιατί τιμολογούμε πάνω σε
              αυτά.
            </p>

            <dl className="mt-5 max-w-xl border-t border-k-line">
              {[
                ["Επωνυμία", company.name],
                ["ΑΦΜ", company.afm],
                ["ΔΟΥ", company.doy],
                ["Δραστηριότητα", company.profession],
                ["Έδρα", company.billAddress],
                ["Πόλη", [company.billPostcode, company.billCity].filter(Boolean).join(" ")],
                ["Κωδικός πελάτη", company.trdr != null ? String(company.trdr) : null],
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
