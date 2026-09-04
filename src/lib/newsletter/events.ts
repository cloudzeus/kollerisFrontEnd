import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Ποιος παρέλαβε και ποιος άνοιξε — από το Events API του Mailgun.
 *
 * ── Γιατί polling και όχι webhook ──────────────────────────────────────────
 *
 * Το webhook θα ήταν ακριβέστερο και θέλει δημόσιο endpoint, υπογραφή, ουρά και
 * αντοχή σε επαναλήψεις. Για μια αναφορά που κοιτάει κανείς λίγες φορές μετά
 * από κάθε αποστολή, το polling δίνει το ίδιο αποτέλεσμα με πολύ λιγότερα
 * κινούμενα μέρη — και δεν σπάει σιωπηλά όταν αλλάξει το domain.
 *
 * Το ταίριασμα γίνεται με ΔΙΕΥΘΥΝΣΗ και όχι με message id: η μαζική αποστολή
 * επιστρέφει ένα id για όλη την παρτίδα, ενώ κάθε event φέρει τον παραλήπτη του.
 */

const ENDPOINT = process.env.MAILGUN_ENDPOINT ?? "https://api.eu.mailgun.net";
const DOMAIN = process.env.MAILGUN_DOMAIN ?? "";
const API_KEY = process.env.MAILGUN_API_KEY ?? "";

type MailgunEvent = {
  event: string;
  recipient?: string;
  timestamp?: number;
  "user-variables"?: Record<string, string>;
  reason?: string;
  "delivery-status"?: { message?: string };
};

export type SyncStatsResult =
  | { ok: true; delivered: number; opened: number; clicked: number; failed: number; events: number }
  | { ok: false; error: string };

/**
 * Τραβά τα events μιας καμπάνιας και ενημερώνει τους παραλήπτες.
 *
 * Οι σφραγίδες γράφονται μόνο αν λείπουν: το Mailgun επιστρέφει ΚΑΘΕ άνοιγμα,
 * και ο ίδιος άνθρωπος μπορεί να ανοίξει το email δέκα φορές. Η αναφορά μετρά
 * ανθρώπους, όχι ανοίγματα — «άνοιξαν 340» πρέπει να σημαίνει 340 πρόσωπα.
 */
export async function syncCampaignStats(campaignId: string): Promise<SyncStatsResult> {
  if (!API_KEY || !DOMAIN) return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { sentAt: true },
  });
  if (!campaign?.sentAt) return { ok: false, error: "Η καμπάνια δεν έχει σταλεί ακόμη." };

  const begin = Math.floor(campaign.sentAt.getTime() / 1000) - 60;
  const seen = { delivered: 0, opened: 0, clicked: 0, failed: 0 };
  let events = 0;

  let url =
    `${ENDPOINT}/v3/${DOMAIN}/events?` +
    new URLSearchParams({
      begin: String(begin),
      ascending: "yes",
      limit: "300",
      "user-variables": JSON.stringify({ "campaign-id": campaignId }),
    });

  /*
   * Σελιδοποίηση με όριο. Χωρίς αυτό, μια καμπάνια με εκατοντάδες χιλιάδες
   * events θα κρατούσε το αίτημα ανοιχτό μέχρι να λήξει — και η αναφορά δεν θα
   * εμφανιζόταν ποτέ.
   */
  for (let page = 0; page < 40 && url; page++) {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${Buffer.from(`api:${API_KEY}`).toString("base64")}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, error: `Mailgun ${res.status}: ${body.message ?? "χωρίς μήνυμα"}` };
    }
    const body = (await res.json()) as { items?: MailgunEvent[]; paging?: { next?: string } };
    const items = body.items ?? [];
    events += items.length;

    for (const ev of items) {
      const email = ev.recipient?.toLowerCase();
      if (!email) continue;
      const at = new Date((ev.timestamp ?? Date.now() / 1000) * 1000);

      if (ev.event === "delivered") {
        const n = await prisma.campaignRecipient.updateMany({
          where: { campaignId, email, deliveredAt: null },
          data: { deliveredAt: at },
        });
        seen.delivered += n.count;
      } else if (ev.event === "opened") {
        const n = await prisma.campaignRecipient.updateMany({
          where: { campaignId, email, openedAt: null },
          data: { openedAt: at },
        });
        seen.opened += n.count;
      } else if (ev.event === "clicked") {
        const n = await prisma.campaignRecipient.updateMany({
          where: { campaignId, email, clickedAt: null },
          data: { clickedAt: at },
        });
        seen.clicked += n.count;
      } else if (ev.event === "failed" || ev.event === "rejected" || ev.event === "complained") {
        const n = await prisma.campaignRecipient.updateMany({
          where: { campaignId, email, failedAt: null },
          data: {
            failedAt: at,
            failedReason: (ev.reason ?? ev.event).slice(0, 255),
          },
        });
        seen.failed += n.count;

        /*
         * Οριστική απόρριψη σημαίνει ότι η διεύθυνση δεν υπάρχει. Μένει στη
         * λίστα και χαλάει τη φήμη του τομέα σε κάθε επόμενη αποστολή, οπότε
         * σημειώνεται μία φορά και δεν ξαναδοκιμάζεται.
         */
        if (ev.event === "failed" || ev.event === "complained") {
          await prisma.newsletterSubscriber.updateMany({
            where: { email, status: { in: ["pending", "confirmed"] } },
            data: { status: "bounced" },
          });
        }
      }
    }

    url = body.paging?.next && items.length > 0 ? body.paging.next : "";
  }

  const totals = await prisma.campaignRecipient.groupBy({
    by: ["campaignId"],
    where: { campaignId },
    _count: { deliveredAt: true, openedAt: true, clickedAt: true, failedAt: true },
  });
  const t = totals[0]?._count;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      deliveredCount: t?.deliveredAt ?? 0,
      openedCount: t?.openedAt ?? 0,
      clickedCount: t?.clickedAt ?? 0,
      failedCount: t?.failedAt ?? 0,
      statsSyncedAt: new Date(),
    },
  });

  return { ok: true, ...seen, events };
}
