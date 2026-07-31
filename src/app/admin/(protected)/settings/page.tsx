import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listForAdmin } from "@/lib/settings/settings";
import { SettingsForm } from "./SettingsForm";
import { PageShell } from "@/components/admin/PageShell";

export const dynamic = "force-dynamic";

/**
 * Admin screen — runtime configuration.
 *
 * `listForAdmin` is the only thing that crosses to the client, and it cannot
 * carry a secret: the type it returns has no field for one. That is the whole
 * protection, and it lives in the data layer rather than in this page, so a
 * later redesign here cannot undo it.
 */
export default async function SettingsPage() {
  const session = await auth();
  // Hiding the nav item is not authorisation.
  assertCan(session?.user.role, "settings");

  const values = await listForAdmin();
  const fromEnv = values.filter((v) => v.fromEnv).length;

  return (
    <PageShell
      title="Ρυθμίσεις"
      width="narrow"
      description="Ό,τι αποθηκεύεται εδώ υπερισχύει του .env — μια αλλαγή εδώ έχει πάντα αποτέλεσμα."
    >
      {fromEnv > 0 && (
        <p className="mb-6 border-l-[3px] border-k-amber border border-k-line bg-white px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
          {fromEnv === 1
            ? "Μία ρύθμιση διαβάζεται ακόμη από το περιβάλλον."
            : `${fromEnv} ρυθμίσεις διαβάζονται ακόμη από το περιβάλλον.`}{" "}
          Αποθηκεύστε τις για να περάσουν εδώ.
        </p>
      )}
      <SettingsForm values={values} />
    </PageShell>
  );
}
