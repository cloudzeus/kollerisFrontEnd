import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { upGreek } from "@/lib/greek";
import { listForAdmin } from "@/lib/settings/settings";
import { SettingsForm } from "./SettingsForm";

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
    <div className="max-w-[62rem] px-4 py-8 lg:px-8">
      <header className="mb-8">
        <h1 className="text-[22px] font-semibold tracking-tight text-k-text-1">
          {upGreek("Ρυθμίσεις")}
        </h1>
        <p className="mt-2 max-w-[70ch] text-[13px] leading-[1.65] text-k-text-2">
          Ό,τι αποθηκεύεται εδώ υπερισχύει του αρχείου περιβάλλοντος. Οι τιμές του{" "}
          <span className="font-mono text-[12px]">.env</span> ισχύουν μόνο όσο δεν έχει
          αποθηκευτεί κάτι — έτσι μια αλλαγή εδώ έχει πάντα αποτέλεσμα.
        </p>
        {fromEnv > 0 && (
          <p className="mt-3 border-l-[3px] border-k-amber bg-k-surface-2 px-4 py-3 text-[12.5px] leading-[1.55] text-k-text-2">
            {fromEnv === 1
              ? "Μία ρύθμιση διαβάζεται ακόμη από το περιβάλλον."
              : `${fromEnv} ρυθμίσεις διαβάζονται ακόμη από το περιβάλλον.`}{" "}
            Αποθηκεύστε τις για να περάσουν εδώ.
          </p>
        )}
      </header>

      <SettingsForm values={values} />
    </div>
  );
}
