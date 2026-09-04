import { cn } from "@/lib/utils";

/**
 * Γραφικά για τη σελίδα MailGun — καθαρό SVG, χωρίς βιβλιοθήκη.
 *
 * ── Γιατί όχι recharts ή chart.js ──────────────────────────────────────────
 *
 * Επειδή θα ήταν 90–180 KB JavaScript στο bundle του admin για πέντε
 * διαγράμματα που δεν χρειάζονται ούτε ζουμ, ούτε πανοραμική κίνηση, ούτε
 * ζωντανή ενημέρωση. Το SVG αποδίδεται στον server, φτάνει έτοιμο με το HTML
 * και δεν περιμένει hydration — που σε σελίδα αναφορών είναι και το πιο γρήγορο
 * και το πιο σωστό.
 *
 * ── Τα χρώματα σημαίνουν πράγματα ──────────────────────────────────────────
 *
 * Ένα χρώμα ανά μετρική, ίδιο σε κάθε διάγραμμα και σε κάθε κάρτα. Όταν το
 * μπλε είναι πάντα «άνοιξαν», η λεζάντα διαβάζεται μία φορά και μετά περισσεύει.
 * Οι αποτυχίες είναι το μόνο κόκκινο στη σελίδα — αν κοκκινίσει κάτι, αξίζει
 * βλέμμα.
 */

export const METRIC = {
  sent: { color: "#475569", label: "Απεσταλμένα" },
  delivered: { color: "#059669", label: "Παραδόθηκαν" },
  opened: { color: "#2563eb", label: "Άνοιξαν" },
  clicked: { color: "#7c3aed", label: "Κλικ" },
  failed: { color: "#dc2626", label: "Απέτυχαν" },
  unsubscribed: { color: "#d97706", label: "Διαγραφές" },
} as const;

export type MetricKey = keyof typeof METRIC;

