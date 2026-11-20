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
 * ξεχασμένο: έδειχνε έκπτωση που μπορεί να μην τρέχει, σε μάρκα που μπορεί να
 * μην είναι σε προσφορά. Τώρα δείχνει ό,τι είναι ΠΡΑΓΜΑΤΙΚΑ μειωμένο, με την
 * τιμή που θα πληρώσει ο πελάτης.
 *
 * ── Οι τιμές έρχονται έτοιμες ──────────────────────────────────────────────
 *
 * Ο server δίνει τα ποσά ήδη μορφοποιημένα. Η μορφοποίηση χρήματος ζει σε ένα
 * σημείο (`lib/format`), και ένα client component που θα τη ξανάκανε θα ήταν
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
  const cardRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  /*
   * Η ίδια η επιλογή του χρήστη, διαβασμένη μία φορά.
   *
   * `prefers-reduced-motion` δεν είναι προτίμηση γούστου: υπάρχουν άνθρωποι
   * που ζαλίζονται. Με αυτό ενεργό η κάρτα αλλάζει χωρίς μετατόπιση και η
   * μπάρα δεν «τρέχει» — το περιεχόμενο παραμένει ακριβώς το ίδιο.
   */
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  // Ο χρόνος. Σταματά στο hover και στο πληκτρολόγιο: τρία δευτερόλεπτα δεν
  // φτάνουν για να διαβάσεις τιμή και όνομα αν κάτι σου τράβηξε το μάτι.
  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = window.setTimeout(advance, DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [index, paused, advance, items.length]);

  // Η κίνηση. Το GSAP φορτώνεται μόνο στον browser και μόνο όταν χρειάζεται.
  useEffect(() => {
    const card = cardRef.current;
    if (!card || reducedRef.current) return;
    let cancelled = false;

    void import("gsap").then(({ gsap }) => {
      if (cancelled || !cardRef.current) return;
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" },
      );
      const chip = cardRef.current.querySelector("[data-off]");
      if (chip) gsap.fromTo(chip, { scale: 0.86 }, { scale: 1, duration: 0.4, delay: 0.08, ease: "back.out(2)" });

      /* Η μπάρα γεμίζει στον χρόνο που μένει το προϊόν — εξηγεί την κίνηση
         αντί να τη διακοσμεί, και δείχνει πόσο έχει μείνει. */
      if (fillRef.current) {
        gsap.fromTo(
          fillRef.current,
          { scaleX: 0 },
          { scaleX: 1, duration: DWELL_MS / 1000, ease: "none", paused },
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [index, paused]);

  if (items.length === 0) return null;
  const item = items[index];

  return (
    <article
      className="group/tile relative grid grid-cols-[1fr_128px] items-stretch gap-4 overflow-hidden bg-k-ink p-[26px] transition-colors hover:bg-k-ink-deep"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label={labels.eyebrow}
    >
      <div ref={cardRef} className="flex min-w-0 flex-col">
        <span className="t-badge inline-block self-start bg-k-red px-[9px] py-[5px] text-white">
          {upGreek(labels.eyebrow)}
        </span>

        <span className="t-card-sku mt-2.5 text-white/45">
          {item.brand} · {item.code}
        </span>

        <p className="t-tile-title mt-1 line-clamp-2 text-white">{item.name}</p>

        <span
          className={`t-card-stock mt-1.5 flex items-center gap-1.5 ${
            item.inStock ? "text-k-green" : "text-white/55"
          }`}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-current" />
          {upGreek(item.stock)}
        </span>

        <span className="mt-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {item.was && (
            <span className="t-card-was text-white/45 line-through tabular-nums">{item.was}</span>
          )}
          <span className="t-card-price text-white tabular-nums">{item.now}</span>
          {item.off && (
            <span data-off className="t-badge bg-k-red px-[7px] py-[3px] text-white tabular-nums">
              {item.off}
            </span>
          )}
        </span>
        <span className="t-card-vat mt-0.5 text-white/40">{upGreek(labels.vat)}</span>

        <Link
          href={item.href}
          className="t-link-mono mt-auto self-start border-b-[1.5px] border-k-red pt-3 pb-[3px] text-white transition-colors hover:text-k-red"
        >
          {upGreek(labels.cta)} →
        </Link>
      </div>

      {item.image && (
        <span className="flex items-center justify-center self-center">
          <Image
            src={item.image}
            alt=""
            width={128}
            height={128}
            className="h-auto w-full object-contain"
            unoptimized
          />
        </span>
      )}

      {/*
        Οι δείκτες λένε πόσα είναι και πού βρισκόμαστε — χωρίς αυτούς η εναλλαγή
        μοιάζει τυχαία. Είναι κουμπιά, άρα πατιούνται και με πληκτρολόγιο.
      */}
      {items.length > 1 && (
        <div className="absolute inset-x-[26px] bottom-2.5 flex gap-1">
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
                  ref={fillRef}
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
