import { getTranslations, getLocale } from "next-intl/server";
import Image from "next/image";
import { AddToCartButton } from "@/components/cart/AddToCartButton";
import { BuyNowButton } from "@/components/cart/BuyNowButton";
import { CardHoverShell } from "@/components/product/CardHoverShell";
import { CompareCheckbox } from "@/components/product/CompareCheckbox";
import { QuickViewTrigger } from "@/components/product/QuickViewTrigger";
import { Link } from "@/i18n/navigation";
import type { ProductCardData } from "@/lib/catalog/queries";
import { formatPrice, formatPercent, savingsOf } from "@/lib/format";
import { upGreek } from "@/lib/greek";
import { cn } from "@/lib/utils";
import { FavouriteButton } from "@/components/product/FavouriteButton";
import { ImpaBadge } from "@/components/product/ImpaBadge";
import { favouriteIds } from "@/lib/account/favourite-ids";
import { discountedNet, offerBadgeFor } from "@/lib/offers/badges";

/**
 * Product card — a SERVER component.
 *
 * Every price, name, badge and stock label is rendered on the server. Only two
 * things cross into the client: `CardHoverShell` (a wrapper that animates what
 * it is given) and two leaf buttons that each take a single string prop.
 *
 * A grid of 96 cards therefore ships 96 product descriptions as HTML and one
 * copy of the interaction code, rather than 96 components' worth of props and
 * render logic.
 *
 * `compare` is optional: pass it where a comparison makes sense (a category
 * grid, a brand grid, the compare page's own suggestions) and leave it off
 * everywhere else — a "compare" checkbox on the homepage's featured rail would
 * offer to compare a drill against a pair of boots.
 */
