"use client";

import { useEffect, useState } from "react";
import { CONSENT_STORAGE_KEY } from "@/components/analytics/GoogleAnalytics";

/**
 * Το banner συγκατάθεσης.
 *
 * ── Εμφανίζεται μόνο σε όποιον δεν έχει απαντήσει ─────────────────────────
 *
 * Η απάντηση κρατιέται στον browser, όχι σε cookie: το ίδιο το banner δεν
 * πρέπει να γράψει cookie για να πει ότι δεν θέλουμε cookies. Αν το
 * `localStorage` είναι κλειδωμένο —ιδιωτικό παράθυρο, αυστηρές ρυθμίσεις— το
 * banner ξαναεμφανίζεται, που είναι το σωστό: χωρίς μνήμη δεν υπάρχει
 * αποδεδειγμένη συγκατάθεση.
 *
 * ── Οι δύο επιλογές έχουν ίδιο βάρος ──────────────────────────────────────
 *
 * Η άρνηση δεν κρύβεται πίσω από «Ρυθμίσεις» ούτε γράφεται πιο αχνά. Ένα
 * banner όπου το «ναι» είναι κουμπί και το «όχι» είναι σύνδεσμος δεν συλλέγει
 * συγκατάθεση — συλλέγει κούραση, και δεν στέκει αν ελεγχθεί.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function answer(granted: boolean) {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, granted ? "granted" : "denied");
    } catch {
      /* Χωρίς μνήμη, η απάντηση ισχύει για αυτή τη σελίδα και ξαναρωτιέται. */
    }
    const w = window as unknown as { gtag?: (...args: unknown[]) => void };
    w.gtag?.("consent", "update", {
      analytics_storage: granted ? "granted" : "denied",
    });
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Συγκατάθεση για cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] sm:p-5"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-[13px] leading-relaxed text-neutral-700 sm:text-sm">
          Χρησιμοποιούμε cookies ανάλυσης για να καταλάβουμε πώς χρησιμοποιείται το
          κατάστημα και να το βελτιώσουμε. Χωρίς τη συγκατάθεσή σας δεν
          αποθηκεύεται τίποτα στη συσκευή σας.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => answer(false)}
            className="min-h-[44px] flex-1 border border-neutral-300 px-5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 sm:flex-none"
          >
            Απόρριψη
          </button>
          <button
            type="button"
            onClick={() => answer(true)}
            className="min-h-[44px] flex-1 bg-[#EA3E39] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#EA3E39] focus-visible:ring-offset-2 sm:flex-none"
          >
            Αποδοχή
          </button>
        </div>
      </div>
    </div>
  );
}
