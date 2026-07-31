import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { getZoneForAdmin } from "@/lib/zones/zones";
import { ZONES, ZONES_BY_ID } from "@/lib/zones/registry";
import { PageShell } from "@/components/admin/PageShell";
import { ZoneManager } from "@/components/admin/ZoneManager";
import { ZonePreview } from "@/components/admin/ZonePreview";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * The page builder.
 *
 * Zones down the left, their contents in the middle, a live preview on the
 * right. The preview is the reason this is one screen rather than three: what
 * marketing is actually deciding is how something looks, and a builder that
 * makes you open the storefront in another tab to find out is a form with extra
 * steps.
 */
export default async function ZonesPage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "content");

  const { zone: requested } = await searchParams;
  const zone = (requested && ZONES_BY_ID.get(requested)) || ZONES[0];
  const widgets = await getZoneForAdmin(zone.id);

  const pages = [...new Set(ZONES.map((z) => z.page))];

  return (
    <PageShell
      title="Σελίδες"
      description="Ζώνες και widgets. Σύρετε για σειρά, κάντε κλικ για επεξεργασία."
    >
      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_22rem]">
        {/* ── Ζώνες ── */}
        <nav className="border border-k-line bg-white" aria-label="Ζώνες">
          {pages.map((page) => (
            <div key={page} className="border-b border-k-line last:border-0">
              <p className="px-3 pb-1 pt-2.5 text-[10px] font-medium uppercase tracking-[0.09em] text-k-text-4">
                {page}
              </p>
              {ZONES.filter((z) => z.page === page).map((z) => (
                <Link
                  key={z.id}
                  href={`/admin/zones?zone=${encodeURIComponent(z.id)}`}
                  className={cn(
                    "block border-l-2 px-3 py-2 text-[12.5px] transition-colors",
                    z.id === zone.id
                      ? "border-l-k-red bg-k-surface-2 font-medium text-k-ink"
                      : "border-l-transparent text-k-text-2 hover:bg-k-surface-2 hover:text-k-ink",
                  )}
                >
                  {z.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* ── Widgets ── */}
        <section>
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold tracking-tight text-k-ink">{zone.label}</h2>
            <p className="mt-0.5 text-[12px] leading-[1.5] text-k-text-3">{zone.description}</p>
          </div>
          <ZoneManager zone={zone} widgets={widgets} />
        </section>

        {/* ── Preview ── */}
        <aside className="hidden xl:block">
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-k-text-4">
            Προεπισκόπηση
          </p>
          <ZonePreview zone={zone} widgets={widgets} />
        </aside>
      </div>
    </PageShell>
  );
}
