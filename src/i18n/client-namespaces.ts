/**
 * The message namespaces client components read.
 *
 * Everything else renders on the server and never needs to reach the browser;
 * sending the whole catalogue cost about 70 KB on every page. A test walks the
 * client import graph and fails when a namespace is missing here.
 */
export const CLIENT_NAMESPACES: readonly string[] = [
  "account.AuthForms",
  "account.CompanyVatFields",
  "account.MemberAdmin",
  "aitima.page",
  "brands.BrandSearchGrid",
  "cart.AddToCartButton",
  "cart.BuyNowButton",
  "cart.CartActionsRow",
  "cart.CartCrossSell",
  "cart.CartLineRow",
  "cart.CartSummaryPanel",
  "cart.MiniCart",
  "cart.QuickOrderPaste",
  "catalogue.CategoryPicker",
  "catalogue.TaxonomyFinder",
  "checkout.AddressAutocomplete",
  "checkout.CheckoutForm",
  "checkout.SplitCheckout",
  "chrome.HeaderShell",
  "chrome.MegaMenu",
  "chrome.MobileMenu",
  "chrome.SearchSuggest",
  "contact.ContactForm",
  "dieuthynseis.page",
  "faq.FaqAccordion",
  "home.NewsletterBand",
  "home.QuickOrder",
  "offers.OfferCountdown",
  "offers.OfferWidget",
  "orders.OrderTracker",
  "pdp.PriceBox",
  "pdp.ProductGallery",
  "pdp.ProductTabs",
  "plp.FilterSidebar",
  "plp.MobileFilterSheet",
  "product.CompareCheckbox",
  "product.ProductRail",
  "product.QuickViewProvider",
  "product.QuickViewTrigger",
  "ui.Expandable",
];

type Messages = Record<string, unknown>;

export function pickClientMessages(messages: Messages): Messages {
  const picked: Messages = {};
  for (const namespace of CLIENT_NAMESPACES) {
    const parts = namespace.split(".");
    const leaf = parts.pop()!;
    const parent = parts.reduce<unknown>((node, part) => (node as Messages | undefined)?.[part], messages) as
      | Messages
      | undefined;
    if (parent?.[leaf] === undefined) continue;
    let target = picked;
    for (const part of parts) target = (target[part] ??= {}) as Messages;
    target[leaf] = parent[leaf];
  }
  return picked;
}
