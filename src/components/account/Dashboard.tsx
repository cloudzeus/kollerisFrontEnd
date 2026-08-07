import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Clock,
  CreditCard,
  MapPin,
  Package,
  Truck,
} from "lucide-react";
import type { AccountDashboard } from "@/lib/account/dashboard";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { upGreek } from "@/lib/greek";

/**
 * The account overview, rebuilt around the questions people actually arrive with.
 *
 * What was here before was a grid of facts about the account — name, email,
 * telephone, last sign-in. Every one true, none of them a reason to visit.
 * Nobody signs in to read their own phone number back.
 *
 * People come for three things, in this order: where is my parcel, what did I
 * buy, and change something. So the page is built in that order and the facts
 * moved to the bottom, where reference material belongs.
 *
 * ── Why the tracking strip is first and full width ──────────────────────────
 *
 * When there IS a parcel in transit it is the only thing the visitor came for,
 * and a customer who cannot find it phones the shop — which costs more than
 * this whole page. When there is not, it is absent entirely rather than a
 * placeholder saying "no active shipments", because an empty state that
 * appears more often than the real thing trains people to ignore the space.
 */

/*
 * Colour carries the state, and the label carries it too.
 *
 * Never colour alone: a customer who cannot distinguish the amber from the
 * green still has to know whether their order shipped, and roughly one man in
 * twelve cannot. The chip is a word first and a colour second.
 */
const STATUS: Record<string, { label: string; tone: string }> = {
  PENDING_PAYMENT: { label: "Αναμονή πληρωμής", tone: "bg-k-amber/10 text-k-amber" },
  CONFIRMED: { label: "Επιβεβαιωμένη", tone: "bg-k-ink text-white" },
  SHIPPED: { label: "Απεστάλη", tone: "bg-k-blue/10 text-k-blue" },
  DELIVERED: { label: "Παραδόθηκε", tone: "bg-k-green/10 text-k-green" },
  CANCELLED: { label: "Ακυρώθηκε", tone: "bg-k-surface-3 text-k-text-3" },
  FAILED: { label: "Απέτυχε", tone: "bg-k-red/10 text-k-red" },
};

function when(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "el" ? "el-GR" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Athens",
  }).format(date);
}

