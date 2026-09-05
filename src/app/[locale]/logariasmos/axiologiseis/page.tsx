import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { ReviewForm } from "@/components/account/ReviewForm";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { reviewableItems } from "@/lib/account/reviews";
import { upGreek } from "@/lib/greek";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Αξιολογήσεις", robots: { index: false, follow: false } };
}

/**
 * Τι μπορεί να αξιολογήσει ο πελάτης.
 *
 * Μόνο ό,τι έχει ΠΑΡΑΛΑΒΕΙ. Μια παραγγελία που πληρώθηκε χθες δεν έχει τίποτα να
 * πει για το εργαλείο — η αξιολόγηση αφορά τη χρήση, όχι την αγορά. Και ένα
 * κατάστημα εργαλείων ζει από την εμπιστοσύνη επαγγελματιών: μια κριτική από
 * κάποιον που δεν κράτησε ποτέ το εργαλείο τραβάει κάτω και όσες είναι αληθινές.
 *
 * Τα ΑΝΑΞΙΟΛΟΓΗΤΑ πρώτα — αυτά είναι η δουλειά που έχει η σελίδα να προτείνει.
 */
export default async function ReviewsPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user } = await requireCustomer(locale, "/logariasmos/axiologiseis");

  const items = await reviewableItems(user.id, locale);
  const pending = items.filter((i) => !i.existing).length;

  return (
    <AccountChrome locale={locale}>
      <AccountShell
        user={user}
        active="/logariasmos/axiologiseis"
        title="Αξιολογήσεις"
        lead="Προϊόντα που έχετε παραλάβει. Η γνώμη σας δημοσιεύεται μετά από έλεγχο."
      >
        {items.length === 0 ? (
          <div className="border border-k-line bg-white px-6 py-12 text-center">
            <p className="text-[14px] text-k-ink">
              Δεν υπάρχει ακόμη κάτι να αξιολογήσετε.
            </p>
            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-k-text-3">
              Μόλις παραλάβετε μια παραγγελία, τα προϊόντα της εμφανίζονται εδώ.
            </p>
            <Link
              href="/logariasmos/paraggelies"
              className="font-sans mt-5 inline-block bg-k-ink-deep px-7 py-3 text-[13px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-k-ink"
            >
              {upGreek("Οι παραγγελίες μου")}
            </Link>
          </div>
        ) : (
          <>
            {pending > 0 && (
              <p className="mb-3 text-[12.5px] text-k-text-3">
                <span className="numeral font-semibold text-k-ink">
                  {pending}
                </span>{" "}
                {pending === 1 ? "προϊόν περιμένει" : "προϊόντα περιμένουν"} τη
                γνώμη σας.
              </p>
            )}
            <ul className="space-y-2.5">
              {items.map((item) => (
                <ReviewForm key={item.productId} item={item} />
              ))}
            </ul>
          </>
        )}
      </AccountShell>
    </AccountChrome>
  );
}
