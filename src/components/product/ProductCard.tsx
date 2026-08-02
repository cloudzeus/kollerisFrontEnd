import { useTranslations } from "next-intl";
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
export function ProductCard({
  product,
  compare,
}: {
  product: ProductCardData;
  compare?: { selected: boolean; disabled: boolean };
}) {
  const t = useTranslations("product.ProductCard");
  const ctx = { vatRate: product.vatRate };
  const saving =
    product.priceListNet != null && product.priceNet != null
      ? savingsOf(product.priceListNet, product.priceNet, ctx)
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
        {saving && (
          <span className="t-badge absolute top-2.5 left-2.5 z-10 bg-k-red px-1.5 py-[3px] text-white lg:top-3.5 lg:left-3.5 lg:px-[7px] lg:py-1">
            {formatPercent(saving.percent)}
          </span>
        )}

        {compare && (
          <div className="absolute top-2.5 right-2.5 z-10 lg:top-3.5 lg:right-3.5">
            <CompareCheckbox
              slug={product.slug}
              selected={compare.selected}
              disabled={compare.disabled}
            />
          </div>
        )}

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
        <div className="flex items-baseline justify-between">
          <span className="t-card-brand text-k-red">{product.brandName ?? "—"}</span>
          <span className="t-card-sku hidden text-k-text-5 @[240px]:inline">{product.sku}</span>
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
            {saving && product.priceListNet != null && (
              <div className="t-card-was hidden text-k-text-5 line-through @[240px]:block">
                {formatPrice(product.priceListNet, ctx)}
              </div>
            )}
            <div className="t-card-price whitespace-nowrap text-k-ink">
              {product.priceNet != null ? formatPrice(product.priceNet, ctx) : "—"}
            </div>
            <div className="t-card-vat mt-0.5 text-k-text-5">
              {upGreek(`με ΦΠΑ ${product.vatRate}%`)}
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
