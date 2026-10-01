import "server-only";

import { clientAddress } from "@/lib/security/client-ip";

/**
 * Ποιος ζήτησε, από πού, πότε — για τα email ασφαλείας.
 *
 * Το `account-password-reset` δείχνει αίτημα / συσκευή / τοποθεσία (IP) όχι
 * για διακόσμηση: είναι τα μόνα στοιχεία που επιτρέπουν σε κάποιον να
 * καταλάβει ότι την επαναφορά ΔΕΝ τη ζήτησε ο ίδιος. Ένα «κάποιος ζήτησε νέο
 * κωδικό» χωρίς τίποτα να συγκρίνει είναι ειδοποίηση που δεν ειδοποιεί.
 *
 * ── Τι δεν κάνει ───────────────────────────────────────────────────────────
 *
 * Δεν επινοεί τοποθεσία. Δεν υπάρχει geo-IP εδώ, και μια πόλη μαντεμένη από
 * το πρόθεμα της διεύθυνσης, σε μήνυμα που ο παραλήπτης θα χρησιμοποιήσει για
 * να κρίνει αν κάποιος του κλέβει τον λογαριασμό, είναι χειρότερη από την
 * παραδοχή ότι δεν ξέρουμε.
 *
 * Δεν κρατά τίποτα. Τα στοιχεία μπαίνουν στο σώμα του email και τελειώνουν
 * εκεί — δεν γράφονται σε πίνακα και δεν στέλνονται στο Mailgun ως μεταδεδομένα.
 */

export type RequestFingerprint = {
  /** «Chrome σε Windows», ή «Άγνωστη συσκευή» όταν δεν δηλώνεται τίποτα. */
  device: string;
  /** Πάντα «Άγνωστη τοποθεσία» μέχρι να υπάρξει geo-IP. */
  location: string;
  ip: string;
};

/**
 * Το πρώτο όνομα που ταιριάζει κερδίζει, και η σειρά είναι σημαντική.
 *
 * Κάθε πρόγραμμα περιήγησης λέει ψέματα στο user-agent για συμβατότητα: ο
 * Edge γράφει «Chrome» και «Safari», ο Chrome γράφει «Safari». Ελέγχοντας από
 * το πιο ειδικό προς το πιο γενικό, το πρώτο εύρημα είναι το σωστό.
 */
const BROWSERS: [RegExp, string][] = [
  [/\bEdg[eA-Z]?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\/|\bChrome\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

const PLATFORMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "Mac"],
  [/\bLinux\b/, "Linux"],
];

function describeDevice(userAgent: string): string {
  if (!userAgent.trim()) return "Άγνωστη συσκευή";
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const platform = PLATFORMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && platform) return `${browser} σε ${platform}`;
  return browser ?? platform ?? "Άγνωστη συσκευή";
}

/**
 * Η διεύθυνση του επισκέπτη πίσω από Cloudflare και Traefik — από το
 * `security/client-ip.ts`, τον ίδιο κανόνα με το rate limit: το
 * `cf-connecting-ip` μόνο όταν το αίτημα ήρθε από διεύθυνση της Cloudflare,
 * αλλιώς ο peer του Traefik (`x-real-ip`). Το πρώτο στοιχείο του
 * `x-forwarded-for` το γράφει ο ίδιος ο πελάτης και δεν διαβάζεται πια.
 */
function clientIp(headers: Headers): string {
  return clientAddress(headers)?.slice(0, 45) || "άγνωστη";
}

export async function requestFingerprint(headers: Headers): Promise<RequestFingerprint> {
  return {
    device: describeDevice(headers.get("user-agent") ?? ""),
    location: "Άγνωστη τοποθεσία",
    ip: clientIp(headers),
  };
}

/** «04.09.2026, 11:42» — η μορφή που δείχνουν τα templates. */
export function stampNow(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Athens",
    /*
     * 24ωρο, ρητά.
     * Χωρίς αυτό το el-GR δίνει «03:01 μ.μ.» — και επειδή εδώ κρατάμε μόνο τα
     * μέρη `hour`/`minute` και πετάμε το `dayPeriod`, οι 15:01 γίνονταν 03:01.
     * Δώδεκα ώρες λάθος πάνω σε απόδειξη και σε ειδοποίηση ασφαλείας.
     */
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")}, ${get("hour")}:${get("minute")}`;
}
