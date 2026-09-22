import { prisma } from "@/lib/prisma";

/**
 * Ο έλεγχος υγείας του container.
 *
 * ── Γιατί όχι η αρχική σελίδα ─────────────────────────────────────────────
 *
 * Ο έλεγχος ζητούσε ολόκληρη την αρχική, με όριο 5″. Η αρχική διαβάζει
 * κατηγορίες, μενού, μάρκες, προτεινόμενα και στατιστικά μέσα από το
 * `unstable_cache` — και αυτή η cache ζει στον δίσκο του container, άρα
 * ΣΒΗΝΕΤΑΙ σε κάθε επανεκκίνηση. Η πρώτη αρχική μετά από restart χτίζεται από το
 * μηδέν· αν αργήσει πάνω από 5″, ο έλεγχος αποτυγχάνει, η πλατφόρμα ξαναξεκινά
 * το container, η cache αδειάζει ξανά. Φαύλος κύκλος: ένα eshop που δούλευε
 * μέρες δεν μπορεί να ξανασηκωθεί από τη στιγμή που θα πέσει μία φορά.
 * Έτσι έπεσε στις 22/9/2026 — Traefik «no available server», ενώ το container
 * άνοιγε διαρκώς νέες συνδέσεις στη βάση (25 σε 4 λεπτά).
 *
 * ── Τι ελέγχει ───────────────────────────────────────────────────────────
 *
 * Περνά από τον χειριστή αιτημάτων του Next — όπως ήθελε και ο παλιός έλεγχος,
 * γιατί ένας server που έχει σπάσει μέσα στον χειριστή δέχεται ακόμη συνδέσεις
 * — και κάνει ένα `SELECT 1`: η βάση απαντά, ο server απαντά. Τίποτα βαρύ, και
 * τίποτα που να εξαρτάται από ζεστή cache.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { ok: true, db: "up", ms: Date.now() - started },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, db: "down", error: error instanceof Error ? error.message : String(error) },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
