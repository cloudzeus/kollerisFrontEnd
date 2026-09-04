import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AccountChrome } from "@/components/account/AccountChrome";
import { AccountShell } from "@/components/account/AccountShell";
import { ProductCard } from "@/components/product/ProductCard";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireCustomer } from "@/lib/account/guard";
import { prisma } from "@/lib/prisma";
import { upGreek } from "@/lib/greek";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Αγαπημένα", robots: { index: false, follow: false } };
}

/**
 * Αποθηκευμένα προϊόντα.
 *
 * Η ίδια `ProductCard` με τον κατάλογο, όχι δική της λίστα. Ο πελάτης έρχεται
 * εδώ για να αγοράσει, και θέλει ό,τι ακριβώς είχε όταν αποθήκευσε: τιμή,
 * απόθεμα, «Στο καλάθι», «Αγορά τώρα». Μια στριμωγμένη σειρά με όνομα και ένα
 * κουμπί θα τον ανάγκαζε να ανοίξει το προϊόν για να δει αν αξίζει ακόμη.
 *
 * Και οι τιμές είναι ΖΩΝΤΑΝΕΣ, όχι όπως τη μέρα της αποθήκευσης: το αγαπημένο
 * κρατά ποιο προϊόν, όχι πόσο έκανε.
 */
export default async function FavouritesPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await getTranslations("logariasmos.page");
  const { user } = await requireCustomer(locale, "/logariasmos/agapimena");

  const rows = await prisma.favourite.findMany({
    where: { customerId: user.id, product: { isActive: true } },
    orderBy: { createdAt: "desc" },
    select: {
      product: {
        select: {
          id: true, mtrl: true, slug: true, name: true, code: true, code2: true,
          mtrmark: true, mtrcategory: true, priceNet: true, priceList: true,
          vatRate: true, qty: true, inStock: true, variantGroup: true,
          images: { where: { isFeature: true }, take: 1, select: { url: true } },
          translations: { select: { locale: true, name: true } },
          sizes: { select: { label: true }, orderBy: { order: "asc" }, take: 1 },
        },
      },
    },
  });

  const brandRows = await prisma.brand.findMany({
    where: { mtrmark: { in: rows.map((r) => r.product.mtrmark).filter((m): m is number => m != null) } },
    select: { mtrmark: true, slug: true, nameEl: true, nameEn: true, nameIt: true },
  });
  const brands = new Map(
    brandRows.map((b) => [
      b.mtrmark!,
      { slug: b.slug, name: locale === "en" ? b.nameEn : locale === "it" ? b.nameIt : b.nameEl },
    ]),
  );

  const products = rows.map(({ product: p }) => {
    const brand = p.mtrmark != null ? brands.get(p.mtrmark) : undefined;
    const translated = p.translations.find((t) => t.locale === locale)?.name;
    return {
      id: p.id,
      mtrl: p.mtrl,
      slug: p.slug,
      name: translated?.trim() || p.name,
      sku: p.code || p.code2,
      brandName: brand?.name ?? null,
      brandSlug: brand?.slug ?? null,
      image: p.images[0]?.url ?? null,
      priceNet: p.priceNet == null ? null : Number(p.priceNet),
      priceListNet: p.priceList == null ? null : Number(p.priceList),
      vatRate: p.vatRate == null ? 24 : Number(p.vatRate),
      qty: p.qty == null ? 0 : Number(p.qty),
      inStock: p.inStock,
    };
  });

  return (
    <AccountChrome locale={locale}>
      <AccountShell
        user={user}
        active="/logariasmos/agapimena"
        title="Αγαπημένα"
        lead="Προϊόντα που κρατήσατε για αργότερα. Οι τιμές και η διαθεσιμότητα είναι σημερινές."
      >
        {products.length === 0 ? (
          /* Άδεια οθόνη με έξοδο, όχι με λύπηση: ο πελάτης δεν έκανε λάθος που
             δεν έχει αποθηκεύσει τίποτα ακόμη. */
          <div className="border border-k-line bg-white px-6 py-12 text-center">
            <p className="text-[14px] text-k-ink">Δεν έχετε αποθηκεύσει προϊόντα.</p>
            <p className="mt-1.5 text-[12.5px] leading-[1.6] text-k-text-3">
              Πατήστε την καρδιά σε οποιοδήποτε προϊόν για να το κρατήσετε εδώ.
            </p>
            <Link
              href="/katalogos"
              className="font-display mt-5 inline-block bg-k-ink-deep px-7 py-3 text-[13px] font-bold tracking-[0.08em] text-white transition-colors hover:bg-k-ink"
            >
              {upGreek("Δείτε τον κατάλογο")}
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-3 text-[12px] text-k-text-3">
              <span className="numeral">{products.length}</span>{" "}
              {products.length === 1 ? "προϊόν" : "προϊόντα"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </>
        )}
      </AccountShell>
    </AccountChrome>
  );
}
