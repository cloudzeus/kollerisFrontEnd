/**
 * Ποια μέρα θα περάσει ο διανομέας.
 *
 * ── Τι έστελνε πριν ────────────────────────────────────────────────────────
 *
 * `new Date().toISOString().slice(0, 10)` — δηλαδή η μέρα σε **UTC**, πάντα
 * σήμερα. Δύο λάθη σε μία γραμμή:
 *
 * Από τα μεσάνυχτα ως τις 03:00 ώρα Ελλάδας το UTC είναι ακόμη ΧΘΕΣ, οπότε το
 * αποστολικό γραφόταν για μέρα που είχε ήδη τελειώσει.
 *
 * Και ο διανομέας της ACS περνά νωρίς το απόγευμα: παραγγελία που πακετάρεται
 * στις 18:00 δεν προλαβαίνει τη σημερινή παραλαβή. Το αποστολικό μένει
 * «άτυπωτο» στην ACS και το δέμα κάθεται στην αποθήκη ώσπου να το προσέξει
 * κάποιος — δεν βγαίνει σφάλμα πουθενά.
 *
 * ── Ο κανόνας ──────────────────────────────────────────────────────────────
 *
 * Μετά τις 15:30 ώρα Ελλάδας, επόμενη μέρα. Ποτέ Σάββατο ή Κυριακή — και αυτό
 * ισχύει ΚΑΙ πριν την ώρα λήξης: παραγγελία που πακετάρεται Σάββατο πρωί δεν
 * παραλαμβάνεται το ίδιο πρωί.
 *
 * Αργίες δεν πιάνει: δεν υπάρχει πηγή τους εδώ, και μια χειρόγραφη λίστα που
 * ξεχνιέται τον επόμενο χρόνο είναι χειρότερη από το τίποτα.
 *
 * Το ίδιο ζει και στο HDCtool (`acs-pickup-datetime`), γιατί εκδίδουν
 * αποστολικά και τα δύο. Δεν μοιράζονται κώδικα· μοιράζονται τον κανόνα.
 */

const DAY_MS = 86_400_000;
const CUTOFF_MINUTES = 15 * 60 + 30;

/** Μετά από αυτή την ώρα, η παραλαβή πάει στην επόμενη εργάσιμη. */
export const ACS_PICKUP_CUTOFF = "15:30";

const ATHENS_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Athens",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function athensParts(now: Date) {
  const p: Record<string, string> = {};
  for (const part of ATHENS_PARTS.formatToParts(now)) p[part.type] = part.value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
  };
}

/** Η σημερινή ημερομηνία στην Ελλάδα. `YYYY-MM-DD`. */
export function athensToday(now: Date = new Date()): string {
  const { year, month, day } = athensParts(now);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** Σε ποια μέρα ανήκει μια στιγμή, με το ημερολόγιο της Ελλάδας. */
export function athensDayOf(when: Date): string {
  return athensToday(when);
}

/** Η επόμενη ημέρα παραλαβής. `YYYY-MM-DD`. */
export function acsPickupDateFor(now: Date = new Date()): string {
  const { year, month, day, hour, minute } = athensParts(now);

  /* Αριθμητική πάνω σε UTC μεσάνυχτα: η πρόσθεση ημερών δεν επηρεάζεται από
     την αλλαγή θερινής ώρας, που αλλιώς θα έβγαζε 23ωρη ή 25ωρη «μέρα». */
  let t = Date.UTC(year, month - 1, day);
  if (hour * 60 + minute >= CUTOFF_MINUTES) t += DAY_MS;

  for (let guard = 0; guard < 7; guard += 1) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) break;
    t += DAY_MS;
  }

  return new Date(t).toISOString().slice(0, 10);
}
