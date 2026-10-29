import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { listForAdmin } from "@/lib/content/content";
import { listEditableMessages } from "@/lib/content/messages";
import { INTL_PAGES } from "@/lib/content/registry/pages-intl";
import { routing, type Locale } from "@/i18n/routing";
import { ContentEditor } from "./ContentEditor";
import { MessagePagesEditor } from "./MessagePagesEditor";
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

  const messagePages = await Promise.all(
    INTL_PAGES.map(async (p) => ({
      id: p.id,
      title: p.title,
      path: p.path,
      fields: await listEditableMessages(p.namespace, locale),
    })),
  );

  return (
    <PageShell
      title="Περιεχόμενο"
      description="Κείμενα και εικόνες του καταστήματος. Ένα άδειο πεδίο επαναφέρει το αρχικό — τίποτα δεν χάνεται."
    >
      {untouched > 0 && (
        <p className="mb-6 text-[length:var(--fs-11-5)] text-k-text-3">
          {untouched === values.length
            ? "Κανένα κείμενο δεν έχει αλλάξει ακόμη — βλέπετε το αρχικό."
            : `${untouched} από ${values.length} δείχνουν ακόμη το αρχικό κείμενο.`}
        </p>
      )}
      <ContentEditor
        locale={locale}
        locales={routing.locales}
        defaultLocale={routing.defaultLocale}
        values={values}
      />

      <div className="mt-12 border-t border-k-line pt-8">
        <h2 className="text-[length:var(--fs-13)] font-semibold text-k-ink">Σελίδες καταστήματος</h2>
        <p className="mt-1 mb-6 text-[length:var(--fs-11-5)] text-k-text-3">
          Κείμενα των σελίδων (εταιρεία, επικοινωνία, προσφορές, συχνές ερωτήσεις). Ένα άδειο πεδίο επαναφέρει
          το αρχικό. Οι μεταφράσεις en/it υπάρχουν ήδη — η «Μετάφραση από Ελληνικά» είναι ανά πεδίο.
        </p>
        <MessagePagesEditor locale={locale} defaultLocale={routing.defaultLocale} pages={messagePages} />
      </div>
    </PageShell>
  );
}
