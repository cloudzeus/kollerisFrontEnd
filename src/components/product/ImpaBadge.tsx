import Image from "next/image";

/**
 * Το σήμα IMPA.
 *
 * Το IMPA είναι το διεθνές πρότυπο ναυτιλιακών προμηθειών: ο αγοραστής ενός
 * πλοίου δουλεύει με λίστα κωδικών IMPA, όχι με ονόματα προϊόντων. Το σήμα
 * απαντά τη μία ερώτηση που έχει κοιτώντας μια κάρτα — «είναι αυτό;» — χωρίς να
 * ανοίξει το προϊόν.
 *
 * Εικονίδιο και όχι κείμενο, γιατί ο κωδικός δεν λέει τίποτα σε όποιον δεν τον
 * ψάχνει: έξι ψηφία δίπλα στο όνομα είναι θόρυβος για το 99% των πελατών και
 * σήμα για το 1% που πληρώνει τα περισσότερα. Το `title` το δίνει σε όποιον
 * σταθεί πάνω του, και το `aria-label` σε όποιον διαβάζει με φωνή.
 */
export function ImpaBadge({ code, className = "" }: { code: string; className?: string }) {
  const label = `IMPA ${code}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={`flex items-center justify-center border border-k-line-2 bg-white/90 p-[3px] ${className}`}
    >
      <Image
        src="https://kolleris.b-cdn.net/eshop/library/impalogo-1788510932636.webp"
        alt=""
        width={16}
        height={16}
        unoptimized
        className="block h-[14px] w-auto object-contain"
      />
    </span>
  );
}
