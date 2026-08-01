import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { getTemplate } from "@/lib/banners/banners";
import { actionSaveTemplate } from "@/app/admin/(protected)/banners/actions";
import { PageShell } from "@/components/admin/PageShell";
import { GridBuilder } from "@/components/admin/banners/GridBuilder";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

/** `new` draws a template that does not exist yet; anything else edits one. */
export default async function TemplateBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "content");

  const { id } = await params;
  const template = id === "new" ? null : await getTemplate(id);
  if (id !== "new" && !template) notFound();

  return (
    <PageShell
      title={template ? template.name : "Νέο πλέγμα"}
      description="Σύρετε πάνω στα κενά τετράγωνα για να σχεδιάσετε ένα κελί."
      actions={
        <Button asChild variant="outline">
          <Link href="/admin/banners/templates">
            <ChevronLeft className="size-3.5" />
            Πλέγματα
          </Link>
        </Button>
      }
    >
      <GridBuilder template={template} onSave={actionSaveTemplate} />
    </PageShell>
  );
}
