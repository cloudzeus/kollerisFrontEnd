import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listOffers } from "@/lib/offers/offers";
import { PageShell } from "@/components/admin/PageShell";
import { OfferList } from "@/components/admin/offers/OfferList";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function OffersPage() {
  const session = await auth();
  assertCan(session?.user.role, "merchandising");

  return (
    <PageShell
      title="Προσφορές"
      description="Καμπάνιες: τι λένε, σε τι εφαρμόζονται, πόσο κρατούν. Συνδέονται σε banners από το εύρος τους."
      actions={
        <Button asChild>
          <Link href="/admin/offers/new">
            <Plus className="size-3.5" />
            Νέα προσφορά
          </Link>
        </Button>
      }
    >
      <OfferList offers={await listOffers()} />
    </PageShell>
  );
}
