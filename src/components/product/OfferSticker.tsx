import type { ProductCardData } from "@/lib/catalog/queries";

/**
 * Το sticker της προσφοράς, κάτω δεξιά στη φωτογραφία (HDCtool → «Sticker στη
 * βιτρίνα»). Ένα SVG από το HDCtool, ίδιο σε όλες τις κάρτες της προσφοράς.
 *
 * `<img>` και όχι `next/image`: το SVG σερβίρεται με δικό του CSP από το
 * HDCtool, και ο optimizer δεν κάνει τίποτα για ένα διανυσματικό αρχείο 2 KB.
 */
export function OfferSticker({
  sticker,
  className,
}: {
  sticker: ProductCardData["sticker"];
  className: string;
}) {
  if (!sticker) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sticker.url}
      alt={sticker.alt ?? ""}
      width={64}
      height={64}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={className}
    />
  );
}
