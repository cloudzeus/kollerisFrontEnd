import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { COMPANY_CAPABILITIES, COMPANY_ROLE_HELP, COMPANY_ROLE_LABELS } from "@/lib/account/contract";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Εταιρικός λογαριασμός",
  robots: { index: false, follow: false },
};

/**
 * B2B overview.
 *
 * An individual who lands here is sent to their own account rather than shown a
 * 403 — they have not done anything wrong, they simply have a different kind of
 * account, and the upsell lives there.
 */
export default async function B2BPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const guard = await requireCustomer(locale, "/b2b");
  const { user } = guard;
  const company = user.company;
  if (user.accountType !== "company" || !company) redirect("/logariasmos");

  const pending = company.status !== "active";
  const discount = company.partnerFactor ? Math.round((1 - company.partnerFactor) * 100) : null;
  const creditAvailable =
    company.creditLimit != null && company.creditUsed != null
      ? company.creditLimit - company.creditUsed
      : null;

  return (
    <AccountChrome locale={locale}>
      <AccountShell
        user={user}
        active="/b2b"
        title={company.name}
        lead={`ΑΦΜ ${company.afm}${company.doy ? ` · ΔΟΥ ${company.doy}` : ""}`}
      >
        {pending && (
          <p className="mb-6 flex items-start gap-2.5 border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
            <span aria-hidden className="mt-1 block h-1.5 w-1.5 shrink-0 bg-k-amber" />
            Ο εταιρικός λογαριασμός είναι σε έγκριση. Μπορείτε να παραγγέλνετε, αλλά με
            λιανικές τιμές μέχρι την ενεργοποίηση.
          </p>
        )}

        <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Έκπτωση συνεργάτη"
            value={discount != null ? `−${discount}%` : "—"}
            meta={discount != null ? "στην τιμή καταλόγου" : "μετά την έγκριση"}
          />
          <Metric
            label="Όριο πίστωσης"
            value={company.creditLimit != null ? formatMoney(company.creditLimit) : "—"}
            meta={company.creditLimit == null ? "δεν έχει ενεργοποιηθεί" : undefined}
          />
          <Metric
            label="Διαθέσιμο υπόλοιπο"
            value={creditAvailable != null ? formatMoney(creditAvailable) : "—"}
            meta={creditAvailable == null ? "χρειάζεται σύνδεση με SoftOne" : undefined}
          />
          <Metric
            label="Κωδικός πελάτη"
            value={company.trdr != null ? String(company.trdr) : "—"}
            meta={company.trdr != null ? "SoftOne TRDR" : "δεν έχει δημιουργηθεί ακόμη"}
          />
        </div>

        <section className="mt-10">
          <p className="t-eyebrow text-k-red">{upGreek("Ο ρόλος σας")}</p>
          <h2 className="font-artegra mt-2 text-[18px] leading-[1.28] text-k-ink lg:text-xl">
            {upGreek(user.role ? COMPANY_ROLE_LABELS[user.role] : "—")}
          </h2>
          {user.role && (
            <p className="mt-2 max-w-xl text-[12.5px] leading-[1.6] text-k-text-3">
              {COMPANY_ROLE_HELP[user.role]}
              {user.spendLimit != null &&
                ` Το όριό σας είναι ${formatMoney(user.spendLimit)} ανά παραγγελία.`}
            </p>
          )}

          {user.role && (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {CAPABILITY_LABELS.map(([capability, label]) => {
                const allowed = (COMPANY_CAPABILITIES[user.role!] as readonly string[]).includes(
                  capability,
                );
                return (
                  <li
                    key={capability}
                    className={`t-brand-count flex items-center gap-1.5 border px-2 py-1.5 ${
                      allowed
                        ? "border-k-green/40 bg-k-green/8 text-k-ink"
                        : "border-k-line-2 text-k-text-5"
                    }`}
                  >
                    <span aria-hidden className={allowed ? "text-k-green" : ""}>
                      {allowed ? "✓" : "—"}
                    </span>
                    {upGreek(label)}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/b2b/xristes"
            className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
          >
            {upGreek("Χρήστες & ρόλοι")} →
          </Link>
          <Link
            href="/logariasmos/stoicheia"
            className="t-btn-sm border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
          >
            {upGreek("Στοιχεία λογαριασμού")}
          </Link>
        </div>
      </AccountShell>
    </AccountChrome>
  );
}

const CAPABILITY_LABELS: Array<[string, string]> = [
  ["order", "Παραγγελίες"],
  ["viewPartnerPrices", "Τιμές συνεργάτη"],
  ["viewCompanyOrders", "Παραγγελίες εταιρείας"],
  ["manageUsers", "Διαχείριση χρηστών"],
  ["manageCompany", "Στοιχεία εταιρείας"],
];

function Metric({ label, value, meta }: { label: string; value: string; meta?: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-white p-4 lg:p-5">
      <span className="t-account-label text-k-text-4">{upGreek(label)}</span>
      <span className="font-mono text-[19px] leading-none font-semibold text-k-ink">{value}</span>
      {meta && <span className="t-brand-count text-k-text-4">{meta}</span>}
    </div>
  );
}
