import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listOffers } from "@/lib/banners/banners";
import { PageShell } from "@/components/admin/PageShell";
import { OfferManager } from "@/components/admin/banners/OfferManager";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const session = await auth();
  assertCan(session?.user.role, "merchandising");

  const offers = await listOffers();

  return (
    <PageShell
      title="Προσφορές"
      description="Καμπάνιες που συνδέονται σε banners. Γράφονται μία φορά εδώ και εμφανίζονται όπου τις τοποθετήσετε."
    >
      <OfferManager offers={offers} />
    </PageShell>
  );
}
