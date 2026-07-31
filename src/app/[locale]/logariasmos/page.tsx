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

export const metadata: Metadata = {
  title: "Ο λογαριασμός μου",
  robots: { index: false, follow: false },
};

/**
 * Account overview.
 *
 * The same page for both account types — what differs is how much of it there
 * is. An individual sees their own details and their order history. A company
 * additionally sees the company card: ΑΦΜ, partner discount, credit, and who
 * else may order on its behalf.
 */
export default async function AccountPage({ params }: { params: Promise<{ locale: Locale }> }) {
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
        title={`Καλώς ήρθατε, ${user.firstName}`}
        lead={
          isCompany
            ? "Ο εταιρικός σας λογαριασμός: τιμές συνεργάτη, τιμολόγηση και οι χρήστες που παραγγέλνουν για λογαριασμό της εταιρείας."
            : "Οι παραγγελίες, οι διευθύνσεις και οι εγγυήσεις σας σε ένα σημείο."
        }
      >
        {user.status === "pending" && (
          <p className="mb-6 flex items-start gap-2.5 border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
            <span aria-hidden className="mt-1 block h-1.5 w-1.5 shrink-0 bg-k-amber" />
            Ο λογαριασμός σας είναι σε έγκριση. Οι τιμές συνεργάτη ενεργοποιούνται μόλις
            ολοκληρωθεί ο έλεγχος.
          </p>
        )}

        <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-3">
          <Card label="Στοιχεία" value={`${user.firstName} ${user.lastName}`} meta={user.email} />
          <Card
            label="Τηλέφωνο"
            value={user.phone ?? "—"}
            meta={user.lastLoginAt ? `Τελευταία σύνδεση ${formatDate(user.lastLoginAt)}` : undefined}
          />
          {isCompany && company ? (
            <>
              <Card label="ΑΦΜ" value={company.afm} meta={company.doy ?? undefined} mono />
              <Card
                label="Τιμές συνεργάτη"
                value={discount != null ? `−${discount}%` : "Σε έγκριση"}
                meta={discount != null ? "σε όλο τον κατάλογο" : "ενεργοποιούνται μετά την έγκριση"}
              />
              <Card
                label="Ρόλος σας"
                value={user.role ? COMPANY_ROLE_LABELS[user.role] : "—"}
                meta={
                  user.spendLimit != null
                    ? `Όριο ${formatMoney(user.spendLimit)} ανά παραγγελία`
                    : "Χωρίς όριο δαπάνης"
                }
              />
              <Card
                label="Πίστωση"
                value={company.creditLimit != null ? formatMoney(company.creditLimit) : "—"}
                meta={
                  company.creditUsed != null && company.creditLimit != null
                    ? `${formatMoney(company.creditLimit - company.creditUsed)} διαθέσιμα`
                    : "δεν έχει ενεργοποιηθεί ακόμη"
                }
              />
            </>
          ) : (
            <Card label="Τύπος λογαριασμού" value="Ιδιώτης" meta="Λιανικές τιμές με ΦΠΑ" />
          )}
        </div>

        {!isCompany && (
          <div className="mt-8 border-l-[3px] border-k-red bg-k-surface-2 p-5 lg:p-6">
            <p className="t-eyebrow text-k-red">{upGreek("Αγοράζετε για εταιρεία;")}</p>
            <p className="mt-2 max-w-xl text-[12.5px] leading-[1.6] text-k-text-2">
              Ένας εταιρικός λογαριασμός δίνει τιμές συνεργάτη, πληρωμή επί πιστώσει,
              τιμολόγιο και πολλούς χρήστες με ρόλους και όρια δαπάνης.
            </p>
            <Link
              href="/eggrafi"
              className="t-btn-sm mt-4 inline-block bg-k-ink px-6 py-3 text-white transition-colors hover:bg-k-red"
            >
              {upGreek("Αίτηση B2B")} →
            </Link>
          </div>
        )}

        {isCompany && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/b2b"
              className="t-btn-sm bg-k-ink px-6 py-3.5 text-white transition-colors hover:bg-k-red"
            >
              {upGreek("Εταιρικός λογαριασμός")} →
            </Link>
            <Link
              href="/b2b/xristes"
              className="t-btn-sm border-[1.5px] border-k-ink px-6 py-3.5 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek("Χρήστες & ρόλοι")}
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

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
