"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
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
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();

  const label = on ? "Αφαίρεση από τα αγαπημένα" : "Αποθήκευση στα αγαπημένα";

  return (
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
            router.push(
              `/eisodos?redirect=${encodeURIComponent(window.location.pathname)}`,
            );
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
  );
}
