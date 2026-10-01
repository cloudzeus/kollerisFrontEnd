import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * What a filtered listing renders when the render gate is full.
 *
 * Deliberately empty of data: no chrome, no menus, no products — nothing that
 * reads the database. The page is already `noindex` (every filtered view is),
 * refreshes itself after a few seconds for the person who is actually waiting,
 * and offers the unfiltered listing, which never queues.
 */
export async function ListingBusy({ basePath }: { basePath: string }) {
  const t = await getTranslations("plp.ListingBusy");
  return (
    <main id="main" className="shell-x py-20 text-center">
      <meta httpEquiv="refresh" content="5" />
      <h1 className="font-display t-display text-xl text-k-ink">{t("titlos")}</h1>
      <p className="mx-auto mt-3 max-w-md text-[13px] text-k-text-3">{t("minima")}</p>
      <Link
        href={basePath}
        prefetch={false}
        className="t-btn-sm mt-6 inline-block border-[1.5px] border-k-ink px-7 py-3 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
      >
        {t("choris_filtra")}
      </Link>
    </main>
  );
}
