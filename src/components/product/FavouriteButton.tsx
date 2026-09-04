"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Heart, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { toggleFavourite } from "@/lib/account/favourites";
import { cn } from "@/lib/utils";

/**
 * Η καρδιά.
 *
 * Αισιόδοξη: γεμίζει με το πάτημα και επιστρέφει μόνο αν ο διακομιστής
 * διαφωνήσει. Το αποθηκευμένο προϊόν δεν είναι πληρωμή — η αναμονή μισού
 * δευτερολέπτου για κάτι τόσο μικρό κάνει τη σελίδα να μοιάζει βαριά.
 *
 * Ο επισκέπτης δεν παίρνει σφάλμα. Πάει στη σύνδεση με το προϊόν στο χέρι, και
 * γυρίζει εκεί που ήταν: «δεν σε ξέρω ακόμη» δεν είναι λάθος του χρήστη.
 *
 * Χωρίς κείμενο δίπλα: η καρδιά κάθεται πάνω στη φωτογραφία, όπου κάθε λέξη
 * κλέβει από το προϊόν. Το `aria-label` και το `title` λένε τι κάνει σε όποιον
 * χρειάζεται να το διαβάσει.
 */
export function FavouriteButton({
  productId,
  initial,
  className,
  size = "md",
}: {
  productId: string;
  initial: boolean;
  className?: string;
  size?: "sm" | "md";
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  /*
   * Ο επισκέπτης δεν πετάγεται στη φόρμα.
   * ───────────────────────────────────────────────────────────────────────────
   * Πατούσε μια καρδιά και βρισκόταν σε σελίδα σύνδεσης, χωρίς να του έχει πει
   * κανείς γιατί — μοιάζει με τοίχο, όχι με απάντηση. Και του έκλεβε τη σελίδα
   * που διάβαζε.
   *
   * Το παράθυρο εξηγεί σε μία γραμμή τι κερδίζει, και δίνει ΚΑΙ ΤΙΣ ΔΥΟ πόρτες:
   * όποιος έχει λογαριασμό δεν πρέπει να ψάχνει τη σύνδεση μέσα από την
   * εγγραφή, και όποιος δεν έχει δεν πρέπει να νομίζει ότι δεν μπορεί.
   */
  const [askSignIn, setAskSignIn] = useState(false);
  const [redirect, setRedirect] = useState("/");

  const label = on ? "Αφαίρεση από τα αγαπημένα" : "Αποθήκευση στα αγαπημένα";

  return (
    <>
      <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      title={label}
      disabled={pending}
      onClick={(event) => {
        // Η κάρτα είναι σύνδεσμος· χωρίς αυτό, η καρδιά ανοίγει το προϊόν.
        event.preventDefault();
        event.stopPropagation();
        const next = !on;
        setOn(next);
        start(async () => {
          const result = await toggleFavourite(productId);
          if (result.ok) return;
          setOn(!next);
          if (result.reason === "signedOut") {
            setRedirect(window.location.pathname + window.location.search);
            setAskSignIn(true);
          }
        });
      }}
      className={cn(
        "flex items-center justify-center border transition-colors",
        /* Ίδιο ύψος με το κουμπί σύγκρισης δίπλα — px-1.5/py-1 γύρω από ένα
           στοιχείο 12px, δηλαδή 22px. Δύο κουμπιά στην ίδια ευθεία με
           διαφορετικό ύψος διαβάζονται ως λάθος στοίχιση, όχι ως ιεραρχία. */
        size === "sm" ? "size-[22px]" : "size-8",
        on
          ? "border-k-red bg-k-red text-white"
          : "border-k-line-2 bg-white/90 text-k-text-3 hover:border-k-red hover:text-k-red",
        pending && "opacity-70",
        className,
      )}
    >
      <Heart
        className={cn(size === "sm" ? "size-3" : "size-4")}
        fill={on ? "currentColor" : "none"}
        strokeWidth={2}
      />
      </button>

      {askSignIn && <SignInPrompt redirect={redirect} onClose={() => setAskSignIn(false)} />}
    </>
  );
}

/**
 * Το παράθυρο που εξηγεί γιατί χρειάζεται λογαριασμός.
 *
 * Δικό μας και όχι Radix: η καρδιά μπαίνει σε κάθε κάρτα, και ένα πλέγμα 96
 * προϊόντων θα φόρτωνε τη βιβλιοθήκη διαλόγων για ένα παράθυρο που ίσως δεν
 * ανοίξει ποτέ. Ό,τι χρειάζεται ένας διάλογος το κάνει μόνο του: Escape,
 * κλικ στο φόντο, εστίαση στο κύριο κουμπί, `aria-modal`.
 */
function SignInPrompt({ redirect, onClose }: { redirect: string; onClose: () => void }) {
  const primary = useRef<HTMLAnchorElement>(null);
  const to = encodeURIComponent(redirect);

  useEffect(() => {
    primary.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Το φόντο δεν κυλάει όσο το παράθυρο είναι ανοιχτό.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  /*
   * Πύλη στο `body`: η καρδιά ζει μέσα σε κάρτα προϊόντος, και ένας πρόγονος με
   * `@container` (ή `overflow-hidden`) κάνει το `position: fixed` να μετριέται
   * από την κάρτα αντί για το παράθυρο — το πλαίσιο θα εμφανιζόταν στριμωγμένο
   * μέσα στο κουτί του προϊόντος.
   */
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="fav-prompt-title"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-k-ink/60 px-4 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[26rem] border border-k-line bg-white p-6 lg:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Κλείσιμο"
          className="absolute top-3 right-3 p-1 text-k-text-4 transition-colors hover:text-k-ink"
        >
          <X className="size-4" />
        </button>

        <span className="flex size-11 items-center justify-center border border-k-red bg-k-red text-white">
          <Heart className="size-5" fill="currentColor" />
        </span>

        <h2
          id="fav-prompt-title"
          className="font-display t-display mt-4 text-[19px] leading-tight text-k-ink"
        >
          ΚΡΑΤΗΣΤΕ ΤΟ ΓΙΑ ΑΡΓΟΤΕΡΑ
        </h2>
        <p className="mt-2 text-[13px] leading-[1.65] text-k-text-2">
          Τα αγαπημένα αποθηκεύονται στον λογαριασμό σας, ώστε να τα βρίσκετε
          εύκολα από οποιαδήποτε συσκευή.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            ref={primary}
            href={`/eisodos?redirect=${to}`}
            className="font-sans flex h-11 items-center justify-center bg-k-ink-deep px-6 text-[13px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-k-ink"
          >
            ΕΙΣΟΔΟΣ ΣΤΟΝ ΛΟΓΑΡΙΑΣΜΟ
          </Link>
          <Link
            href="/eggrafi"
            className="font-sans flex h-11 items-center justify-center border border-k-line-2 px-6 text-[13px] font-bold tracking-[0.08em] text-k-ink transition-colors hover:border-k-ink"
          >
            ΔΗΜΙΟΥΡΓΙΑ ΛΟΓΑΡΙΑΣΜΟΥ
          </Link>
        </div>

        {/* Η τρίτη έξοδος, χωρίς έμφαση: το «όχι τώρα» πρέπει να υπάρχει, αλλά
            δεν είναι αυτό που προτείνουμε. */}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-[12px] text-k-text-3 transition-colors hover:text-k-ink"
        >
          Συνέχεια χωρίς λογαριασμό
        </button>
      </div>
    </div>,
    document.body,
  );
}
