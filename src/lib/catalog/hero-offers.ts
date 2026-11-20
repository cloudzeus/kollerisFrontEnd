import { formatPrice, savingsOf } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import type { ProductCardData } from "@/lib/catalog/queries";
import type { HeroOfferItem } from "@/components/home/HeroOffersTile";

/**
 * Τα προϊόντα της προσφοράς, έτοιμα για την κάρτα του hero.
 *
 * ── Γιατί μορφοποιεί εδώ ───────────────────────────────────────────────────
 *
 * Η κάρτα είναι client component. Αν έκανε η ίδια τη μορφοποίηση χρήματος, θα
 * υπήρχαν δύο κανόνες στρογγυλοποίησης για την ίδια τιμή — ένας στον server
 * για όλη τη βιτρίνα και ένας εδώ. Τα ποσά φεύγουν έτοιμα· το component μόνο
 * τα κινεί.
 */

export type HeroOfferLabels = {
  inStock: string;
  order: string;
};

export function heroOfferItems(
  products: ProductCardData[],
  locale: Locale,
  labels: HeroOfferLabels,
): HeroOfferItem[] {
  const items: Array<HeroOfferItem & { percent: number }> = [];

  for (const p of products) {
    /*
     * Χωρίς «πριν» δεν υπάρχει προσφορά να δείξει το hero.
     *
     * Μια κάρτα με μία τιμή και σήμα «ΠΡΟΣΦΟΡΑ» λέει στον πελάτη ότι κερδίζει
     * χωρίς να του δείχνει από τι. Το `savingsOf` επιστρέφει null όταν η
     * κανονική δεν είναι μεγαλύτερη, που είναι ακριβώς ο έλεγχος που θέλουμε.
     */
    if (p.priceNet == null || p.priceListNet == null) continue;
    const ctx = { vatRate: p.vatRate };
    const saving = savingsOf(p.priceListNet, p.priceNet, locale, ctx);
    if (!saving) continue;

    items.push({
      percent: saving.percent,
      href: `/proion/${p.slug}`,
      name: p.name,
      brand: p.brandName ?? "",
      code: p.sku,
      image: p.image,
      was: formatPrice(p.priceListNet, locale, ctx),
      now: formatPrice(p.priceNet, locale, ctx),
      off: `−${Math.round(saving.percent)}%`,
      stock: p.inStock ? labels.inStock : labels.order,
      inStock: p.inStock,
    });
  }

  /* Μεγαλύτερη μείωση πρώτη: το hero δείχνει λίγα, και το πρώτο που βλέπει
     κανείς πρέπει να είναι το δυνατότερο επιχείρημα. */
  items.sort((a, b) => b.percent - a.percent);
  return items.map(({ percent: _percent, ...item }) => item);
}
