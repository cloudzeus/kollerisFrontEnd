import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listBanners, listTemplates } from "@/lib/banners/banners";
import { PageShell } from "@/components/admin/PageShell";
import { BannerList } from "@/components/admin/banners/BannerList";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function BannersPage() {
  const session = await auth();
  assertCan(session?.user.role, "content");

  const [banners, templates] = await Promise.all([listBanners(), listTemplates()]);

  return (
    <PageShell
      title="Banners"
      description="Ένα πλέγμα γεμάτο widgets, αποθηκευμένο σαν ένα πράγμα και τοποθετημένο όπου χρειάζεται."
      actions={
        <Button asChild variant="outline">
          <Link href="/admin/banners/templates">
            <LayoutTemplate className="size-3.5" />
            Πλέγματα
          </Link>
        </Button>
      }
    >
      <BannerList banners={banners} templates={templates} />
    </PageShell>
  );
}
