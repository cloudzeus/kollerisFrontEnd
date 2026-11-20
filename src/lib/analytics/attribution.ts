/**
 * Από πού ήρθε μια παραγγελία: utm, gclid/fbclid και τα αναγνωριστικά GA4/Meta
 * του browser.
 *
 * Μόνο με συγκατάθεση. Το cookie `k_attr` γράφεται αφού ο επισκέπτης πατήσει
 * «Αποδοχή», και η ύπαρξή του είναι η απόδειξη της συγκατάθεσης για όσα στέλνει
 * ο server (αγορά στο GA4 και στη Meta). Χωρίς αυτό η παραγγελία δεν κρατά
 * τίποτα και τίποτα δεν στέλνεται.
 *
 * Καθαρές συναρτήσεις, χωρίς DOM ή `next/headers`, για να τις χρησιμοποιούν
 * και ο browser και ο server και τα tests.
 */

export const ATTR_COOKIE = "k_attr";
export const ATTR_MAX_AGE_DAYS = 90;

export const CLICK_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
] as const;
export type ClickParam = (typeof CLICK_PARAMS)[number];

/** Το περιεχόμενο του cookie: το τελευταίο κλικ από διαφήμιση ή σύνδεσμο με utm. */
export type AttrCookie = Partial<Record<ClickParam, string>> & {
  /** Πότε ήρθε το κλικ (ms). */
  ts?: number;
  /** Η σελίδα όπου προσγειώθηκε. */
  landing?: string;
};

/** Ό,τι κρατά η παραγγελία. `consent` υπάρχει πάντα: χωρίς αυτό δεν γράφεται τίποτα. */
export type OrderAttribution = AttrCookie & {
  consent: "granted";
  gaClientId?: string;
  gaSessionId?: string;
  fbp?: string;
  fbc?: string;
  ip?: string;
  ua?: string;
};

const clean = (v: string | null | undefined, max = 200) => {
  const s = (v ?? "").trim();
  return s ? s.slice(0, max) : undefined;
};

/** Οι παράμετροι κλικ ενός URL, ή null όταν δεν έχει καμία. */
export function readClickParams(search: URLSearchParams): Partial<Record<ClickParam, string>> | null {
  const out: Partial<Record<ClickParam, string>> = {};
  for (const k of CLICK_PARAMS) {
    const v = clean(search.get(k));
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Τελευταίο κλικ: νέες παράμετροι αντικαθιστούν όλες τις παλιές (ένα κλικ Meta
 * μετά από Google δεν κρατά το gclid). Χωρίς νέες, μένει το προηγούμενο.
 */
export function mergeAttribution(
  prev: AttrCookie | null,
  click: Partial<Record<ClickParam, string>> | null,
  now: number,
  landing: string,
): AttrCookie {
  if (!click) return prev ?? {};
  return { ...click, ts: now, landing: landing.slice(0, 300) };
}

export function parseAttrCookie(value: string | undefined | null): AttrCookie | null {
  if (!value) return null;
  try {
    const raw = JSON.parse(decodeURIComponent(value)) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") return null;
    const out: AttrCookie = {};
    for (const k of CLICK_PARAMS) {
      const v = typeof raw[k] === "string" ? clean(raw[k] as string) : undefined;
      if (v) out[k] = v;
    }
    if (typeof raw.ts === "number" && Number.isFinite(raw.ts)) out.ts = raw.ts;
    if (typeof raw.landing === "string") out.landing = raw.landing.slice(0, 300);
    return out;
  } catch {
    return null;
  }
}

/** `_ga` = `GA1.1.<random>.<timestamp>` → `<random>.<timestamp>`. */
export function gaClientId(gaCookie: string | undefined | null): string | undefined {
  const m = /^GA\d\.\d+\.(\d+\.\d+)$/.exec((gaCookie ?? "").trim());
  return m?.[1];
}

/**
 * `_ga_<ροή>`: παλιά μορφή `GS1.1.<session>.<n>…`, νέα `GS2.1.s<session>$o…`.
 */
export function gaSessionId(streamCookie: string | undefined | null): string | undefined {
  const v = (streamCookie ?? "").trim();
  const gs2 = /^GS2\.\d+\.s(\d+)/.exec(v);
  if (gs2) return gs2[1];
  const gs1 = /^GS1\.\d+\.(\d+)\./.exec(v);
  return gs1?.[1];
}

/** Το cookie της ροής GA4: `_ga_` + το id μετά το `G-`. */
export function gaStreamCookieName(measurementId: string): string {
  return `_ga_${measurementId.replace(/^G-/, "")}`;
}

/**
 * `_fbc` όταν το Pixel δεν πρόλαβε να το γράψει: η μορφή που ζητά η Meta,
 * `fb.1.<ms του κλικ>.<fbclid>`.
 */
export function fbcValue(fbcCookie: string | undefined | null, fbclid: string | undefined, ts: number | undefined): string | undefined {
  const c = clean(fbcCookie, 400);
  if (c) return c;
  return fbclid ? `fb.1.${ts ?? Date.now()}.${fbclid}` : undefined;
}

/** Το κανάλι για τις αναφορές: google, meta ή το utm_source όπως ήρθε. */
export function attributionChannel(a: Pick<AttrCookie, "utm_source" | "gclid" | "gbraid" | "wbraid" | "fbclid"> | null | undefined): string | null {
  if (!a) return null;
  const src = (a.utm_source ?? "").toLowerCase();
  if (a.gclid || a.gbraid || a.wbraid || src === "google") return "google";
  if (a.fbclid || ["facebook", "fb", "instagram", "ig", "meta"].includes(src)) return "meta";
  return src || null;
}

/** Ό,τι πάει στο HDCtool: χωρίς IP, user agent ή αναγνωριστικά browser. */
export function erpAttribution(a: OrderAttribution): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const k of CLICK_PARAMS) if (a[k]) out[k] = a[k]!;
  if (a.landing) out.landing = a.landing;
  if (a.ts) out.ts = a.ts;
  const channel = attributionChannel(a);
  if (channel) out.channel = channel;
  return out;
}

/** Διαβάζει το JSON της στήλης `orders.attribution`. */
export function asOrderAttribution(value: unknown): OrderAttribution | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return v.consent === "granted" ? (v as OrderAttribution) : null;
}
