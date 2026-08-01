import Link from "next/link";
import Image from "next/image";
import { Search } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { getPimProduct } from "@/lib/pim/pim";
import { searchProductsForPicker } from "@/lib/media/picker";
import { routing, type Locale } from "@/i18n/routing";
import { PageShell } from "@/components/admin/PageShell";
import { ProductEditor } from "@/components/admin/ProductEditor";

export const dynamic = "force-dynamic";

/**
 * Admin screen — the catalogue.
 *
 * Search then edit, rather than a browsable list of 5,305 products. Nobody
 * opens this screen to see what exists; they open it because one product's
 * photos are in the wrong order.
 *
 * Both the query and the selected product live in the URL, so a product's edit
 * page is a link somebody can send.
 */
export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; slug?: string; locale?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "catalogue");

  const params = await searchParams;
  const query = params.q ?? "";
  const locale = (routing.locales.includes(params.locale as Locale)
    ? params.locale
    : routing.defaultLocale) as Locale;

  const [results, product] = await Promise.all([
    query.trim().length >= 2 ? searchProductsForPicker(query, locale, 20) : Promise.resolve([]),
    params.slug ? getPimProduct(params.slug, locale) : Promise.resolve(null),
  ]);

  return (
    <PageShell
      title="Κατάλογος"
      description={
        product
          ? `${product.name} · ${product.code}`
          : "Βρείτε ένα προϊόν για να διορθώσετε φωτογραφίες και χαρακτηριστικά."
      }
    >
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <form action="/admin/catalogue" className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-k-text-4" />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Όνομα, κωδικός, barcode…"
              aria-label="Αναζήτηση προϊόντων"
              className="h-9 w-full border border-k-line-2 bg-white pl-8 pr-3 text-[12.5px] outline-none focus:border-k-ink"
            />
          </form>

          {query.trim().length >= 2 && (
            <div className="border border-k-line bg-white">
              {results.length === 0 ? (
                <p className="px-3 py-8 text-center text-[12px] text-k-text-3">
                  Κανένα προϊόν για «{query}».
                </p>
              ) : (
                <ul className="divide-y divide-k-line">
                  {results.map((r) => {
                    const active = r.slug === params.slug;
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/admin/catalogue?q=${encodeURIComponent(query)}&slug=${r.slug}`}
                          className={`flex items-center gap-2.5 px-3 py-2 transition-colors ${
                            active ? "bg-k-surface-2" : "hover:bg-k-surface-2"
                          }`}
                        >
                          <span className="relative size-9 shrink-0 border border-k-line bg-white">
                            {r.images[0] && (
                              <Image
                                src={r.images[0].url}
                                alt=""
                                fill
                                sizes="36px"
                                className="object-contain p-0.5"
                                unoptimized
                              />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] text-k-ink">{r.name}</span>
                            <span className="numeral block text-[10.5px] text-k-text-4">
                              {r.code} · {r.images.length} φωτ.
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div>
          {product ? (
            <ProductEditor product={product} locale={locale} />
          ) : (
            <div className="grid place-items-center gap-2 border border-dashed border-k-line-2 bg-white px-6 py-20 text-center">
              <Search className="size-5 text-k-text-5" />
              <p className="text-[13px] text-k-text-2">Αναζητήστε ένα προϊόν.</p>
              <p className="max-w-[46ch] text-[11.5px] leading-[1.55] text-k-text-4">
                Μπορείτε να αλλάξετε τη σειρά των φωτογραφιών, να ορίσετε την κύρια, και να
                διορθώσετε χαρακτηριστικά. Οι αλλαγές γράφονται στο HDCtool και ισχύουν σε όλα τα
                κανάλια.
              </p>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
