"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Η κάτω κάρτα του hero: τα προϊόντα που τρέχουν σε προσφορά, εναλλάξ.
 *
 * ── Τι αντικατέστησε ───────────────────────────────────────────────────────
 *
 * Ένα καρφωμένο tile «ΕΩΣ −25% · KNIPEX πένσικα», γραμμένο μια φορά και
 * ξεχασμένο: διαφήμιζε έκπτωση που μπορεί να μην τρέχει, σε μάρκα που μπορεί
 * να μην είναι σε προσφορά. Τώρα δείχνει ό,τι είναι ΠΡΑΓΜΑΤΙΚΑ μειωμένο.
 *
 * ── Το πλακίδιο είναι 400×259 και ΔΕΝ μεγαλώνει ────────────────────────────
 *
 * Κάθεται σε `grid-rows-2` δίπλα στο hero. Ό,τι δεν χωράει δεν κόβεται με
 * scroll — ξεχειλίζει πάνω στο διπλανό, που είναι ακριβώς ό,τι έκανε η πρώτη
 * εκδοχή (267 πίξελ περιεχόμενο σε 259). Γι' αυτό οι σειρές είναι πέντε και η
 * φωτογραφία βγαίνει ΕΞΩ από το πλαίσιο αντί να ζητά δική της στήλη: κερδίζει
 * χώρο και γίνεται το ένα φωτεινό στοιχείο της κάρτας.
 *
 * ── Οι τιμές έρχονται έτοιμες ──────────────────────────────────────────────
 *
 * Ο server δίνει τα ποσά μορφοποιημένα. Η μορφοποίηση χρήματος ζει σε ένα
 * σημείο (`lib/format`)· ένα client component που θα τη ξανάκανε θα ήταν
 * δεύτερος κανόνας στρογγυλοποίησης πάνω στην ίδια τιμή.
 */

export type HeroOfferItem = {
  href: string;
  name: string;
  brand: string;
  code: string;
  image: string | null;
  /** Η κανονική τιμή, μορφοποιημένη. Null όταν δεν υπάρχει «πριν». */
  was: string | null;
  /** Η τιμή της προσφοράς, μορφοποιημένη. */
  now: string;
  /** «−31%». Null όταν δεν βγαίνει ποσοστό. */
  off: string | null;
  stock: string;
  inStock: boolean;
};

/** Όσο μένει κάθε προϊόν στην οθόνη. Το ζήτησε ο πελάτης: τρία δευτερόλεπτα. */
const DWELL_MS = 3000;

