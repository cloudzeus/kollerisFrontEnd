import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { getOffer } from "@/lib/offers/offers";
import { toDraft } from "@/lib/offers/offer-draft";
import { PageShell } from "@/components/admin/PageShell";
import { OfferWizard } from "@/components/admin/offers/OfferWizard";

export const dynamic = "force-dynamic";

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  assertCan(session?.user.role, "merchandising");

  const { id } = await params;
  const offer = await getOffer(id);
  if (!offer) notFound();

  return (
    <PageShell title={offer.titleEl} description="Επεξεργασία καμπάνιας.">
      <OfferWizard initial={toDraft(offer)} />
    </PageShell>
  );
}
