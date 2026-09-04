import "server-only";

/**
 * Στατιστικά αποστολών από το Mailgun.
 *
 * ── Ένα domain, όχι δύο ────────────────────────────────────────────────────
 *
 * Ο λογαριασμός έχει οκτώ domains· το `web.kolleris.com` ΔΕΝ είναι ένα από
 * αυτά — το API απαντά 401 για εκείνο. Και είναι σωστό: το domain αποστολής δεν
 * χρειάζεται να ταυτίζεται με τη διεύθυνση του site. Όλα τα email του
 * καταστήματος φεύγουν μέσω `kolleris.com`, οπότε αυτό μετράει.
 */

const ENDPOINT = process.env.MAILGUN_ENDPOINT ?? "https://api.eu.mailgun.net";
const API_KEY = process.env.MAILGUN_API_KEY ?? "";
export const STATS_DOMAIN = process.env.MAILGUN_DOMAIN ?? "kolleris.com";

export const RANGES = [
  { id: "7d", label: "7 ημέρες" },
  { id: "30d", label: "30 ημέρες" },
  { id: "90d", label: "90 ημέρες" },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

/** Ένα «γεγονός» όπως το επιστρέφει το Mailgun: φωλιασμένο, με δικά του σύνολα. */
type Bucket = Record<string, number | Record<string, number>>;
type DayRow = { time: string } & Record<string, Bucket | string>;

function flat(node: unknown): number {
  if (typeof node === "number") return node;
  if (!node || typeof node !== "object") return 0;
  const o = node as Record<string, unknown>;
  // Όπου υπάρχει `total`, αυτό ΕΙΝΑΙ το σύνολο — άθροισμα των αδελφών θα το διπλομετρούσε.
  if (typeof o.total === "number") return o.total;
  return Object.values(o).reduce<number>((a, v) => a + flat(v), 0);
}

function pick(node: unknown, path: string[]): number {
  let cur: unknown = node;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return 0;
    cur = (cur as Record<string, unknown>)[key];
  }
  return flat(cur);
}

export type DailyPoint = {
  date: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  failed: number;
};

export type MailgunStats = {
  domain: string;
  range: RangeId;
  days: DailyPoint[];
  totals: {
    /** Ό,τι δεχτήκαμε να στείλουμε. Ο παρονομαστής της παραδοσιμότητας. */
    sent: number;
    delivered: number;
    /** ΜΟΝΑΔΙΚΑ άτομα, όχι ανοίγματα. Βλ. σχόλιο παρακάτω. */
    openedUnique: number;
    openedTotal: number;
    clickedUnique: number;
    clickedTotal: number;
    failedPermanent: number;
    failedTemporary: number;
    unsubscribed: number;
    complained: number;
    bounced: number;
    suppressed: number;
  };
};

export type StatsResult = { ok: true; stats: MailgunStats } | { ok: false; error: string };

export async function fetchMailgunStats(range: RangeId): Promise<StatsResult> {
  if (!API_KEY) return { ok: false, error: "Το MAILGUN_API_KEY δεν είναι ρυθμισμένο." };

  const qs = new URLSearchParams({ duration: range });
  for (const e of [
    "accepted",
    "delivered",
    "failed",
    "opened",
    "clicked",
    "unsubscribed",
    "complained",
  ]) {
    qs.append("event", e);
  }

  const res = await fetch(`${ENDPOINT}/v3/${STATS_DOMAIN}/stats/total?${qs}`, {
    headers: { Authorization: `Basic ${Buffer.from(`api:${API_KEY}`).toString("base64")}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      error:
        res.status === 401
          ? `Το «${STATS_DOMAIN}» δεν υπάρχει σε αυτόν τον λογαριασμό Mailgun, ή το κλειδί δεν έχει πρόσβαση.`
          : `Mailgun ${res.status}: ${body.slice(0, 160)}`,
    };
  }

  const body = (await res.json()) as { stats?: DayRow[] };
  const rows = body.stats ?? [];

  const days: DailyPoint[] = rows.map((r) => ({
    date: String(r.time),
    /*
     * `accepted.outgoing`, ΟΧΙ `accepted.total`. Το total περιλαμβάνει και τα
     * εισερχόμενα (`incoming`) — μηνύματα που έφτασαν ΣΕ εμάς. Μετρημένα ως
     * απεσταλμένα, θα ανέβαζαν τον παρονομαστή και θα έδειχναν την παραδοσιμότητα
     * χειρότερη απ' ό,τι είναι.
     */
    sent: pick(r.accepted, ["outgoing"]),
    delivered: pick(r.delivered, ["total"]),
    opened: pick(r.opened, ["unique"]),
    clicked: pick(r.clicked, ["unique"]),
    failed: pick(r.failed, ["permanent", "total"]) + pick(r.failed, ["temporary", "total"]),
  }));

  const sum = (fn: (r: DayRow) => number) => rows.reduce((a, r) => a + fn(r), 0);

  return {
    ok: true,
    stats: {
      domain: STATS_DOMAIN,
      range,
      days,
      totals: {
        sent: sum((r) => pick(r.accepted, ["outgoing"])),
        delivered: sum((r) => pick(r.delivered, ["total"])),
        /*
         * `unique` και `total` ξεχωριστά, και τα δύο ορατά.
         *
         * Ο ίδιος άνθρωπος ανοίγει ένα email πέντε φορές. Το «άνοιξαν» της
         * αναφοράς πρέπει να μετρά ΑΝΘΡΩΠΟΥΣ, αλλιώς ένα ποσοστό ανοίγματος
         * μπορεί να ξεπεράσει το 100% και να μοιάζει με σφάλμα. Το σύνολο μένει
         * δίπλα, γιατί λέει κάτι άλλο: πόσο επανήλθαν.
         */
        openedUnique: sum((r) => pick(r.opened, ["unique"])),
        openedTotal: sum((r) => pick(r.opened, ["total"])),
        clickedUnique: sum((r) => pick(r.clicked, ["unique"])),
        clickedTotal: sum((r) => pick(r.clicked, ["total"])),
        failedPermanent: sum((r) => pick(r.failed, ["permanent", "total"])),
        failedTemporary: sum((r) => pick(r.failed, ["temporary", "total"])),
        unsubscribed: sum((r) => pick(r.unsubscribed, ["total"])),
        complained: sum((r) => pick(r.complained, ["total"])),
        bounced: sum((r) => pick(r.failed, ["permanent", "bounce"])),
        suppressed: sum(
          (r) =>
            pick(r.failed, ["permanent", "suppress-bounce"]) +
            pick(r.failed, ["permanent", "suppress-unsubscribe"]) +
            pick(r.failed, ["permanent", "suppress-complaint"]),
        ),
      },
    },
  };
}
