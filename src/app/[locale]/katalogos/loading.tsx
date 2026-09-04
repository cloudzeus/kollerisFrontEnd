import { ChromeSkeleton, Shimmer } from "@/components/skeleton/Skeleton";

/**
 * Ο σκελετός του καταλόγου.
 *
 * Ακολουθεί τη δομή της πραγματικής σελίδας: σκούρα κεφαλίδα, μπάρα εύρεσης
 * ταξινομίας, η μεγάλη κατηγορία ως πλατύ πλακίδιο, οι υπόλοιπες σε πλέγμα
 * τεσσάρων, και η ουρά ως λίστα δύο στηλών. Οι διαστάσεις είναι οι ίδιες που
 * γράφει η σελίδα — `band-alt`, `shell-x py-8 lg:py-12`, `gap-px` πάνω σε
 * `bg-k-line` — ώστε όταν έρθει το περιεχόμενο να μη μετακινηθεί τίποτα.
 *
 * Ένας σκελετός που μαντεύει λάθος αναδιατάσσει τη σελίδα δύο φορές αντί για
 * μία. Ο κατάλογος έδειχνε μέχρι τώρα τον σκελετό της ΑΡΧΙΚΗΣ — hero 520px,
 * λωρίδα στατιστικών, πλέγμα προτεινόμενων — δηλαδή μια σελίδα που δεν
 * επρόκειτο ποτέ να εμφανιστεί.
 */
function SectionHeadSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
      <div className="space-y-3">
        <Shimmer className="h-2.5 w-32" />
        <Shimmer className="h-6 w-72 lg:h-8 lg:w-96" />
      </div>
      <div className="max-w-[360px] flex-1 space-y-2 lg:text-right">
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-2/3 lg:ml-auto" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <>
      <ChromeSkeleton />
      <main id="main">
        {/* Κεφαλίδα */}
        <div className="shell-x bg-k-ink-deep">
          <div className="flex h-11 items-center gap-2.5">
            <Shimmer className="h-2.5 w-14 bg-white/10" />
            <Shimmer className="h-2.5 w-24 bg-white/10" />
          </div>
          <div className="pt-2.5 pb-8">
            <Shimmer className="h-7 w-72 bg-white/12 lg:h-9 lg:w-[420px]" />
            <div className="mt-3.5 max-w-[660px] space-y-2">
              <Shimmer className="h-3 w-full bg-white/8" />
              <Shimmer className="h-3 w-1/2 bg-white/8" />
            </div>
          </div>
        </div>

        {/* 1 — Εύρεση ταξινομίας */}
        <section className="band-alt border-y border-k-line">
          <div className="shell-x py-6 lg:py-8">
            <Shimmer className="h-11 w-full max-w-[520px]" />
          </div>
        </section>

        {/* 2 — Η κυρίαρχη κατηγορία, ανοιχτή */}
        <section className="band-base">
          <div className="shell-x py-8 lg:py-12">
            <SectionHeadSkeleton />
            <div className="mt-7 flex flex-col gap-px border border-k-line bg-k-line lg:mt-9">
              {Array.from({ length: 2 }, (_, i) => (
                <div
                  key={i}
                  className="grid bg-white lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]"
                >
                  <Shimmer className="h-[180px] rounded-none lg:h-[220px]" />
                  <div className="space-y-3 p-5 lg:p-7">
                    <Shimmer className="h-5 w-56" />
                    <Shimmer className="h-3 w-full" />
                    <div className="grid gap-2 pt-2 sm:grid-cols-2">
                      {Array.from({ length: 4 }, (_, r) => (
                        <Shimmer key={r} className="h-3.5 w-full" />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 3 — Οι υπόλοιπες */}
        <section className="band-alt border-t border-k-line">
          <div className="shell-x py-8 lg:py-12">
            <SectionHeadSkeleton />
            <div className="mt-7 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-9 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="min-h-[190px] space-y-3 bg-white p-4 lg:p-6">
                  <Shimmer className="h-2.5 w-10" />
                  <Shimmer className="h-4 w-32" />
                  <div className="space-y-2 pt-2">
                    {Array.from({ length: 4 }, (_, r) => (
                      <Shimmer key={r} className="h-2.5 w-full" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4 — Η ουρά */}
        <section className="band-base border-t border-k-line">
          <div className="shell-x py-8 lg:py-12">
            <SectionHeadSkeleton />
            <div className="mt-7 grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:mt-9 lg:grid-cols-3">
              {Array.from({ length: 9 }, (_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 bg-white px-4 py-3.5 lg:px-5"
                >
                  <Shimmer className="h-3 flex-1" />
                  <Shimmer className="h-2.5 w-8" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
