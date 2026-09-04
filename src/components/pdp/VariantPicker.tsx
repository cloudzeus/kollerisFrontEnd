import { Link } from "@/i18n/navigation";
import type { VariantOption } from "@/lib/catalog/variants";
import { upGreek } from "@/lib/greek";
import { cn } from "@/lib/utils";

/**
 * Ο επιλογέας νούμερου.
 *
 * Κάθε νούμερο είναι ΣΥΝΔΕΣΜΟΣ σε άλλο προϊόν, όχι κατάσταση αυτής της
 * σελίδας — γιατί έτσι είναι και στο ERP: το 42 και το 43 είναι δύο MTRL με
 * δικό του απόθεμα, τιμή και κωδικό το καθένα. Ως σύνδεσμος, το κάθε νούμερο
 * έχει δική του διεύθυνση που μοιράζεται και ευρετηριάζεται, το πίσω βέλος
 * δουλεύει, και δεν χρειάζεται καθόλου JavaScript.
 *
 * Τα εξαντλημένα ΜΕΝΟΥΝ, απενεργοποιημένα. Ένα νούμερο που λείπει από τη λίστα
 * είναι αόρατο: ο πελάτης δεν μαθαίνει ποτέ ότι το 45 υπάρχει αλλά τελείωσε,
 * και το ίδιο ερώτημα φτάνει στο τηλέφωνο.
 */
export function VariantPicker({
  options,
  label,
}: {
  options: VariantOption[];
  /** «Μέγεθος», ή ό,τι λέει η οικογένεια μεγεθών του HDCtool. */
  label: string;
}) {
  // Ένα νούμερο δεν είναι επιλογή· ο επιλογέας θα ήταν διακοσμητικός.
  if (options.length < 2) return null;

  const available = options.filter((o) => o.inStock).length;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="t-account-label text-k-text-3">{upGreek(label)}</span>
        <span className="t-account-label text-k-text-4">
          {available > 0 ? (
            <>
              <span className="numeral">{available}</span> ΑΠΟ{" "}
              <span className="numeral">{options.length}</span> ΔΙΑΘΕΣΙΜΑ
            </>
          ) : (
            "ΚΑΤΟΠΙΝ ΠΑΡΑΓΓΕΛΙΑΣ"
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) =>
          option.current ? (
            <span
              key={option.slug}
              aria-current="true"
              className="numeral flex h-10 min-w-10 items-center justify-center border-2 border-k-ink bg-k-ink px-2.5 text-[13px] font-semibold text-white"
            >
              {option.label}
            </span>
          ) : option.inStock ? (
            <Link
              key={option.slug}
              href={`/proion/${option.slug}`}
              className="numeral flex h-10 min-w-10 items-center justify-center border border-k-line-2 px-2.5 text-[13px] font-medium text-k-ink transition-colors hover:border-k-ink"
            >
              {option.label}
            </Link>
          ) : (
            /* Σύνδεσμος και το εξαντλημένο: το προϊόν υπάρχει, έχει τιμή και
               σελίδα, και ο πελάτης μπορεί να θέλει να το παραγγείλει. Η
               διαγράμμιση λέει «όχι τώρα», όχι «όχι ποτέ». */
            <Link
              key={option.slug}
              href={`/proion/${option.slug}`}
              title="Κατόπιν παραγγελίας"
              className={cn(
                "numeral flex h-10 min-w-10 items-center justify-center border border-dashed border-k-line-2 px-2.5 text-[13px] text-k-text-5",
                "hover:border-k-text-4 hover:text-k-text-3",
              )}
            >
              <span className="line-through">{option.label}</span>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
