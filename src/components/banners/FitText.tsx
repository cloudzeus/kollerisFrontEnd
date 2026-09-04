"use client";

import { useEffect, useRef } from "react";

/**
 * Κείμενο που χωράει στο κελί του — ΟΛΟ το κείμενο, μαζί.
 *
 * ── Τι έσπαγε ──────────────────────────────────────────────────────────────
 *
 * Το κελί αποδίδεται με `overflow-hidden` — πρέπει, αλλιώς μια φωτογραφία
 * `cover` θα ξεχείλιζε πάνω στο διπλανό κελί. Άρα ό,τι δεν χωράει δεν
 * ξεχειλίζει: ΚΟΒΕΤΑΙ. Μια τιμή «337,71 €» έχανε το «€», και ένας τίτλος που
 * έπιανε τέσσερις γραμμές αντί για τρεις έχανε την τελευταία.
 *
 * ── Γιατί ανά ΚΕΛΙ και όχι ανά στοιχείο ────────────────────────────────────
 *
 * Η πρώτη εκδοχή μίκραινε κάθε στοιχείο χωριστά, και έσπαγε ακριβώς αυτό που
 * είχε μόλις φτιαχτεί: την κλίμακα. Ο τίτλος είναι το μόνο που τυλίγεται σε
 * πολλές γραμμές, άρα ήταν το μόνο που συρρικνωνόταν — μετρημένο στο
 * κατάστημα, τίτλος 18px δίπλα σε τιμή 18,6px. Ο τίτλος ΜΙΚΡΟΤΕΡΟΣ από την
 * τιμή, δηλαδή σύνθεση χωρίς ιεραρχία.
 *
 * Εδώ μειώνεται η ΒΑΣΗ του κελιού. Όλοι οι ρόλοι είναι πολλαπλάσιά της, οπότε
 * όλα μικραίνουν μαζί και οι αναλογίες μένουν ακέραιες: ο τίτλος παραμένει
 * διπλάσιος του σώματος, ό,τι κι αν χρειαστεί να θυσιαστεί.
 *
 * ── Γιατί δεν λύνεται με CSS ───────────────────────────────────────────────
 *
 * Το `clamp()` κλιμακώνει με το ΠΛΑΤΟΣ του κελιού. Αυτό που λείπει είναι πόσες
 * γραμμές έπιασε τελικά το κείμενο — κανένας υπολογισμός CSS δεν το ξέρει πριν
 * στοιχειοθετηθεί, μόνο μέτρηση μετά.
 *
 * ── Ο διακομιστής γράφει ήδη το σωστό μέγεθος ──────────────────────────────
 *
 * Η βάση αποδίδεται από τον διακομιστή· αυτό εδώ μόνο τη μειώνει όταν
 * χρειάζεται. Αν η JavaScript δεν τρέξει ποτέ, το banner είναι ακριβώς ό,τι
 * ήταν πριν — όχι άδειο, όχι σε λάθος μέγεθος.
 */

/** Κάθε κείμενο που μετράει το `FitCell`. Το `data-fit` είναι η σήμανση. */
export function FitText({ children }: { children: React.ReactNode }) {
  return (
    <span data-fit className="block">
      {children}
    </span>
  );
}

/** Ο μετρητής του κελιού. Αποδίδεται μία φορά μέσα σε κάθε `.bn-clip`. */
export function FitCell() {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cell = anchor.current?.closest<HTMLElement>(".bn-clip");
    if (!cell) return;

    let frame = 0;

    const fit = () => {
      /* Πίσω στη βάση του design system πριν από κάθε μέτρηση. Χωρίς αυτό, ένα
         κελί που ΜΕΓΑΛΩΣΕ θα κρατούσε τη συρρίκνωση του προηγούμενου. */
      cell.style.removeProperty("--bn-fit");

      const spans = [...cell.querySelectorAll<HTMLElement>("[data-fit]")];
      if (spans.length === 0) return;

      const box = cell.getBoundingClientRect();
      if (!box.width || !box.height) return;

      const overflows = () =>
        spans.some((span) => {
          const r = span.getBoundingClientRect();
          return (
            r.left < box.left - 0.5 ||
            r.right > box.right + 0.5 ||
            r.top < box.top - 0.5 ||
            r.bottom > box.bottom + 0.5
          );
        });

      /* Φραγμένος βρόχος: 8% τη φορά, έξι βήματα φτάνουν στο δάπεδο του 60%.
         Ένα `while` χωρίς μετρητή πάνω σε μέτρηση διάταξης είναι πάγωμα
         σελίδας την ημέρα που κάποιο κουτί βγει μηδενικό. */
      let factor = 1;
      for (let step = 0; step < 6; step += 1) {
        if (!overflows()) break;
        factor = Math.max(0.6, factor - 0.08);
        cell.style.setProperty("--bn-fit", String(factor));
        if (factor <= 0.6) break;
      }
    };

    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fit);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(cell);
    schedule();
    /* Πριν φτάσει η Roboto Flex, το κείμενο μετριέται σε άλλη γραμματοσειρά
       και η μέτρηση δεν ισχύει. */
    document.fonts?.ready.then(schedule).catch(() => {});

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  return <span ref={anchor} className="hidden" aria-hidden />;
}
