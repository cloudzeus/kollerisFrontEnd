/**
 * The language of a customer email — one decision, in one place.
 *
 * Until EU sales every customer email was Greek, and nothing chose a language.
 * The ruling (R-EMAIL-EN with R-EMAIL-CY): an order that ships abroad —
 * `shipCountry` neither Greece nor Cyprus — gets every customer email in
 * English, whatever the site locale it was placed from. Greece and Cyprus keep
 * the shop's language (Greek: the order stores no locale, and the emails have
 * only ever had the one). The shop's own notification stays Greek and does not
 * ask this.
 *
 * An explicit locale (an admin preview, a caller that knows better) wins over
 * the country.
 *
 * Pure: no server-only imports, so the tests and the templates can use it.
 */

export type EmailLocale = "el" | "en";

/** The countries whose customers read Greek: Greece, and Cyprus (R-EMAIL-CY). */
const GREEK_READING = new Set(["GR", "CY"]);

/** Shipped abroad: not Greece, not Cyprus. An order with no country is Greek. */
export function isForeignDestination(shipCountry: string | null | undefined): boolean {
  const country = (shipCountry ?? "").trim().toUpperCase();
  if (!country) return false;
  return !GREEK_READING.has(country);
}

export function emailLocale(
  order: { shipCountry?: string | null },
  explicit?: EmailLocale | null,
): EmailLocale {
  if (explicit === "el" || explicit === "en") return explicit;
  return isForeignDestination(order.shipCountry) ? "en" : "el";
}

/** `t("Ελληνικά", "English")` — the pair stays side by side where it is used. */
export function pick(locale: EmailLocale) {
  return (el: string, en: string): string => (locale === "en" ? en : el);
}

/** `12,30 €` for Greek readers, `€12.30` for English ones. */
export function formatMoney(locale: EmailLocale, value: unknown): string {
  const fixed = Number(value).toFixed(2);
  return locale === "en" ? `€${fixed}` : `${fixed.replace(".", ",")} €`;
}

/** «04.09.2026, 10:12» (Athens, 24 h) — the same shape in both languages. */
export function formatStamp(locale: EmailLocale, date: Date, withTime = true): string {
  const parts = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "el-GR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Athens",
    /* 24 h, explicitly: el-GR otherwise gives «03:01 μ.μ.», and dropping the day period turned 15:01 into 03:01. */
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = `${get("day")}.${get("month")}.${get("year")}`;
  return withTime ? `${day}, ${get("hour")}:${get("minute")}` : day;
}

const SHIPPING_EN: Record<string, string> = {
  courier: "ACS Courier",
  express: "ACS Express",
  pickup: "Pick up from Piraeus",
  dhl: "DHL Express",
};

const PAYMENT_EN: Record<string, string> = {
  card: "Card",
  iris: "IRIS",
  bank: "Bank transfer",
  cod: "Cash on delivery",
};

/** English label of a shipping method id; unknown ids are shown as they are. */
export function shippingLabelEn(id: string): string {
  return SHIPPING_EN[id] ?? id;
}

/** English label of a payment method id; unknown ids are shown as they are. */
export function paymentLabelEn(id: string): string {
  return PAYMENT_EN[id] ?? id;
}

/**
 * The status names HDCtool sends in `order-status` (it sends the SoftOne
 * state's own name, in Greek). Known ones are translated for an English email;
 * any other is shown as received.
 */
const STATUS_EN: Record<string, string> = {
  "Σε επεξεργασία": "Processing",
  "Σε αναμονή": "On hold",
  "Έτοιμη για αποστολή": "Ready to ship",
  "Εστάλη": "Shipped",
  "Απεστάλη": "Shipped",
  "Παραδόθηκε": "Delivered",
  "Ολοκληρώθηκε": "Completed",
  "Ακυρώθηκε": "Cancelled",
};

export function statusNameEn(name: string): string {
  return STATUS_EN[name.trim()] ?? name;
}
