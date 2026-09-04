import "server-only";
import {
  offerBadgeFor,
  discountedNet,
  campaignDiscountPercent,
} from "@/lib/offers/badges";
import { campaignWhere } from "@/lib/offers/coverage";
import { prisma } from "@/lib/prisma";
import type { BannerContent, Binding } from "@/lib/banners/contract";
import type { ResolvedCell } from "@/lib/banners/resolve-tokens";
import type { Locale } from "@/i18n/routing";

export type { ResolvedCell };
export { applyTokens } from "@/lib/banners/resolve-tokens";

/**
 * Turning a cell's binding into the values its layers print.
 *
 * A bound cell stores a slug and nothing else; the composition refers to the
 * live data through `{token}`s. This is where those get their values — once, on
 * the server, in one query per source type rather than one per cell. A banner
 * with six product cells is one product query, not six.
 *
 * A binding that no longer resolves — a deleted product, an expired offer —
 * yields empty tokens, so its layers render blank rather than taking the page
 * down. A page that throws because somebody archived a product is a far worse
 * failure than a gap.
 */

// The locale decides the separators and where the € sits — "1.234,50 €" in
// Greek and Italian, "€1,234.50" in English.
const format = (value: number, locale: string): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(
    value,
  );

/** How long until a date, in words. Printed once at render — a banner is not a
 *  checkout timer, and a second hand costs a client component per cell. */
function endsIn(date: Date): string {
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "";
  const days = Math.floor(ms / 86_400_000);
  if (days > 0) return `${days} ${days === 1 ? "ημέρα" : "ημέρες"}`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `${hours} ${hours === 1 ? "ώρα" : "ώρες"}`;
}

