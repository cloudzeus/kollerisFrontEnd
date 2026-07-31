import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listForAdmin } from "@/lib/content/content";
import { routing, type Locale } from "@/i18n/routing";
import { ContentEditor } from "./ContentEditor";
import { PageShell } from "@/components/admin/PageShell";

export const dynamic = "force-dynamic";

/**
 * Admin screen — editable copy.
 *
 * The locale is a query parameter rather than component state so a particular
 * language is a link somebody can send, and so switching does not quietly
 * discard unsaved edits in the previous one — it reloads, which is honest.
 */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const session = await auth();
  assertCan(session?.user.role, "content");

  const { locale: requested } = await searchParams;
  const locale = (
    routing.locales.includes(requested as Locale) ? requested : routing.defaultLocale
  ) as Locale;

  const values = await listForAdmin(locale);
  const untouched = values.filter((v) => v.isFallback).length;

  return (
    <PageShell
      title="Περιεχόμενο"
      description="Κείμενα και εικόνες του καταστήματος. Ένα άδειο πεδίο επαναφέρει το αρχικό — τίποτα δεν χάνεται."
    >
      {untouched > 0 && (
        <p className="mb-6 text-[12.5px] text-k-text-3">
          {untouched === values.length
            ? "Κανένα κείμενο δεν έχει αλλάξει ακόμη — βλέπετε το αρχικό."
            : `${untouched} από ${values.length} δείχνουν ακόμη το αρχικό κείμενο.`}
        </p>
      )}
      <ContentEditor locale={locale} locales={routing.locales} values={values} />
    </PageShell>
  );
}