export function Dashboard({
  data,
  locale,
}: {
  data: AccountDashboard;
  locale: Locale;
}) {
  const money = (n: number) => formatMoney(n, locale);

  return (
    <div className="space-y-5">
      {/* ── Where is my parcel ─────────────────────────────────────────── */}
      {data.tracking && (
        <section className="border border-k-ink bg-k-ink text-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/12 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Truck className="size-4 text-k-red" aria-hidden />
              <div>
                <div className="t-eyebrow text-white/50">{upGreek("Η αποστολή σας")}</div>
                <div className="numeral text-[13px]">
                  {data.tracking.orderNumber} · ACS {data.tracking.voucherNo}
                </div>
              </div>
            </div>
            <Link
              href={`/logariasmos/paraggelies`}
              className="t-btn-sm border border-white/25 px-4 py-2 text-white transition-colors hover:border-white"
            >
              {upGreek("Λεπτομέρειες")}
            </Link>
          </div>

          {data.tracking.steps.length > 0 ? (
            <ol className="px-5 py-4">
              {/* Newest first: the last thing that happened is the answer. */}
              {data.tracking.steps.slice(0, 4).map((step, i) => (
                <li key={`${step.at}-${i}`} className="flex gap-3 py-1.5">
                  <span
                    aria-hidden
                    className={`mt-1.5 block size-1.5 shrink-0 rounded-full ${i === 0 ? "bg-k-red" : "bg-white/25"}`}
                  />
                  <div className="min-w-0">
                    <div className={`text-[13px] ${i === 0 ? "text-white" : "text-white/60"}`}>
                      {step.status}
                    </div>
                    <div className="numeral text-[11px] text-white/40">
                      {step.at}
                      {step.place ? ` · ${step.place}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="px-5 py-4 text-[13px] text-white/60">
              Η ACS παρέλαβε το δέμα. Τα στάδια παράδοσης εμφανίζονται μόλις ξεκινήσει η
              διαδρομή του.
            </p>
          )}
        </section>
      )}

      {/* ── At a glance ────────────────────────────────────────────────── */}
      <div className="grid gap-px border border-k-line bg-k-line sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Package className="size-3.5" />} label="Παραγγελίες" value={String(data.counts.total)} />
        <Stat icon={<Clock className="size-3.5" />} label="Σε εξέλιξη" value={String(data.counts.open)} accent={data.counts.open > 0} />
        <Stat icon={<CheckCircle2 className="size-3.5" />} label="Παραδόθηκαν" value={String(data.counts.delivered)} />
        <Stat
          icon={<CreditCard className="size-3.5" />}
          label={`Σύνολο ${new Date().getFullYear()}`}
          value={money(data.spend.year)}
          meta={data.spend.lifetime > data.spend.year ? `${money(data.spend.lifetime)} συνολικά` : undefined}
        />
      </div>

      {/* ── What did I buy ─────────────────────────────────────────────── */}
      <section className="border border-k-line bg-white">
        <div className="flex items-center justify-between border-b border-k-line px-5 py-3.5">
          <h2 className="t-eyebrow text-k-text-4">{upGreek("Πρόσφατες παραγγελίες")}</h2>
          {data.counts.total > data.orders.length && (
            <Link
              href="/logariasmos/paraggelies"
              className="inline-flex items-center gap-1 text-[12px] text-k-ink underline-offset-2 hover:underline"
            >
              Όλες <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>

        {data.orders.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Box className="mx-auto mb-3 size-6 text-k-text-4" aria-hidden />
            <p className="text-[13.5px] text-k-text-2">Δεν έχετε κάνει παραγγελία ακόμα.</p>
            <Link
              href="/proionta"
              className="t-btn-sm mt-5 inline-block border-[1.5px] border-k-ink px-7 py-3 text-k-ink transition-colors hover:bg-k-ink hover:text-white"
            >
              {upGreek("Δείτε τα προϊόντα")}
            </Link>
          </div>
        ) : (
          <ul>
            {data.orders.map((order) => {
              const s = STATUS[order.status] ?? { label: order.status, tone: "bg-k-surface-3 text-k-text-3" };
              return (
                <li key={order.orderNumber} className="border-b border-k-line last:border-0">
                  <Link
                    href={`/checkout/epibebaiosi/${order.orderNumber}?t=${order.guestToken}`}
                    className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-k-surface-2"
                  >
                    {/* The product's own picture, because that is what somebody
                        recognises — not an order number they never memorised. */}
                    {order.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={order.image}
                        alt=""
                        className="size-11 shrink-0 border border-k-line object-contain"
                      />
                    ) : (
                      <span className="flex size-11 shrink-0 items-center justify-center border border-k-line bg-k-surface-2">
                        <Box className="size-4 text-k-text-4" aria-hidden />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] text-k-ink">
                        {order.firstItem ?? order.orderNumber}
                        {order.items > 1 && (
                          <span className="text-k-text-3"> +{order.items - 1} ακόμα</span>
                        )}
                      </div>
                      <div className="numeral text-[11.5px] text-k-text-3">
                        {order.orderNumber} · {when(order.createdAt, locale)}
                      </div>
                    </div>

                    <span className={`shrink-0 px-2 py-1 text-[10.5px] font-semibold ${s.tone}`}>
                      {upGreek(s.label)}
                    </span>
                    <span className="numeral hidden w-24 shrink-0 text-right text-[13px] text-k-ink sm:block">
                      {money(order.totalGross)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Change something ───────────────────────────────────────────── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="border border-k-line bg-white">
          <div className="flex items-center justify-between border-b border-k-line px-5 py-3.5">
            <h2 className="t-eyebrow text-k-text-4">{upGreek("Διεύθυνση παράδοσης")}</h2>
            <Link
              href="/logariasmos/dieuthynseis"
              className="text-[12px] text-k-ink underline-offset-2 hover:underline"
            >
              {data.addressCount > 0 ? "Διαχείριση" : "Προσθήκη"}
            </Link>
          </div>
          <div className="px-5 py-4">
            {data.address ? (
              <>
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-k-text-4" aria-hidden />
                  <span className="t-eyebrow text-k-text-4">{upGreek(data.address.label)}</span>
                </div>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-k-ink">
                  {data.address.line1}
                  {data.address.line2 ? `, ${data.address.line2}` : ""}
                  <br />
                  {data.address.postcode} {data.address.city}
                </p>
                {data.addressCount > 1 && (
                  <p className="mt-2 text-[12px] text-k-text-3">
                    + {data.addressCount - 1} ακόμα
                  </p>
                )}
              </>
            ) : (
              <p className="text-[13px] leading-[1.6] text-k-text-2">
                Αποθηκεύστε μια διεύθυνση και το checkout θα συμπληρώνεται μόνο του.
              </p>
            )}
          </div>
        </section>

        <section className="border border-k-line bg-white">
          <div className="border-b border-k-line px-5 py-3.5">
            <h2 className="t-eyebrow text-k-text-4">{upGreek("Γρήγορες ενέργειες")}</h2>
          </div>
          <ul className="divide-y divide-k-line">
            <QuickAction href="/logariasmos/paraggelies" label="Οι παραγγελίες μου" meta={`${data.counts.total}`} />
            <QuickAction href="/logariasmos/dieuthynseis" label="Διευθύνσεις" meta={`${data.addressCount}`} />
            <QuickAction href="/logariasmos/stoicheia" label="Τα στοιχεία μου" />
            <QuickAction href="/epikoinonia" label="Επικοινωνία" />
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  meta,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  meta?: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="flex items-center gap-1.5 text-k-text-4">
        {icon}
        <span className="t-eyebrow">{upGreek(label)}</span>
      </div>
      <div
        className={`numeral mt-1.5 text-[22px] leading-none ${accent ? "text-k-red" : "text-k-ink"}`}
      >
        {value}
      </div>
      {meta && <div className="mt-1 text-[11.5px] text-k-text-3">{meta}</div>}
    </div>
  );
}

function QuickAction({ href, label, meta }: { href: string; label: string; meta?: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between px-5 py-3 text-[13.5px] text-k-ink transition-colors hover:bg-k-surface-2"
      >
        <span>{label}</span>
        <span className="flex items-center gap-2 text-k-text-3">
          {meta && <span className="numeral text-[12px]">{meta}</span>}
          <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </Link>
    </li>
  );
}
