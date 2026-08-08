import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The local inventory feed — a second, small feed alongside the main product
 * feed, telling Google which products can be picked up today at the Piraeus
 * store.
 *
 * Separate file and separate route from `google-merchant.ts` on purpose:
 * Google's local inventory format is not the product feed's RSS/XML at all —
 * it is a plain tab-separated file keyed by `store_code` + `id`, documented at
 * https://support.google.com/merchants/answer/6324476. Reusing the XML feed's
 * shape here would just be wrong, not merely inconsistent.
 *
 * `id` MUST match the `<g:id>` in the product feed exactly — both are the
 * `mtrl`. Google links the two feeds on that value; a mismatch is a silent
 * drop, not an error either feed reports.
 *
 * There is one physical location behind this whole shop — the Piraeus
 * address in `SHOP` — so "in the database" and "in the Piraeus store" are the
 * same stock. A second store would need a second `store_code` and a way to
 * split quantity between them; nothing here assumes that.
 */

/**
 * Ο κωδικός καταστήματος, όπως τον έχει το Επιχειρηματικό Προφίλ — ΟΧΙ όπως
 * θα τον διαλέγαμε εμείς.
 *
 * Ήταν `peiraias`, και το Merchant Center το απέρριψε ολόκληρο το αρχείο:
 * «Μη έγκυρος κωδικός καταστήματος». Ο κωδικός ΔΕΝ επιλέγεται από εδώ. Ο
 * Google τον αντιστοιχεί με το Επιχειρηματικό Προφίλ, και ό,τι δεν υπάρχει
 * εκεί δεν αντιστοιχεί σε κανένα κατάστημα — οπότε και οι 9.522 γραμμές πάνε
 * χαμένες μαζί, χωρίς ούτε μία να περάσει.
 *
 * Το `om-` δεν είναι όνομα που έδωσε άνθρωπος· είναι ο κωδικός που παράγει ο
 * ίδιος ο Google για τοποθεσία που δεν έχει δικό της. Άσχημος να τον διαβάσεις,
 * αλλά αυτός είναι που ταιριάζει.
 *
 * Παραμένει σε env var: αν κάποια στιγμή δοθεί στο Επιχειρηματικό Προφίλ
 * κανονικός κωδικός, αλλάζει χωρίς deploy.
 */
const STORE_CODE =
  process.env.GOOGLE_LOCAL_STORE_CODE?.trim() || "om-8281271752754963088";

/** Ready in about two hours during opening hours — see `SHOP` and the pickup shipping method. */
const PICKUP_SLA = "same_day";

/**
 * Παραλαβή προσφέρεται μόνο για ό,τι ΥΠΑΡΧΕΙ στο ράφι.
 *
 * Ο feed δήλωνε `buy` / `same_day` και για τα 9.522 προϊόντα, από τα οποία τα
 * 3.830 είναι εκτός αποθέματος. Δηλαδή υποσχόταν «πλήρωσε online, παράλαβε
 * σήμερα από τον Πειραιά» για δέματα που δεν υπάρχουν — υπόσχεση που δεν
 * μπορεί να τηρηθεί, και ακριβώς το είδος ασυμφωνίας που το Merchant Center
 * βρίσκει και τιμωρεί.
 *
 * Το `not_supported` είναι η τιμή του Google για «αυτό το είδος δεν
 * παραλαμβάνεται από κατάστημα». Η γραμμή μένει στον feed με `quantity 0` και
 * `out of stock`, γιατί το Google θέλει να ξέρει ότι το ξέρουμε — η ΑΠΟΥΣΙΑ
 * γραμμής διαβάζεται ως «δεν στείλαμε δεδομένα», που είναι το σφάλμα που
 * προσπαθούμε να λύσουμε.
 */
const PICKUP_UNAVAILABLE = "not_supported";

function tsvEscape(value: string): string {
  // Tabs and newlines break column alignment; nothing in these fields should
  // legitimately contain either, so replacing rather than rejecting is enough.
  return value.replace(/[\t\r\n]+/g, " ").trim();
}

/**
 * A non-negative integer, or zero.
 *
 * The ERP has 13 rows with a negative balance — an adjustment artefact, not a
 * real quantity. Google rejects a negative value outright; clamped to zero
 * rather than dropping the row, the same direction as every other "don't
 * believe an implausible number" guard in this codebase.
 */
export function clampQuantity(qty: number | null | undefined): number {
  const n = Number(qty ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Google's two local-inventory values, exactly as it expects them written. */
export function availabilityFor(inStock: boolean, quantity: number): "in stock" | "out of stock" {
  return inStock && quantity > 0 ? "in stock" : "out of stock";
}

export async function buildLocalInventoryFeed(): Promise<string> {
  const products = await prisma.product.findMany({
    where: { isActive: true, priceNet: { gt: 0 }, images: { some: {} } },
    select: { mtrl: true, qty: true, inStock: true },
    orderBy: { mtrl: "asc" },
  });

  const header = ["store_code", "id", "quantity", "availability", "pickup_method", "pickup_sla"];

  const rows = products.map((product) => {
    const quantity = clampQuantity(product.qty ? Number(product.qty) : null);
    const availability = availabilityFor(product.inStock, quantity);

    const available = availability === "in stock";

    return [
      STORE_CODE,
      String(product.mtrl),
      String(quantity),
      availability,
      // Checkout completes fully online before pickup — see the "pickup"
      // shipping method in `cart/options.ts` — which is Google's "buy", not
      // "reserve" (pay in store) or "ship_to_store". Ό,τι δεν υπάρχει στο ράφι
      // δεν παραλαμβάνεται: βλ. PICKUP_UNAVAILABLE.
      available ? "buy" : PICKUP_UNAVAILABLE,
      // Το SLA περιγράφει ΠΟΤΕ είναι έτοιμο. Χωρίς παραλαβή δεν υπάρχει «πότε»,
      // και ένα «same_day» δίπλα σε «not_supported» είναι αντιφατικό.
      available ? PICKUP_SLA : "",
    ]
      .map(tsvEscape)
      .join("\t");
  });

  return [header.join("\t"), ...rows].join("\n") + "\n";
}