export async function resolveCells(
  content: BannerContent,
  locale: Locale,
): Promise<Map<string, ResolvedCell>> {
  const entries = Object.entries(content.cells ?? {});
  const out = new Map<string, ResolvedCell>();
  if (entries.length === 0) return out;

  const slugsOf = (source: "product" | "offer") =>
    entries
      .map(([, c]) => c.binding)
      .filter(
        (b): b is Extract<Binding, { slug: string }> => b.source === source,
      )
      .map((b) => b.slug)
      .filter(Boolean);

  const productSlugs = slugsOf("product");
  const offerSlugs = slugsOf("offer");

  // A set's products join the same query as the single-product cells: ten
  // products in one cell and one in another are eleven rows, not two queries.
  const setSlugs = entries
    .map(([, c]) => c.binding)
    .filter(
      (b): b is Extract<Binding, { slugs: string[] }> =>
        b.source === "products",
    )
    .flatMap((b) => b.slugs);

  const allProductSlugs = [...new Set([...productSlugs, ...setSlugs])];

  const [products, offers] = await Promise.all([
    allProductSlugs.length
      ? prisma.product.findMany({
          where: { slug: { in: allProductSlugs } },
          select: {
            slug: true,
            name: true,
            code: true,
            mtrmark: true,
            priceNet: true,
            priceList: true,
            vatRate: true,
            translations: {
              where: { locale },
              select: { name: true, shortDescription: true },
              take: 1,
            },
            images: {
              orderBy: [{ isFeature: "desc" }, { order: "asc" }],
              select: { url: true },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
    offerSlugs.length
      ? prisma.offer.findMany({ where: { slug: { in: offerSlugs } } })
      : Promise.resolve([]),
  ]);

  // Brands join on mtrmark rather than by relation — one extra query over the
  // marks actually present, matching how the product picker does it.
  const marks = [
    ...new Set(
      products.map((p) => p.mtrmark).filter((m): m is number => m != null),
    ),
  ];
  const brands = marks.length
    ? await prisma.brand.findMany({
        where: { mtrmark: { in: marks } },
        select: {
          mtrmark: true,
          slug: true,
          logo: true,
          nameEl: true,
          nameEn: true,
          nameIt: true,
        },
      })
    : [];
  const brandByMark = new Map(
    brands.map((b) => [
      b.mtrmark,
      (locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl) ||
        b.nameEl,
    ]),
  );
  /* Η καμπάνια μπορεί να στοχεύει μάρκα, οπότε χρειάζεται το slug της. */
  const brandSlugByMark = new Map(brands.map((b) => [b.mtrmark, b.slug]));
  /*
   * Το λογότυπο του κατασκευαστή.
   * ───────────────────────────────────────────────────────────────────────────
   * Στα επαγγελματικά εργαλεία η μάρκα ΕΙΝΑΙ το επιχείρημα: κανείς δεν αγοράζει
   * «γωνιακό τροχό», αγοράζει Milwaukee. Το `{brand}` έδινε μόνο το όνομα ως
   * κείμενο, και ένα banner που γράφει «MILWAUKEE» σε mono δεν έχει καμία σχέση
   * με το να δείχνει το σήμα που αναγνωρίζει ο πελάτης από δέκα μέτρα.
   */
  const brandLogoByMark = new Map(
    brands.filter((b) => b.logo).map((b) => [b.mtrmark, b.logo as string]),
  );

  /*
   * Η μάρκα μιας ΠΡΟΣΦΟΡΑΣ.
   * ───────────────────────────────────────────────────────────────────────────
   * Οι προσφορές δεν έλυναν καθόλου `{brand}` — μόνο τα προϊόντα — οπότε μια
   * παραλλαγή με υπέρτιτλο «{brand}» πάνω σε κελί προσφοράς τύπωνε κυριολεκτικά
   * «{brand}» στο κατάστημα. Και η μάρκα ΥΠΑΡΧΕΙ: είτε η καμπάνια στοχεύει
   * μάρκα, είτε έχει ένα μόνο προϊόν που έχει τη δική του.
   *
   * Δεύτερο ερώτημα και όχι επέκταση του πρώτου: τα slugs των προϊόντων μιας
   * καμπάνιας τα ξέρουμε μόνο ΑΦΟΥ φορτωθούν οι προσφορές. Τρέχει μόνο όταν
   * υπάρχει κελί προσφοράς, δηλαδή σχεδόν ποτέ σε σελίδα χωρίς banner.
   */
  const offerBrandSlugs = [
    ...new Set(offers.map((o) => o.brandSlug).filter((v): v is string => !!v)),
  ];
  const loneOfferProductSlugs = [
    ...new Set(
      offers
        .filter((o) => !o.brandSlug && o.scope === "products" && o.productSlugs.length === 1)
        .map((o) => o.productSlugs[0]),
    ),
  ];

  const [offerBrands, loneOfferProducts] = await Promise.all([
    offerBrandSlugs.length
      ? prisma.brand.findMany({
          where: { slug: { in: offerBrandSlugs } },
          select: { slug: true, logo: true, nameEl: true, nameEn: true, nameIt: true },
        })
      : Promise.resolve([]),
    loneOfferProductSlugs.length
      ? prisma.product.findMany({
          where: { slug: { in: loneOfferProductSlugs } },
          select: { slug: true, mtrmark: true },
        })
      : Promise.resolve([]),
  ]);

  const loneMarks = [
    ...new Set(loneOfferProducts.map((p) => p.mtrmark).filter((m): m is number => m != null)),
  ];
  const loneBrands = loneMarks.length
    ? await prisma.brand.findMany({
        where: { mtrmark: { in: loneMarks } },
        select: { mtrmark: true, logo: true, nameEl: true, nameEn: true, nameIt: true },
      })
    : [];

  const offerBrandBySlug = new Map(offerBrands.map((b) => [b.slug, b]));
  const loneMarkBySlug = new Map(loneOfferProducts.map((p) => [p.slug, p.mtrmark]));
  const loneBrandByMark = new Map(loneBrands.map((b) => [b.mtrmark, b]));

  const productBySlug = new Map(products.map((p) => [p.slug, p]));
  const offerBySlug = new Map(offers.map((o) => [o.slug, o]));

  for (const [cellId, cell] of entries) {
    const binding = cell.binding;

    if (binding.source === "product") {
      const p = productBySlug.get(binding.slug);
      if (!p) {
        out.set(cellId, { tokens: {}, href: cell.href, image: "" });
        continue;
      }

      const vat = 1 + Number(p.vatRate ?? 24) / 100;
      const net = p.priceNet == null ? null : Number(p.priceNet);
      const list = p.priceList == null ? null : Number(p.priceList);

      /*
       * Η τιμή έρχεται από την προσφορά, όχι από τον κατάλογο.
       * ───────────────────────────────────────────────────────────────────────
       * Ένα banner που διαφημίζει προϊόν σε καμπάνια και δείχνει την τιμή
       * καταλόγου διαφημίζει λάθος τιμή — και μάλιστα υψηλότερη από αυτήν που
       * θα πληρώσει ο πελάτης, δηλαδή διώχνει αγορές που θα γίνονταν.
       *
       * Ίδιος μηχανισμός με τη λίστα και τη σελίδα προϊόντος: `offerBadgeFor`
       * πάνω στις ζωντανές καμπάνιες. Όταν υπάρχει έκπτωση, το `{compare}`
       * γίνεται η τιμή ΠΡΙΝ — η διαγραμμένη που απαιτεί και η Omnibus.
       */
      const brandSlug =
        p.mtrmark != null ? (brandSlugByMark.get(p.mtrmark) ?? null) : null;
      const badge =
        net == null
          ? null
          : await offerBadgeFor(
              { slug: p.slug, brandSlug, unitNet: net },
              locale,
            );
      const offerPct = badge?.discountPercent ?? 0;
      const sellNet =
        net == null ? null : offerPct > 0 ? discountedNet(net, offerPct) : net;

      out.set(cellId, {
        tokens: {
          "{title}": p.translations[0]?.name ?? p.name,
          "{brand}":
            p.mtrmark != null ? (brandByMark.get(p.mtrmark) ?? "") : "",
          "{code}": p.code,
          "{price}": sellNet == null ? "" : format(sellNet * vat, locale),
          // Η τιμή πριν: της καμπάνιας όπου υπάρχει, αλλιώς η τιμή καταλόγου —
          // και μόνο όταν είναι όντως ψηλότερα, γιατί ίση τιμή σύγκρισης είναι
          // έκπτωση που δεν υπάρχει.
          "{compare}":
            offerPct > 0 && net != null
              ? format(net * vat, locale)
              : list != null && net != null && list > net
                ? format(list * vat, locale)
                : "",
          "{desc}": p.translations[0]?.shortDescription ?? "",
          "{image}": p.images[0]?.url ?? "",
          "{brandLogo}":
            p.mtrmark != null ? (brandLogoByMark.get(p.mtrmark) ?? "") : "",
        },
        // Derived, never typed. The canonical product URL is the only correct
        // destination for a product tile.
        href: `/proion/${p.slug}`,
        image: p.images[0]?.url ?? "",
      });
      continue;
    }

    if (binding.source === "products") {
      const money = (p: (typeof products)[number]) => {
        const net = p.priceNet == null ? null : Number(p.priceNet);
        if (net == null) return "";
        return format(net * (1 + Number(p.vatRate ?? 24) / 100), locale);
      };

      // Kept in the order they were chosen — the rotation is a running order,
      // and re-sorting it would quietly override a decision somebody made.
      const items = binding.slugs
        .map((slug) => productBySlug.get(slug))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          slug: p.slug,
          name: p.translations[0]?.name ?? p.name,
          image: p.images[0]?.url ?? "",
          price: money(p),
        }));

      out.set(cellId, {
        tokens: {
          "{count}": String(items.length),
          "{image}": items[0]?.image ?? "",
        },
        href: cell.href,
        image: items[0]?.image ?? "",
        items,
      });
      continue;
    }

    if (binding.source === "offer") {
      const o = offerBySlug.get(binding.slug);
      if (!o || !o.isActive) {
        out.set(cellId, { tokens: {}, href: cell.href, image: "" });
        continue;
      }

      /*
       * Η τιμή μιας ΚΑΜΠΑΝΙΑΣ.
       * ───────────────────────────────────────────────────────────────────────
       * Μια προσφορά δεν είναι ένα προϊόν — είναι μια μάρκα, μια κατηγορία ή
       * μια λίστα. Δεν έχει «τιμή»· έχει σημείο εκκίνησης. Το `{price}` λύνει
       * στη ΦΘΗΝΟΤΕΡΗ τιμή της καμπάνιας ΜΕΤΑ την έκπτωση, και το `{compare}`
       * στην ίδια τιμή πριν — ό,τι ακριβώς δείχνει και η σελίδα προσφορών.
       *
       * Μέχρι τώρα το `{price}` δεν υπήρχε καθόλου στις προσφορές: ένα κελί που
       * το είχε τύπωνε κυριολεκτικά «{price}» στον καμβά και στο site.
       */
      const where = await campaignWhere({
        scope: o.scope,
        productSlugs: o.productSlugs,
        brandSlug: o.brandSlug,
        categorySlug: o.categorySlug,
      } as never);
      let offerPrice = "";
      let offerCompare = "";
      if (where) {
        const cheapest = await prisma.product.findFirst({
          where: { ...where, priceNet: { gt: 0 } },
          orderBy: { priceNet: "asc" },
          select: { priceNet: true, vatRate: true },
        });
        if (cheapest?.priceNet != null) {
          const base = Number(cheapest.priceNet);
          const rate = 1 + Number(cheapest.vatRate ?? 24) / 100;
          const pct = campaignDiscountPercent(
            o.discount,
            o.discountValue == null ? null : Number(o.discountValue),
            base,
          );
          offerPrice = format(discountedNet(base, pct) * rate, locale);
          if (pct > 0) offerCompare = format(base * rate, locale);
        }
      }

      out.set(cellId, {
        tokens: {
          "{price}": offerPrice,
          "{compare}": offerCompare,
          "{title}":
            (locale === "en"
              ? o.titleEn
              : locale === "it"
                ? o.titleIt
                : o.titleEl) || o.titleEl,
          "{desc}":
            (locale === "en"
              ? o.descriptionEn
              : locale === "it"
                ? o.descriptionIt
                : o.descriptionEl) || o.descriptionEl,
          /*
           * Η μάρκα και το σήμα της, όπου υπάρχουν: πρώτα η μάρκα-στόχος της
           * καμπάνιας, αλλιώς η μάρκα του μοναδικού προϊόντος της.
           */
          ...(() => {
            const mark =
              !o.brandSlug && o.scope === "products" && o.productSlugs.length === 1
                ? loneMarkBySlug.get(o.productSlugs[0])
                : null;
            const brand = o.brandSlug
              ? offerBrandBySlug.get(o.brandSlug)
              : mark != null
                ? loneBrandByMark.get(mark)
                : undefined;
            if (!brand) return { "{brand}": "", "{brandLogo}": "" };
            const name =
              (locale === "en" ? brand.nameEn : locale === "it" ? brand.nameIt : brand.nameEl) ||
              brand.nameEl;
            return { "{brand}": name, "{brandLogo}": brand.logo ?? "" };
          })(),
          "{badge}": o.badge ?? "",
          "{ends}": o.endsAt ? endsIn(o.endsAt) : "",
          "{image}": o.image ?? "",
          "{imageWide}": o.imageWide || o.image || "",
        },
        /*
         * Μια καμπάνια ενός προϊόντος πάει στο προϊόν.
         * ───────────────────────────────────────────────────────────────────
         * Οι προσφορές κρατούν δικό τους `href` γιατί οι περισσότερες είναι
         * μάρκα ή κατηγορία — εκεί η σωστή σελίδα είναι μια λίστα. Όταν όμως
         * η καμπάνια έχει ΕΝΑ προϊόν, η λίστα είναι ένα ενδιάμεσο βήμα που
         * ζητά από τον πελάτη να ξαναβρεί το προϊόν που μόλις του δείξαμε.
         * Το banner της Milwaukee έστελνε στο `/katalogos?brand=milwaukee`
         * ενώ αφορούσε έναν και μόνο γωνιακό τροχό.
         *
         * Παράγεται, δεν πληκτρολογείται: ένα γραμμένο `href` παγώνει, και το
         * προϊόν που αλλάζει slug αφήνει πίσω του banner που δείχνει σε 404.
         */
        href:
          o.scope === "products" && o.productSlugs.length === 1
            ? `/proion/${o.productSlugs[0]}`
            : o.href,
        image: o.imageWide || o.image || "",
      });
      continue;
    }

    out.set(cellId, { tokens: {}, href: cell.href, image: "" });
  }

  return out;
}
