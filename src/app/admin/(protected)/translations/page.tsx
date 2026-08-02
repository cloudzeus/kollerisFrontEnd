import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { coverage } from "@/lib/i18n/coverage";
import { PageShell } from "@/components/admin/PageShell";
import { TranslationBoard } from "@/components/admin/TranslationBoard";

export const dynamic = "force-dynamic";

export default async function TranslationsPage() {
  const session = await auth();
  assertCan(session?.user.role, "content");

  return (
    <PageShell
      title="Μεταφράσεις"
      description="Τι αλλάζει πραγματικά όταν ο επισκέπτης αλλάζει γλώσσα — και τι όχι."
    >
      <TranslationBoard sources={await coverage()} />
    </PageShell>
  );
}