export async function ProductCard({
  product,
  compare,
}: {
  product: ProductCardData;
  compare?: { selected: boolean; disabled: boolean };
}) {
  const locale = await getLocale();
  const t = await getTranslations("product.ProductCard");
  /*
   * Το σήμα προσφοράς.
   * ─────────────────────────────────────────────────────────────────────────
   * Ρωτάει η κάρτα, όχι η σελίδα. Δεκατέσσερις σελίδες δείχνουν κάρτες, και
   * καμία δεν θα θυμόταν να το περάσει — η υπάρχουσα `campaignsForProducts`
   * ήταν γραμμένη γι' αυτόν ακριβώς τον σκοπό και δεν την καλούσε κανείς.
   * Ο κατάλογος των ενεργών καμπανιών χτίζεται μία φορά ανά αίτημα.
   */
  const offer = await offerBadgeFor({ ...product, unitNet: product.priceNet }, locale);
  // Ένα ερώτημα ανά αίτημα για όλο το πλέγμα — βλ. `favouriteIds`.
  const favourite = (await favouriteIds()).has(product.id);
  /* Η τιμή που θα χρεωθεί — ο ίδιος υπολογισμός με το καλάθι, από την ίδια
     συνάρτηση, ώστε η διαφημιζόμενη και η χρεωμένη να μη γίνουν ποτέ δύο
     διαφορετικοί υπολογισμοί που απλώς συμφωνούν σήμερα. */
  const finalNet =
    product.priceNet == null
      ? null
      : discountedNet(product.priceNet, offer?.discountPercent ?? 0);
  const ctx = { vatRate: product.vatRate };
  const saving =
    product.priceListNet != null && product.priceNet != null
      ? savingsOf(product.priceListNet, product.priceNet, locale, ctx)
      : null;

  const stock = product.inStock
    ? product.qty > 5
      ? { label: upGreek(t("amesa_diathesimo")), className: "text-k-green" }
      : {
          label: `${upGreek(t("teleytaia"))} ${product.qty} ${upGreek(t("tem"))}`,
          className: "text-k-amber",
        }
    : { label: upGreek(t("katopin_paraggelias")), className: "text-k-text-4" };

  return (
    /*
     * `@container` — the card lays itself out from ITS OWN width, not the
     * viewport's.
     *
     * The same component renders at ~275px in the PDP's five-up related rail,
     * ~240px in a four-up PLP grid and ~400px in a two-up one. Deciding with
     * `lg:` meant all three got the wide layout, and in the two narrow cases
     * the price and the two buttons could not fit on one row — so they
     * overflowed the card's own border.
     */
    <CardHoverShell className="group @container flex flex-col border border-k-line bg-white transition-colors hover:border-k-ink">
      <div className="relative overflow-hidden bg-white p-3 @[300px]:p-5">
        {/*
          Στοιβάζονται, δεν διαλέγουν.
          ──────────────────────────────────────────────────────────────────
          Η έκπτωση τιμής και η καμπάνια είναι διαφορετικά πράγματα: η πρώτη
          λέει πόσο φθηνότερο είναι ΤΩΡΑ, η δεύτερη ότι το προϊόν ανήκει σε
          κάτι που τρέχει. Σπάνια συνυπάρχουν — το priceList δεν συμπληρώνεται
          — αλλά όταν συμβεί, η σιωπηλή απόκρυψη της μιας είναι το είδος του
          σφάλματος που κανείς δεν παρατηρεί.

          Το φόντο είναι το βαθύτερο κόκκινο: λευκό κείμενο 9.5px πάνω στο
          #EA3E39 δεν περνά AA.
        */}
        {(offer || saving) && (
          <div className="absolute top-2.5 left-2.5 z-20 flex flex-col items-start gap-1 lg:top-3.5 lg:left-3.5">
            {offer && (
              <span
                title={offer.title}
                className="t-badge bg-k-red-600 px-1.5 py-[3px] text-white uppercase lg:px-[7px] lg:py-1"
              >
                {offer.label}
              </span>
            )}
            {saving && (
              <span className="t-badge bg-k-ink px-1.5 py-[3px] text-white lg:px-[7px] lg:py-1">
                {formatPercent(saving.percent)}
              </span>
            )}
          </div>
        )}

        {/*
          Καρδιά και σύγκριση στην ίδια ευθεία, πάνω από τη φωτογραφία.
          ────────────────────────────────────────────────────────────────────
          Είναι οι δύο ενέργειες που ΔΕΝ αγοράζουν — «κράτα το» και «σύγκρινέ
          το» — και ανήκουν μαζί: μία γραμμή που το μάτι μαθαίνει, αντί για δύο
          κουμπιά σε αντίθετες γωνίες που ψάχνονται χωριστά.

          Αριστερά η καρδιά, όταν δεν υπάρχει σήμα έκπτωσης στη θέση της· με
          σήμα, κατεβαίνει από κάτω του ώστε δύο κόκκινα πράγματα να μη
          διαβάζονται ως ένα.
        */}
        <div
          className={cn(
            "absolute right-2.5 left-2.5 z-10 flex items-start justify-between gap-2 lg:right-3.5 lg:left-3.5",
            offer || saving ? "top-11 lg:top-[52px]" : "top-2.5 lg:top-3.5",
          )}
        >
          <FavouriteButton productId={product.id} initial={favourite} size="sm" />
          {compare ? (
            <CompareCheckbox
              slug={product.slug}
              selected={compare.selected}
              disabled={compare.disabled}
            />
          ) : (
            <span />
          )}
        </div>

        <Link href={`/proion/${product.slug}`} className="block">
          {product.image ? (
            <Image
              data-card-media
              src={product.image}
              alt={product.name}
              width={280}
              height={186}
              sizes="(max-width: 1024px) 45vw, 280px"
              className="mx-auto block h-[118px] w-full object-contain will-change-transform @[240px]:h-[160px] @[320px]:h-[186px]"
            />
          ) : (
            <span className="t-card-vat flex h-[118px] items-center justify-center bg-k-surface-3 text-k-text-5 @[240px]:h-[160px] @[320px]:h-[186px]">
              {upGreek(t("choris_eikona"))}
            </span>
          )}
        </Link>

        <QuickViewTrigger slug={product.slug} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-3 pb-3 @[300px]:gap-[9px] @[300px]:px-5 @[300px]:pb-5">
        {/*
          Το IMPA στη γραμμή της μάρκας, όχι πάνω στη φωτογραφία.
          ──────────────────────────────────────────────────────────────────
          Πάνω στη φωτογραφία κάθεται στο ίδιο το προϊόν και διαβάζεται σαν
          αυτοκόλλητο. Εδώ είναι δίπλα στον κωδικό — που είναι ακριβώς τι
          είναι — και δεν κρύβει τίποτα.
        */}
        <div className="flex items-center justify-between gap-2">
          <span className="t-card-brand truncate text-k-red">{product.brandName ?? "—"}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="t-card-sku hidden text-k-text-5 @[240px]:inline">{product.sku}</span>
            {product.impaCode && <ImpaBadge code={product.impaCode} />}
          </span>
        </div>

        <Link
          href={`/proion/${product.slug}`}
          className="t-card-name min-h-[46px] text-k-ink transition-colors hover:text-k-red @[300px]:min-h-[54px]"
        >
          {product.name}
        </Link>

        <div className={`t-card-stock hidden items-center gap-[7px] @[220px]:flex ${stock.className}`}>
          <span className="rounded-pill block h-1.5 w-1.5 bg-current" />
          {stock.label}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-1.5 @[340px]:flex-row @[340px]:items-end @[340px]:justify-between @[340px]:gap-2.5 @[340px]:pt-2.5">
          <div>
            {/*
              Η διαγραμμένη είναι η ΚΑΝΟΝΙΚΗ, η έντονη είναι αυτή που χρεώνεται.
              ────────────────────────────────────────────────────────────────
              Δύο διαφορετικά «πριν» μπορούν να εμφανιστούν εδώ: η τιμή
              καταλόγου (priceList, που δεν συμπληρώνεται) και η κανονική τιμή
              πριν την καμπάνια. Η δεύτερη προηγείται όταν υπάρχει, γιατί
              αντιστοιχεί σε πραγματική μείωση που χρεώνεται σήμερα.
            */}
            {product.priceNet != null && offer && offer.discountPercent > 0 ? (
              <div className="t-card-was text-k-text-5 line-through">
                {formatPrice(product.priceNet, locale, ctx)}
              </div>
            ) : (
              saving &&
              product.priceListNet != null && (
                <div className="t-card-was hidden text-k-text-5 line-through @[240px]:block">
                  {formatPrice(product.priceListNet, locale, ctx)}
                </div>
              )
            )}
            <div className="t-card-price whitespace-nowrap text-k-ink">
              {finalNet != null ? formatPrice(finalNet, locale, ctx) : "—"}
            </div>
            <div className="t-card-vat mt-0.5 text-k-text-5">
              {upGreek(t("me_fpa", { vatRate: product.vatRate }))}
            </div>
          </div>

          {/*
            Two actions, clearly ranked. Add-to-cart stays primary because most
            trade orders are several lines; buy-now is the shortcut for the
            customer who wants one thing and should not have to visit the cart
            to get it.
          */}
          <span className="flex min-w-0 flex-col gap-1.5 @[340px]:shrink-0">
            <AddToCartButton
              productId={product.id}
              className="t-card-cta h-10 w-full border-0 bg-k-ink px-2 text-white transition-colors hover:bg-k-red @[340px]:h-auto @[340px]:px-3.5 @[340px]:py-[11px]"
            />
            <BuyNowButton
              productId={product.id}
              disabled={product.priceNet == null}
              className="t-card-cta h-9 w-full border border-k-line-2 bg-white px-2 text-k-text-2 transition-colors hover:border-k-red hover:text-k-red @[340px]:h-auto @[340px]:px-3.5 @[340px]:py-[7px]"
            />
          </span>
        </div>
      </div>
    </CardHoverShell>
  );
}
