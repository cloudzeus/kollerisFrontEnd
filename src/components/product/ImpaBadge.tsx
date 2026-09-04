import Image from "next/image";

/**
 * Το σήμα IMPA.
 *
 * Το IMPA είναι το διεθνές πρότυπο ναυτιλιακών προμηθειών: ο αγοραστής ενός
 * πλοίου δουλεύει με λίστα κωδικών IMPA, όχι με ονόματα προϊόντων.
 *
 * ── Το σχήμα θέλει ύψος ───────────────────────────────────────────────────
 *
 * Το λογότυπο είναι ΔΙΓΡΑΜΜΟ — «im» πάνω, «pa» κάτω, με το γκρι κύμα από κάτω.
 * Σε ύψος 26px κάθε σειρά πέφτει κάτω από 9px και οι δύο γίνονται μουτζούρα:
 * δεν διαβάζεται ως λογότυπο, διαβάζεται ως σπασμένη φωτογραφία. Δεν είναι
 * θέμα ανάλυσης — είναι σχήμα που δεν σμικρύνεται.
 *
 * Γι' αυτό 30px στην κάρτα και 40 στη σελίδα: το ελάχιστο στο οποίο οι δύο
 * σειρές διαβάζονται. Χωρίς πλαίσιο, ώστε να μένει διακριτικό παρά το μέγεθος.
 */
const RATIO = 1920 / 1777;

export function ImpaBadge({ code, className = "" }: { code: string; className?: string }) {
  return <ImpaMark code={code} height={30} className={className} />;
}

/**
 * Το σήμα, χωρίς πλαίσιο.
 *
 * Χωρίς περίγραμμα και χωρίς φόντο: το κουτί γύρω από ένα λογότυπο με διάφανο
 * φόντο το κάνει να μοιάζει με μικρογραφία που δεν φόρτωσε. Το ίδιο το σήμα
 * είναι ήδη σχήμα — δεν χρειάζεται δεύτερο.
 */
export function ImpaMark({
  code,
  height = 44,
  className = "",
}: {
  code: string;
  height?: number;
  className?: string;
}) {
  return (
    <Image
      src="https://kolleris.b-cdn.net/eshop/library/impalogo-1788510932636.webp"
      alt={`IMPA ${code}`}
      title={`IMPA ${code}`}
      width={Math.round(height * RATIO)}
      height={height}
      unoptimized
      className={`block w-auto shrink-0 object-contain ${className}`}
      style={{ height }}
    />
  );
}