export function HeroOffersTile({
  items,
  labels,
}: {
  items: HeroOfferItem[];
  labels: { eyebrow: string; cta: string; vat: string; of: string };
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const barRef = useRef<HTMLSpanElement | null>(null);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const advance = useCallback(() => setIndex((i) => (i + 1) % items.length), [items.length]);

  // Ο χρόνος. Σταματά στο hover και στο πληκτρολόγιο: τρία δευτερόλεπτα δεν
  // φτάνουν για να διαβάσεις τιμή και όνομα αν κάτι σου τράβηξε το μάτι.
  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = window.setTimeout(advance, DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, advance, items.length]);

  /*
   * Η χορογραφία.
   *
   * Τρία πράγματα κινούνται και το καθένα λέει κάτι: η φωτογραφία έρχεται από
   * δεξιά και κάθεται (από πού ήρθε), οι γραμμές ανεβαίνουν με κλιμάκωση (τι
   * να διαβάσεις πρώτο), το ποσοστό χτυπά τελευταίο (τι κερδίζεις).
   *
   * Μόνο transform και opacity — τίποτα που να προκαλεί reflow σε πλακίδιο
   * που κάθεται δίπλα στο hero. Οι στόχοι βρίσκονται με `data-` και όχι με
   * θέση στη λίστα, γιατί το React ξαναγράφει τον κόμβο σε κάθε εναλλαγή.
   */
  useEffect(() => {
    if (!stageRef.current || reducedRef.current) return;
    let cancelled = false;

    void import("gsap").then(({ gsap }) => {
      const scope = stageRef.current;
      if (cancelled || !scope) return;

      gsap
        .timeline()
        .fromTo(
          scope.querySelectorAll("[data-shot]"),
          { scale: 1.14, xPercent: 10, opacity: 0 },
          { scale: 1, xPercent: 0, opacity: 1, duration: 0.7, ease: "expo.out" },
          0,
        )
        .fromTo(
          scope.querySelectorAll("[data-line]"),
          { y: 14, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, stagger: 0.045, ease: "expo.out" },
          0.05,
        )
        .fromTo(
          scope.querySelectorAll("[data-pop]"),
          { scale: 0.8, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.42, ease: "back.out(2.2)" },
          0.26,
        );

      if (barRef.current) {
        gsap.fromTo(
          barRef.current,
          { scaleX: 0 },
          { scaleX: 1, duration: DWELL_MS / 1000, ease: "none" },
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [index]);

  if (items.length === 0) return null;
  const item = items[index];

  return (
    <article
      className="group/tile relative isolate overflow-hidden bg-k-ink p-[26px] transition-colors hover:bg-k-ink-deep"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label={upGreek(labels.eyebrow)}
    >
      {/*
        Η ΦΩΤΟΓΡΑΦΙΑ ΒΓΑΙΝΕΙ ΕΞΩ ΑΠΟ ΤΟ ΠΛΑΙΣΙΟ.
        ──────────────────────────────────────────────────────────────────────
        Σε 400×259 μια «κανονική» στήλη εικόνας άφηνε 200 πίξελ για κείμενο και
        η τιμή δεν χωρούσε. Βγαίνοντας από τη δεξιά και την κάτω ακμή, το
        προϊόν γίνεται μεγάλο χωρίς να ζητήσει χώρο.

        Πίσω από το κείμενο, με σκίαση από αριστερά ώστε η τιμή να διαβάζεται
        πάνω σε οποιοδήποτε προϊόν — το `overflow-hidden` του πλακιδίου κόβει
        ό,τι περισσεύει.
      */}
      <div ref={stageRef} key={index} className="flex h-full min-w-0 flex-col">
        {item.image && (
          <span
            data-shot
            aria-hidden
            className="pointer-events-none absolute -right-6 -bottom-8 block w-[188px]"
            /*
             * ΟΙ ΦΩΤΟΓΡΑΦΙΕΣ ΤΟΥ ΚΑΤΑΛΟΓΟΥ ΕΧΟΥΝ ΛΕΥΚΟ ΦΟΝΤΟ.
             *
             * Στις λευκές κάρτες δεν φαίνεται· πάνω σε μαύρο πλακίδιο γίνεται
             * κολλημένο ορθογώνιο με σκληρή ακμή. Η μάσκα σβήνει τις δύο
             * πλευρές που ακουμπούν το κείμενο, ώστε το προϊόν να βγαίνει από
             * το σκοτάδι αντί να κάθεται πάνω του.
             */
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, #000 34%), linear-gradient(to top, transparent 0%, #000 26%)",
              WebkitMaskComposite: "source-in",
              maskImage:
                "linear-gradient(to right, transparent 0%, #000 34%), linear-gradient(to top, transparent 0%, #000 26%)",
              maskComposite: "intersect",
            }}
          >
            <Image
              src={item.image}
              alt=""
              width={376}
              height={376}
              className="h-auto w-full object-contain"
              unoptimized
            />
          </span>
        )}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-k-ink via-k-ink/85 to-transparent"
        />

        <span className="relative flex min-w-0 flex-col">
          <span
            data-line
            className="t-badge inline-block self-start bg-k-red px-[9px] py-[4px] text-white"
          >
            {upGreek(labels.eyebrow)}
          </span>

          <span data-line className="t-card-sku mt-2 text-white/45">
            {item.brand} · {item.code}
          </span>

          <span data-line className="t-tile-title mt-0.5 line-clamp-2 max-w-[215px] text-white">
            {item.name}
          </span>
        </span>

        <span className="relative mt-auto flex max-w-[215px] flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {item.was && (
            <span data-line className="t-card-was text-white/40 line-through tabular-nums">
              {item.was}
            </span>
          )}
          <span data-line className="t-card-price text-white tabular-nums">
            {item.now}
          </span>
          {item.off && (
            <span data-pop className="t-badge bg-k-red px-[7px] py-[3px] text-white tabular-nums">
              {item.off}
            </span>
          )}
          <span data-line className="t-card-vat w-full text-white/35">
            {upGreek(labels.vat)}
          </span>
        </span>

        <Link
          data-line
          href={item.href}
          className="t-link-mono relative mt-2 self-start border-b-[1.5px] border-k-red pb-[3px] text-white transition-colors hover:text-k-red"
        >
          {upGreek(labels.cta)} →
        </Link>
      </div>

      {/*
        Οι δείκτες λένε πόσα είναι και πού βρισκόμαστε — χωρίς αυτούς η εναλλαγή
        μοιάζει τυχαία. Είναι κουμπιά, άρα πατιούνται και με πληκτρολόγιο, και
        η γεμάτη μπάρα δείχνει πόσος χρόνος μένει.
      */}
      {items.length > 1 && (
        <div className="absolute inset-x-[26px] bottom-3 z-20 flex gap-1">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${i + 1} ${labels.of} ${items.length}`}
              aria-current={i === index}
              className="relative h-0.5 flex-1 overflow-hidden bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-k-red"
            >
              {i === index && (
                <span
                  ref={barRef}
                  className="absolute inset-0 origin-left bg-k-red"
                  style={{ transform: "scaleX(0)" }}
                />
              )}
            </button>
          ))}
        </div>
      )}
    </article>
  );
}
