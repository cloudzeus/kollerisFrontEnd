import Link from "next/link";
import { Plus } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listTemplates, templateUsage } from "@/lib/banners/banners";
import { PageShell } from "@/components/admin/PageShell";
import { TemplateList } from "@/components/admin/banners/TemplateList";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const session = await auth();
  assertCan(session?.user.role, "content");

  const [templates, usage] = await Promise.all([listTemplates(), templateUsage()]);

  return (
    <PageShell
      title="Πλέγματα"
      description="Ο σκελετός ενός banner: πώς χωρίζεται ο χώρος σε κελιά. Σχεδιάζεται μία φορά και το χρησιμοποιούν όσα banners θέλετε."
      actions={
        <Button asChild>
          <Link href="/admin/banners/templates/new">
            <Plus className="size-3.5" />
            Νέο πλέγμα
          </Link>
        </Button>
      }
    >
      <TemplateList templates={templates} usage={Object.fromEntries(usage)} />
    </PageShell>
  );
}
