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
  brandLogo: string | null;
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

      /*
       * Δύο στρώσεις, δύο άξονες.
       *
       * Η λευκή πλάκα ανοίγει ΑΠΟ ΤΑ ΔΕΞΙΑ (clip-path) — το προϊόν μπαίνει
       * στη θέση του, δεν εμφανίζεται από το πουθενά. Το κείμενο έρχεται από
       * ΑΡΙΣΤΕΡΑ με κλιμάκωση. Διαφορετικές κατευθύνσεις σημαίνει ότι το μάτι
       * τις διαβάζει ως δύο πράγματα, όχι ως ένα που τρεμοπαίζει.
       *
       * Τελευταία η τιμή και το λογότυπο: αυτά θες να μείνουν.
       */
      gsap
        .timeline({ defaults: { ease: "expo.out" } })
        .fromTo(
          scope.querySelectorAll("[data-shot]"),
          { clipPath: "inset(0 0 0 100%)" },
          { clipPath: "inset(0 0 0 0%)", duration: 0.62 },
          0,
        )
        .fromTo(
          scope.querySelectorAll("[data-photo]"),
          { scale: 1.1, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.85 },
          0.1,
        )
        .fromTo(
          scope.querySelectorAll("[data-line]"),
          { x: -16, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.55, stagger: 0.045 },
          0.06,
        )
        .fromTo(
          scope.querySelectorAll("[data-pop]"),
          { scale: 0.78, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2.4)" },
          0.34,
        )
        .fromTo(
          scope.querySelectorAll("[data-logo]"),
          { y: 10, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5 },
          0.42,
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
        {/*
          ΔΥΟ ΖΩΝΕΣ: ΣΚΟΤΕΙΝΗ ΓΙΑ ΤΟ ΚΕΙΜΕΝΟ, ΦΩΤΕΙΝΗ ΓΙΑ ΤΟ ΠΡΟΪΟΝ.
          ────────────────────────────────────────────────────────────────────
          Δύο προσπάθειες πήγαν στραβά για τον ίδιο λόγο: οι φωτογραφίες του
          καταλόγου είναι τραβηγμένες ΣΕ ΛΕΥΚΟ. Με `cover` το εργαλείο έμενε
          μικρό μέσα στα λευκά περιθώρια· με σκοτείνιασμα και μάσκα χανόταν
          τελείως. Όσο περισσότερο gradient έμπαινε πάνω του, τόσο λιγότερο
          καταλάβαινε κανείς τι πουλάμε.

          Το σωστό είναι να μην μπει τίποτα πάνω του. Το προϊόν παίρνει τη
          δική του λευκή πλάκα — όπως ακριβώς κάνουν ήδη οι κάρτες του site —
          και το κείμενο κρατά τη δική του σκοτεινή. Καμία επικάλυψη, άρα
          καμία απώλεια: η τιμή διαβάζεται σε συμπαγές μαύρο και το εργαλείο
          φαίνεται όπως φωτογραφήθηκε.
        */}
        {/*
          Η ΠΛΑΚΑ ΥΠΑΡΧΕΙ ΠΑΝΤΑ, ΚΑΙ ΠΟΤΕ ΔΕΝ ΕΙΝΑΙ ΑΔΕΙΑ.
          ────────────────────────────────────────────────────────────────────
          Όταν κρεμόταν από τη φωτογραφία, ένα προϊόν χωρίς εικόνα έριχνε όλη
          τη δεξιά ζώνη και η κάρτα έμενε μισή. Στον κατάλογο υπάρχουν τέτοια.

          Τώρα η πλάκα μένει και δείχνει ό,τι έχει: τη φωτογραφία αν υπάρχει,
          και σε κάθε περίπτωση το λογότυπο της μάρκας — που λέει ΠΟΙΟΥ είναι
          το εργαλείο, η πρώτη πληροφορία που ψάχνει ο επαγγελματίας. Χωρίς
          φωτογραφία το λογότυπο παίρνει τη μέση· με φωτογραφία πάει γωνία.
        */}
        <span data-shot aria-hidden className="pointer-events-none absolute inset-y-0 right-0 block w-[47%] bg-white">
          {item.image && (
            <Image
              data-photo
              src={item.image}
              alt=""
              fill
              sizes="190px"
              className="object-contain p-3.5 pb-16"
              unoptimized
            />
          )}
          {item.brandLogo && (
            <span
              data-logo
              className={
                item.image
                  ? "absolute right-3 bottom-3 block h-12 w-[152px]"
                  : "absolute inset-0 m-auto block h-16 w-[160px]"
              }
            >
              <Image
                src={item.brandLogo}
                alt=""
                fill
                sizes="160px"
                className={`object-contain ${item.image ? "object-right opacity-90" : "object-center"}`}
                unoptimized
              />
            </span>
          )}
        </span>

        <span className="relative flex min-w-0 flex-col">
          <span
            data-line
            className="t-badge inline-block self-start bg-k-red px-[9px] py-[4px] text-white"
          >
            {upGreek(labels.eyebrow)}
          </span>

          <span data-line className="t-card-sku mt-2.5 text-white/45">
            {item.brand} · {item.code}
          </span>

          <span data-line className="t-tile-title mt-1 line-clamp-2 max-w-[170px] text-white">
            {item.name}
          </span>
        </span>

        {/*
          Η τιμή πρώτη και χοντρή, η διαγραμμένη από κάτω σε δική της σειρά.
          Μία τιμή διαβάζεται, δεν συγκρίνεται: το «πριν» έρχεται δεύτερο.
        */}
        <span className="relative mt-auto block max-w-[170px]">
          <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span data-line className="t-tile-price text-white">
              {item.now}
            </span>
            {item.off && (
              <span data-pop className="t-badge bg-k-red px-[7px] py-[3px] text-white tabular-nums">
                {item.off}
              </span>
            )}
          </span>
          {item.was && (
            <span data-line className="t-tile-was mt-1 block text-white/35 line-through">
              {item.was}
            </span>
          )}
          <span data-line className="t-card-vat mt-1 block text-white/35">
            {upGreek(labels.vat)}
          </span>
        </span>

        {/* Οπτική ένδειξη μόνο· ο σύνδεσμος είναι όλο το πλακίδιο, παρακάτω. */}
        <span
          data-line
          className="t-link-mono relative mt-3 self-start border-b-[1.5px] border-k-red pb-[3px] text-white transition-colors group-hover/tile:text-k-red"
        >
          {upGreek(labels.cta)} →
        </span>
      </div>

      {/*
        ΟΛΟ ΤΟ ΠΛΑΚΙΔΙΟ ΕΙΝΑΙ Ο ΣΥΝΔΕΣΜΟΣ.
        ──────────────────────────────────────────────────────────────────────
        Ο μικρός σύνδεσμος κάτω ήταν ο μόνος στόχος: όποιος πατούσε τη
        φωτογραφία, το όνομα ή την τιμή δεν πήγαινε πουθενά.

        Ένας σύνδεσμος που σκεπάζει την κάρτα, όχι πολλοί μέσα στο κείμενο —
        ένας στόχος για το ποντίκι, μία ανακοίνωση στον αναγνώστη οθόνης. Οι
        δείκτες από κάτω έχουν z-20 και μένουν πατήσιμοι από πάνω του.
      */}
      <Link
        href={item.href}
        aria-label={`${item.brand} ${item.name} — ${item.now}`}
        className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-k-red"
      />

      {/*
        Οι δείκτες λένε πόσα είναι και πού βρισκόμαστε — χωρίς αυτούς η εναλλαγή
        μοιάζει τυχαία. Είναι κουμπιά, άρα πατιούνται και με πληκτρολόγιο, και
        η γεμάτη μπάρα δείχνει πόσος χρόνος μένει.
      */}
      {items.length > 1 && (
        <div className="absolute bottom-3 left-[26px] z-20 flex w-[170px] gap-1">
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