/** Μικρό γράφημα μέσα σε κάρτα KPI — τάση, όχι ακριβείς τιμές. */
export function Sparkline({
  values,
  color,
  height = 34,
}: {
  values: number[];
  color: string;
  height?: number;
}) {
  if (values.length < 2) return <div style={{ height }} />;
  const w = 120;
  const max = Math.max(1, ...values);
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, height - (v / max) * (height - 4) - 2] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;
  const [lastX, lastY] = pts[pts.length - 1]!;
  const id = `sp-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      {/* Το τελευταίο σημείο τονισμένο: «πού είμαστε τώρα» είναι η ερώτηση. */}
      <circle cx={lastX} cy={lastY} r="2.4" fill={color} />
    </svg>
  );
}

/**
 * Η χοάνη παράδοσης.
 *
 * Οριζόντιες μπάρες με κοινό παρονομαστή τα απεσταλμένα, ώστε το πλάτος να
 * ΕΙΝΑΙ το ποσοστό. Τέσσερις ξεχωριστοί κύκλοι θα ζητούσαν από τον αναγνώστη να
 * κάνει τη διαίρεση στο μυαλό του.
 */
export function Funnel({
  steps,
}: {
  steps: Array<{ key: MetricKey; value: number; of: number; note?: string }>;
}) {
  return (
    <div className="space-y-2.5">
      {steps.map((s) => {
        const m = METRIC[s.key];
        const pct = s.of > 0 ? (s.value / s.of) * 100 : 0;
        return (
          <div key={s.key}>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="font-medium">{m.label}</span>
              <span className="font-mono tabular-nums">
                {s.value.toLocaleString("el-GR")}
                <span className="ml-1.5 text-neutral-400">{pct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 w-full bg-neutral-100">
              <div
                className="h-full transition-[width]"
                style={{ width: `${Math.max(pct, s.value > 0 ? 1.5 : 0)}%`, background: m.color }}
              />
            </div>
            {s.note && <p className="mt-0.5 text-[11px] text-neutral-500">{s.note}</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Ημερήσιο διάγραμμα με πολλές σειρές.
 *
 * Γραμμές και όχι στοίβα: οι σειρές είναι ΕΜΦΩΛΕΥΜΕΝΕΣ — κάθε κλικ είναι και
 * άνοιγμα, κάθε άνοιγμα είναι και παράδοση. Στοιβαγμένες θα άθροιζαν τα ίδια
 * μηνύματα τρεις φορές και θα έδειχναν όγκο που δεν υπάρχει.
 */
export function DailyChart({
  days,
  series,
  height = 190,
}: {
  days: Array<{ date: string } & Record<string, number | string>>;
  series: MetricKey[];
  height?: number;
}) {
  if (days.length < 2) {
    return <p className="py-8 text-center text-[12px] text-neutral-500">Δεν υπάρχουν αρκετά δεδομένα.</p>;
  }

  const w = 720;
  const padL = 34;
  const padB = 18;
  const innerW = w - padL - 8;
  const innerH = height - padB - 8;
  const max = Math.max(1, ...days.flatMap((d) => series.map((s) => Number(d[s] ?? 0))));
  const step = innerW / (days.length - 1);
  const x = (i: number) => padL + i * step;
  const y = (v: number) => 8 + innerH - (v / max) * innerH;

  // Τέσσερις γραμμές πλέγματος: αρκετές για να διαβαστεί κλίμακα, λίγες για να μη θορυβούν.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} className="min-w-[560px]">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={w - 8} y1={y(t)} y2={y(t)} stroke="#e5e5e5" strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="#a3a3a3" fontFamily="monospace">
              {t}
            </text>
          </g>
        ))}

        {series.map((key) => {
          const m = METRIC[key];
          const pts = days.map((d, i) => [x(i), y(Number(d[key] ?? 0))] as const);
          const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
          return (
            <g key={key}>
              <path d={line} fill="none" stroke={m.color} strokeWidth="1.8" strokeLinejoin="round" />
              {pts.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r="1.8" fill={m.color}>
                  <title>{`${new Date(String(days[i]!.date)).toLocaleDateString("el-GR")} · ${m.label}: ${days[i]![key]}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {days.map((d, i) =>
          i % Math.ceil(days.length / 8) === 0 ? (
            <text key={i} x={x(i)} y={height - 4} textAnchor="middle" fontSize="9" fill="#a3a3a3" fontFamily="monospace">
              {new Date(String(d.date)).toLocaleDateString("el-GR", { day: "2-digit", month: "2-digit" })}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

export function Legend({ items }: { items: MetricKey[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((k) => (
        <span key={k} className="flex items-center gap-1.5 text-[11px] text-neutral-600">
          <span className="h-2 w-2 rounded-full" style={{ background: METRIC[k].color }} />
          {METRIC[k].label}
        </span>
      ))}
    </div>
  );
}

/**
 * Δαχτυλίδι για μία αναλογία.
 *
 * Για ποσοστά που κρίνονται μόνα τους — παραδοσιμότητα, ποσοστό ανοίγματος —
 * όπου το ζητούμενο είναι «πόσο κοντά στο 100» και όχι σύγκριση με άλλα.
 */
export function Ring({
  value,
  of,
  color,
  label,
  sub,
}: {
  value: number;
  of: number;
  color: string;
  label: string;
  sub?: string;
}) {
  const pct = of > 0 ? Math.min(1, value / of) : 0;
  const r = 30;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-3">
      <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden>
        <circle cx="37" cy="37" r={r} fill="none" stroke="#f0f0f0" strokeWidth="7" />
        <circle
          cx="37"
          cy="37"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 37 37)"
        />
        <text
          x="37"
          y="41"
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          fill="#171717"
          fontFamily="monospace"
        >
          {of > 0 ? `${Math.round(pct * 100)}%` : "—"}
        </text>
      </svg>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{label}</p>
        {sub && <p className="text-[11px] leading-snug text-neutral-500">{sub}</p>}
      </div>
    </div>
  );
}

export function StatBadge({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        tone === "good" && "bg-emerald-50 text-emerald-700",
        tone === "warn" && "bg-amber-50 text-amber-700",
        tone === "bad" && "bg-red-50 text-red-700",
      )}
    >
      {children}
    </span>
  );
}
