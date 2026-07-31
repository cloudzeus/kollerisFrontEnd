import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { upGreek } from "@/lib/greek";

export const metadata: Metadata = {
  title: "Η αίτησή σας καταχωρήθηκε",
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    n: "01",
    title: "Λάβαμε την αίτησή σας",
    body: "Τα στοιχεία της εταιρείας ήρθαν από το μητρώο της ΑΑΔΕ και καταχωρήθηκαν.",
    done: true,
  },
  {
    n: "02",
    title: "Έλεγχος στοιχείων",
    body: "Ελέγχουμε ΑΦΜ, δραστηριότητα και υπάρχουσα συνεργασία. Συνήθως 2 εργάσιμες.",
    done: false,
  },
  {
    n: "03",
    title: "Ενεργοποίηση και τιμές συνεργάτη",
    body: "Θα λάβετε email. Από εκείνη τη στιγμή βλέπετε τιμές συνεργάτη σε όλο τον κατάλογο.",
    done: false,
  },
];

/**
 * B2B registration lands here, NOT in the account area.
 *
 * A company account is created pending, so signing the applicant in would put
 * them in an account that cannot yet do the one thing they registered for.
 */
export default async function PendingApprovalPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AccountChrome locale={locale}>
      <main id="main">
        <div className="shell-x bg-k-ink-deep py-10 lg:py-14">
          <p className="t-eyebrow text-k-red">{upGreek("Αίτηση B2B")}</p>
          <h1 className="font-artegra mt-3 text-[24px] leading-[1.16] font-medium text-white lg:text-[32px]">
            {upGreek("Η αίτησή σας καταχωρήθηκε")}
          </h1>
          <p className="mt-3.5 max-w-[600px] text-[13px] leading-[1.68] text-white/60 lg:text-sm">
            Ο εταιρικός λογαριασμός ενεργοποιείται μετά από έλεγχο — συνήθως σε 2
            εργάσιμες. Μέχρι τότε μπορείτε να παραγγέλνετε κανονικά ως επισκέπτης.
          </p>
        </div>

        <section className="shell-x bg-white py-8 lg:py-12">
          <ol className="grid gap-px border border-k-line bg-k-line lg:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n} className="flex flex-col gap-2 bg-white p-5 lg:p-6">
                <span className="flex items-center gap-2.5">
                  <span className={`t-cat-num ${step.done ? "text-k-green" : "text-k-text-5"}`}>
                    {step.n}
                  </span>
                  {step.done && (
                    <span aria-hidden className="block h-1.5 w-1.5 bg-k-green" />
                  )}
                </span>
                <span className="text-[13.5px] font-semibold text-k-ink">{step.title}</span>
                <span className="text-[12.5px] leading-[1.6] text-k-text-3">{step.body}</span>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href="/katalogos"
              className="t-btn-sm bg-k-ink px-7 py-4 text-white transition-colors hover:bg-k-red"
            >
              {upGreek("Στον κατάλογο")} →
            </Link>
            <a
              href="tel:+302104111355"
              className="t-btn-sm border-[1.5px] border-k-ink px-7 py-4 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek("Τ. 210 411 1355")}
            </a>
          </div>
        </section>
      </main>
    </AccountChrome>
  );
}
