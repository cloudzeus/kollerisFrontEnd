import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { RegisterForm } from "@/components/account/AuthForms";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCustomerSession } from "@/lib/account/session";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Εγγραφή",
  description:
    "Δημιουργήστε λογαριασμό ιδιώτη ή αίτηση εταιρικού λογαριασμού B2B με τιμές συνεργάτη.",
};

const COMPARISON = [
  { feature: "Παραγγελίες και ιστορικό", individual: true, company: true },
  { feature: "Διευθύνσεις και εγγυήσεις", individual: true, company: true },
  { feature: "Τιμές συνεργάτη", individual: false, company: true },
  { feature: "Πληρωμή επί πιστώσει", individual: false, company: true },
  { feature: "Τιμολόγιο με στοιχεία εταιρείας", individual: false, company: true },
  { feature: "Πολλοί χρήστες με ρόλους", individual: false, company: true },
  { feature: "Όρια δαπάνης ανά χρήστη", individual: false, company: true },
  { feature: "Λίστες υλικών για επαναπαραγγελία", individual: false, company: true },
];

export default async function RegisterPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getCustomerSession();
  if (session.state === "signed-in") redirect("/logariasmos");

  return (
    <AccountChrome locale={locale}>
      <main id="main">
        <div className="shell-x bg-k-ink-deep">
          <nav aria-label="Breadcrumb" className="t-util flex h-11 items-center gap-2.5 text-white/45">
            <Link href="/" className="text-white/60 hover:text-white">
              {upGreek("Αρχική")}
            </Link>
            <span className="text-k-red">/</span>
            <span className="text-white">{upGreek("Εγγραφή")}</span>
          </nav>
          <div className="pt-2.5 pb-7">
            <h1 className="font-artegra text-[22px] leading-[1.16] font-medium text-white lg:text-[30px]">
              {upGreek("Δημιουργία λογαριασμού")}
            </h1>
            <p className="mt-3.5 max-w-[640px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
              Για εταιρείες αρκεί το ΑΦΜ — τα υπόλοιπα στοιχεία τα φέρνουμε από το
              μητρώο της ΑΑΔΕ.
            </p>
          </div>
        </div>

        <div className="shell-w bg-white lg:grid lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="min-w-0 px-4 py-8 lg:px-10 lg:py-12">
            <div className="max-w-2xl">
              <RegisterForm />
            </div>
          </div>

          <aside className="border-t border-k-line bg-k-surface-2 px-4 py-8 lg:border-t-0 lg:border-l lg:px-8 lg:py-12">
            <p className="t-eyebrow text-k-red">{upGreek("Τι αλλάζει")}</p>
            <p className="font-artegra mt-2.5 text-[18px] leading-[1.28] text-k-ink">
              {upGreek("Ιδιώτης ή εταιρεία")}
            </p>

            <dl className="mt-5 border-t border-k-line">
              {COMPARISON.map((row) => (
                <div key={row.feature} className="flex items-center gap-3 border-b border-k-line py-2.5">
                  <dt className="min-w-0 flex-1 text-[12px] leading-[1.4] text-k-text-2">
                    {row.feature}
                  </dt>
                  <dd className="flex shrink-0 gap-4">
                    <Mark on={row.individual} title="Ιδιώτης" />
                    <Mark on={row.company} title="Εταιρεία" />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-2.5 flex justify-end gap-4 text-[10px] tracking-[0.06em] text-k-text-4">
              <span className="w-4 text-center">{upGreek("ΙΔΙΩΤ.")}</span>
              <span className="w-4 text-center">{upGreek("ΕΤΑΙΡ.")}</span>
            </p>
          </aside>
        </div>
      </main>
    </AccountChrome>
  );
}

function Mark({ on, title }: { on: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`flex h-4 w-4 items-center justify-center border text-[10px] leading-none ${
        on ? "border-k-green bg-k-green text-white" : "border-k-line-2 text-k-text-6"
      }`}
    >
      {on ? "✓" : "—"}
    </span>
  );
}
