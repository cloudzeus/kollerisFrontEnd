import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * About split. The striped placeholder stands in for the warehouse/team photo
 * the handoff calls for at 1200×840 — it is not in the asset set yet.
 *
 * Copy is CMS-bound in Phase 3; the USP figures are already live so the claims
 * cannot contradict the catalogue. Mobile drops the image panel entirely, per
 * the handoff.
 */
export function AboutSplit({
  usps,
}: {
  usps: Array<{ n: string; title: string; body: string }>;
}) {
  return (
    <section className="shell-w grid bg-white lg:grid-cols-2">
      <div className="relative hidden min-h-[420px] items-center justify-center bg-k-surface-3 lg:flex">
        <svg
          width="100%"
          height="100%"
          className="absolute inset-0"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <pattern
              id="kstripe"
              width="10"
              height="10"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="0" y2="10" stroke="#E2E2E5" strokeWidth="4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#kstripe)" />
        </svg>
        <p className="t-footer-tag relative bg-k-surface-3/92 px-5 py-3.5 text-center text-k-text-4">
          {upGreek("Φωτογραφία αποθήκης / ομάδας")}
          <br />
          <span className="text-k-text-6">1200 × 840</span>
        </p>
      </div>

      <div className="flex flex-col justify-center gap-4 px-4 py-7 lg:gap-[22px] lg:px-14 lg:py-16">
        <p className="t-eyebrow text-k-red">{upGreek("Η εταιρεία")}</p>
        <h2 className="t-h2-about text-k-ink">
          {upGreek("Γιατί οι επαγγελματίες")}
          <br />
          {upGreek("εμπιστεύονται την Kolleris")}
        </h2>
        <p className="t-body text-k-text-2">
          Για 46 χρόνια, η Kolleris είναι ο προμηθευτής που καλούν ναυτιλιακές
          εταιρείες, εργοστάσια και συνεργεία. Άμεσες σχέσεις με Milwaukee, Knipex,
          Wera — ακριβής διαθεσιμότητα, χωρίς «θα δούμε».
        </p>

        <dl className="mt-1 flex flex-col gap-3.5">
          {usps.map((usp) => (
            <div key={usp.n} className="flex gap-3.5 border-t border-k-line pt-3.5">
              <span className="t-cat-num mt-[3px] text-k-red">{usp.n}</span>
              <div>
                <dt className="t-usp-title text-k-ink">{usp.title}</dt>
                <dd className="t-usp-body mt-1 text-k-text-3">{usp.body}</dd>
              </div>
            </div>
          ))}
        </dl>

        <Link
          href="/etaireia"
          className="t-btn-sm mt-2 self-start bg-k-ink px-[30px] py-[15px] text-white transition-colors hover:bg-k-red"
        >
          {upGreek("Γνωρίστε μας")} →
        </Link>
      </div>
    </section>
  );
}
