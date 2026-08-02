import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { PageShell } from "@/components/admin/PageShell";
import { OfferWizard } from "@/components/admin/offers/OfferWizard";

export const dynamic = "force-dynamic";

export default async function NewOfferPage() {
  const session = await auth();
  assertCan(session?.user.role, "merchandising");

  return (
    <PageShell title="Νέα προσφορά" description="Τέσσερα βήματα. Τίποτα δεν αποθηκεύεται πριν το τέλος.">
      <OfferWizard initial={null} />
    </PageShell>
  );
}
