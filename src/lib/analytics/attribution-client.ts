import { ATTR_COOKIE, ATTR_MAX_AGE_DAYS, mergeAttribution, parseAttrCookie, readClickParams, type ClickParam } from "@/lib/analytics/attribution";
import { CONSENT_STORAGE_KEY } from "@/components/analytics/GoogleAnalytics";

/*
 * Η πλευρά του browser. Το κλικ (utm/gclid/fbclid) κρατιέται στη μνήμη της
 * σελίδας μέχρι να υπάρξει συγκατάθεση· με «Αποδοχή» γράφεται στο `k_attr`,
 * με «Απόρριψη» σβήνεται. Πριν απαντήσει ο επισκέπτης δεν γράφεται τίποτα.
 */

let pending: { click: Partial<Record<ClickParam, string>>; landing: string } | null = null;

function consentGranted(): boolean {
  try {
    return localStorage.getItem(CONSENT_STORAGE_KEY) === "granted";
  } catch {
    return false;
  }
}

function readCookie(): string | undefined {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${ATTR_COOKIE}=`));
  return hit?.slice(ATTR_COOKIE.length + 1);
}

function writeCookie(value: string, maxAge: number) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTR_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`;
}

/** Σε κάθε σελίδα: κράτα το κλικ αν το URL έχει, και γράψ' το αν υπάρχει συγκατάθεση. */
export function rememberClick(url: URL) {
  const click = readClickParams(url.searchParams);
  if (click) pending = { click, landing: url.pathname };
  if (consentGranted()) persistAttribution(true);
}

/** Μετά την απάντηση στο banner (και σε κάθε σελίδα με συγκατάθεση). */
export function persistAttribution(granted: boolean) {
  if (!granted) {
    writeCookie("", 0);
    pending = null;
    return;
  }
  const prev = parseAttrCookie(readCookie());
  const next = mergeAttribution(prev, pending?.click ?? null, Date.now(), pending?.landing ?? location.pathname);
  pending = null;
  // Γράφεται και χωρίς κλικ: το ίδιο το cookie λέει στον server ότι υπάρχει συγκατάθεση.
  writeCookie(encodeURIComponent(JSON.stringify(next)), ATTR_MAX_AGE_DAYS * 86_400);
}
