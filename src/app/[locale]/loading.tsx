import { ChromeSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

/**
 * Ο γενικός σκελετός φόρτωσης — για κάθε σελίδα που δεν έχει δικό της.
 *
 * ── Τι ήταν πριν εδώ ──────────────────────────────────────────────────────
 *
 * Ο σκελετός της ΑΡΧΙΚΗΣ: hero 520px, λωρίδα στατιστικών, πλέγμα κατηγοριών,
 * προτεινόμενα προϊόντα. Ένα `loading.tsx` σε αυτό το επίπεδο δεν ισχύει μόνο
 * για το `page.tsx` δίπλα του — το κληρονομεί ΚΑΘΕ σελίδα από κάτω. Έτσι το
 * καλάθι, ο λογαριασμός, οι όροι χρήσης και ο κατάλογος έδειχναν όλα, για όσο
 * φόρτωναν, τον σκελετό της αρχικής: ένα τεράστιο hero που δεν επρόκειτο να
 * εμφανιστεί, και ύστερα η σελίδα πηδούσε σε τελείως άλλη διάταξη.
 *
 * Η αρχική μετακόμισε στην ομάδα διαδρομών `(home)` — που δεν αλλάζει τη
 * διεύθυνση — με τον δικό της σκελετό δίπλα της. Εδώ μένει ό,τι είναι αληθές
 * για όλες τις υπόλοιπες.
 *
 * ── Γιατί αυτό το σχήμα ───────────────────────────────────────────────────
 *
 * Σχεδόν κάθε εσωτερική σελίδα του καταστήματος έχει την ίδια σκελετική δομή:
 * σκούρα λωρίδα με breadcrumb και τίτλο, και από κάτω λευκό περιεχόμενο. Δεν
 * προσποιείται ότι ξέρει τι έρχεται — δείχνει το κέλυφος που όντως έρχεται και
 * αφήνει το περιεχόμενο ουδέτερο.
 *
 * Ένας σκελετός που μαντεύει λάθος αναδιατάσσει τη σελίδα δύο φορές αντί για
 * μία, και διαβάζεται χειρότερα από καθόλου σκελετό. Οι σελίδες με ιδιαίτερη
 * διάταξη — πλέγμα προϊόντων, σελίδα προϊόντος, σύγκριση, κατάλογος — έχουν
 * τη δική τους ακριβή εκδοχή.
 */
export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        {/* Σκούρα κεφαλίδα: breadcrumb + τίτλος + εισαγωγή */}
        <div className="shell-x bg-k-ink-deep">
          <div className="flex h-11 items-center gap-2.5">
            <Shimmer className="h-2.5 w-14 bg-white/10" />
            <Shimmer className="h-2.5 w-24 bg-white/10" />
          </div>
          <div className="pt-2.5 pb-8">
            <Shimmer className="h-7 w-64 bg-white/12 lg:h-9 lg:w-96" />
            <div className="mt-3.5 max-w-[640px] space-y-2">
              <Shimmer className="h-3 w-full bg-white/8" />
              <Shimmer className="h-3 w-3/5 bg-white/8" />
            </div>
          </div>
        </div>

        {/* Λευκό περιεχόμενο, ουδέτερο */}
        <div className="shell-x bg-white py-8 lg:py-12">
          <div className="max-w-[720px] space-y-3">
            <Shimmer className="h-3 w-full" />
            <Shimmer className="h-3 w-11/12" />
            <Shimmer className="h-3 w-4/5" />
          </div>
          <div className="mt-9 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="space-y-3 bg-white p-5 lg:p-7">
                <Shimmer className="h-2.5 w-16" />
                <Shimmer className="h-4 w-40" />
                <Shimmer className="h-3 w-full" />
                <Shimmer className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
