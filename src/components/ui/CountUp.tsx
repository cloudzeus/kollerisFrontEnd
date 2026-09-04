"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ένας αριθμός που ανεβαίνει μέχρι την τιμή του.
 *
 * ── Γιατί όχι σε κάθε αριθμό της σελίδας ──────────────────────────────────
 *
 * Μόνο για μεγέθη που ΕΙΝΑΙ το επιχείρημα: «9.436 κωδικοί», «5.711 σε άμεση
 * διαθεσιμότητα». Η κίνηση εδώ λέει κάτι — ότι το νούμερο είναι μεγάλο — και
 * τραβά το βλέμμα εκεί που πρέπει. Πάνω σε μια τιμή προϊόντος ή σε ποσότητα
 * καλαθιού θα ήταν διακόσμηση, και θα έκανε τη σελίδα να μοιάζει να φορτώνει
 * κάθε φορά που κάποιος την κοιτάζει.
 *
 * ── Ξεκινά όταν φανεί, όχι όταν φορτώσει ──────────────────────────────────
 *
 * Με `IntersectionObserver`: ένα νούμερο που τελείωσε την κίνησή του πριν
 * κυλήσει κανείς ως εκεί δεν κινήθηκε ποτέ για κανέναν. Παίζει μία φορά — η
 * επανάληψη σε κάθε πέρασμα είναι ο τρόπος να γίνει ενοχλητικό.
 *
 * ── Το τελικό νούμερο υπάρχει από την πρώτη στιγμή ────────────────────────
 *
 * Το πραγματικό μέγεθος αποδίδεται στον διακομιστή και μένει στο DOM· η
 * κίνηση απλώς αντικαθιστά ό,τι ΒΛΕΠΕΙ ο χρήστης. Έτσι η μηχανή αναζήτησης
 * και ο αναγνώστης οθόνης παίρνουν «9.436» και όχι «0», και αν η JavaScript
 * δεν τρέξει ποτέ, η σελίδα είναι ήδη σωστή.
 *
 * ── Σεβασμός στο prefers-reduced-motion ───────────────────────────────────
 *
 * Όποιος έχει ζητήσει λιγότερη κίνηση παίρνει τον αριθμό ακίνητο. Δεν είναι
 * προτίμηση γούστου: για κάποιους η κίνηση στην οθόνη προκαλεί ζάλη.
 */
export function CountUp({
  value,
  /*
   * Η γλώσσα, ΟΧΙ συνάρτηση μορφοποίησης.
   * Ο γονέας είναι server component και οι συναρτήσεις δεν σειριοποιούνται
   * προς τον πελάτη — το Next απαντά «Functions cannot be passed directly to
   * Client Components» και η σελίδα δεν αποδίδεται καθόλου. Ο διαχωριστής
   * χιλιάδων προκύπτει εδώ, από την ίδια γλώσσα με τον διακομιστή.
   */
  locale,
  /** Δεκαδικά — για μεγέθη γραμμένα σε χιλιάδες («9,4K»). */
  decimals = 0,
  /** Ό,τι ακολουθεί τον αριθμό και δεν κινείται: «K», «€», «ω». */
  suffix = "",
  className,
  durationMs = 1100,
}: {
  value: number;
  locale: string;
  decimals?: number;
  suffix?: string;
  className?: string;
  durationMs?: number;
}) {
  const format = (n: number) =>
    n.toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + suffix;
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || value <= 0) return;

    let frame = 0;
    let started = false;

    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / durationMs);
        /*
         * Ease-out κυβικό: γρήγορα στην αρχή, αργά στο τέλος. Η γραμμική
         * καταμέτρηση μοιάζει με μετρητή που φορτώνει· αυτή μοιάζει με κάτι
         * που φτάνει κάπου και σταματά.
         */
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(eased * value);
        if (t < 1) frame = requestAnimationFrame(step);
        else setShown(null); // πίσω στο κείμενο του διακομιστή
      };
      frame = requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!started && entries.some((e) => e.isIntersecting)) {
          started = true;
          observer.disconnect();
          setShown(0);
          run();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {/*
        Δύο εκδοχές, μία ορατή. Το `aria-hidden` κρατά τον αναγνώστη οθόνης
        μακριά από έναν αριθμό που αλλάζει εξήντα φορές το δευτερόλεπτο —
        διαφορετικά θα τον διάβαζε όλον.
      */}
      {shown === null ? (
        format(value)
      ) : (
        <>
          <span aria-hidden="true">{format(shown)}</span>
          <span className="sr-only">{format(value)}</span>
        </>
      )}
    </span>
  );
}
