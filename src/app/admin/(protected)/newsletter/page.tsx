import Link from "next/link";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { PageShell, Panel } from "@/components/admin/PageShell";
import { prisma } from "@/lib/prisma";
import { campaignTemplates } from "@/lib/newsletter/campaign";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Σε αναμονή επιβεβαίωσης",
  confirmed: "Επιβεβαιωμένοι",
  unsubscribed: "Διαγράφηκαν",
  bounced: "Απορρίφθηκαν",
};

const CAMPAIGN_LABEL: Record<string, string> = {
  draft: "Πρόχειρη",
  sending: "Αποστέλλεται",
  sent: "Απεσταλμένη",
  failed: "Απέτυχε",
};

/**
 * Η αρχική του newsletter.
 *
 * Δείχνει πρώτα το κοινό και μετά τις καμπάνιες, γιατί με αυτή τη σειρά
 * ρωτιέται: «σε πόσους μπορώ να στείλω» προηγείται του «τι έστειλα». Οι
 * αριθμοί είναι από τη βάση — κανένας δεν είναι σταθερός στον κώδικα.
 */
export default async function NewsletterPage() {
  const session = await auth();
  assertCan(session?.user.role, "engagement");

  const [byStatus, campaigns, templates] = await Promise.all([
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    Promise.resolve(campaignTemplates()),
  ]);

  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]));
  const confirmed = counts.confirmed ?? 0;

  return (
    <PageShell
      title="Newsletter"
      description="Λίστα παραληπτών και καμπάνιες. Στέλνει μέσω Mailgun, με αναφορά παραδόσεων και ανοιγμάτων."
      actions={
        <Link
          href="/admin/newsletter/nea"
          className="inline-flex h-9 items-center bg-neutral-900 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-neutral-700"
        >
          Νέα καμπάνια
        </Link>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["confirmed", "pending", "unsubscribed", "bounced"] as const).map((status) => (
          <div key={status} className="border border-neutral-200 bg-white p-4">
            <div className="font-mono text-[28px] leading-none font-semibold tabular-nums">
              {(counts[status] ?? 0).toLocaleString("el-GR")}
            </div>
            <div className="mt-1.5 text-[12px] text-neutral-500">{STATUS_LABEL[status]}</div>
          </div>
        ))}
      </div>

      {confirmed === 0 && (
        <Panel title="Δεν υπάρχουν ακόμη παραλήπτες">
          <p className="text-[13px] leading-relaxed text-neutral-600">
            Η φόρμα εγγραφής στην αρχική μόλις συνδέθηκε. Μέχρι σήμερα δεν έγραφε πουθενά — όποιος
            είχε δώσει email πριν, δεν καταγράφηκε και δεν μπορεί να ανακτηθεί.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
            Μπορείτε να ξεκινήσετε ανεβάζοντας λίστα στο βήμα παραληπτών μιας καμπάνιας, ή να
            περιμένετε τις πρώτες εγγραφές. Οι εγγραφές απαιτούν επιβεβαίωση με email — μέχρι να
            πατηθεί ο σύνδεσμος, ο συνδρομητής μένει «σε αναμονή» και δεν λαμβάνει καμπάνιες.
          </p>
        </Panel>
      )}

      <Panel
        title="Καμπάνιες"
        /*
          Τα πρότυπα ΚΑΜΠΑΝΙΑΣ, όχι και τα 24 του συστήματος. Το «24 διαθέσιμα
          templates» κάτω από τον τίτλο «Καμπάνιες» υποσχόταν είκοσι τέσσερις
          επιλογές σε έναν wizard που προσφέρει τρεις.
        */
        description={`${templates.length} πρότυπα newsletter διαθέσιμα για αποστολή`}
      >
        {campaigns.length === 0 ? (
          <p className="text-[13px] text-neutral-500">Καμία καμπάνια ακόμη.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[11px] tracking-wide text-neutral-500 uppercase">
                  <th className="py-2 pr-4 font-medium">Όνομα</th>
                  <th className="py-2 pr-4 font-medium">Template</th>
                  <th className="py-2 pr-4 font-medium">Κατάσταση</th>
                  <th className="py-2 pr-4 text-right font-medium">Παραλήπτες</th>
                  <th className="py-2 pr-4 text-right font-medium">Παραδόθηκαν</th>
                  <th className="py-2 text-right font-medium">Άνοιξαν</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-neutral-100">
                    <td className="py-2.5 pr-4">
                      <Link href={`/admin/newsletter/${c.id}`} className="font-medium hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[12px] text-neutral-500">{c.templateId}</td>
                    <td className="py-2.5 pr-4">{CAMPAIGN_LABEL[c.status] ?? c.status}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{c.recipientCount}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{c.deliveredCount}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums">
                      {c.openedCount}
                      {c.deliveredCount > 0 && (
                        <span className="ml-1.5 text-[11px] text-neutral-400">
                          {Math.round((c.openedCount / c.deliveredCount) * 100)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
