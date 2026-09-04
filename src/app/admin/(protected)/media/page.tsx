import { PageShell } from "@/components/admin/PageShell";
import { MediaLibrary } from "@/components/admin/media/MediaLibrary";
import { listAssets } from "@/lib/media/library";

/**
 * Η βιβλιοθήκη αρχείων.
 *
 * Η πρώτη σελίδα φορτώνεται στον διακομιστή, οπότε τα πλακίδια υπάρχουν στην
 * πρώτη βαφή· τα φίλτρα και η αναζήτηση από εκεί και πέρα είναι server actions.
 */
export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const assets = await listAssets({ limit: 120 });

  return (
    <PageShell
      title="Αρχεία"
      description="Ό,τι έχει ανέβει για banners και widgets. Κάθε πλακίδιο λέει τις διαστάσεις του και σε πόσα σημεία χρησιμοποιείται."
    >
      <MediaLibrary initial={assets} />
    </PageShell>
  );
}
