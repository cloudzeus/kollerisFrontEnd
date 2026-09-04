import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { PageShell } from "@/components/admin/PageShell";
import { CampaignWizard } from "@/components/admin/newsletter/CampaignWizard";
import { campaignTemplates } from "@/lib/newsletter/campaign";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const session = await auth();
  assertCan(session?.user.role, "engagement");

  const [confirmedCount] = await Promise.all([
    prisma.newsletterSubscriber.count({ where: { status: "confirmed" } }),
  ]);

  return (
    <PageShell
      title="Νέα καμπάνια"
      description="Τέσσερα βήματα. Η προεπισκόπηση δεξιά είναι ακριβώς αυτό που θα σταλεί."
    >
      <CampaignWizard templates={campaignTemplates()} confirmedCount={confirmedCount} />
    </PageShell>
  );
}
