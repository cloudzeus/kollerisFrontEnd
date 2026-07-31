/**
 * Opening hours — pure, so both the server badge and its tests can use it.
 *
 * Athens time, computed from the request's own clock. Rendering "ανοιχτά" from
 * a hardcoded string is the kind of small lie that costs a phone call at 21:00
 * and a customer who does not call again.
 */

export const HOURS = {
  /** Monday–Friday, 24h clock, Europe/Athens. */
  weekday: { open: 8, close: 16.5 },
  timezone: "Europe/Athens",
} as const;

const DAY_NAMES = [
  "Κυριακή",
  "Δευτέρα",
  "Τρίτη",
  "Τετάρτη",
  "Πέμπτη",
  "Παρασκευή",
  "Σάββατο",
];

export type OpenState = {
  open: boolean;
  /** "Ανοιχτά τώρα" / "Ανοίγει αύριο 08:00" — ready to render. */
  label: string;
  /** Local Athens time the state was computed at, `HH:MM`. */
  now: string;
  /** Minutes until the state flips, for the "κλείνει σε 20'" nudge. */
  minutesUntilChange: number;
};

/**
 * Reads the wall clock in Athens regardless of where the server runs.
 *
 * `Intl` rather than an offset constant: Greece observes DST, so a fixed +2 is
 * wrong for half the year and nobody notices until October.
 */
function athensParts(at: Date): { day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOURS.timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    day: days.indexOf(get("weekday")),
    // `24` shows up at midnight in some ICU versions.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
const fmt = (decimalHour: number) =>
  `${pad(Math.floor(decimalHour))}:${pad(Math.round((decimalHour % 1) * 60))}`;

export function openState(at: Date): OpenState {
  const { day, hour, minute } = athensParts(at);
  const now = hour + minute / 60;
  const isWeekday = day >= 1 && day <= 5;
  const { open: from, close: to } = HOURS.weekday;

  const isOpen = isWeekday && now >= from && now < to;

  if (isOpen) {
    return {
      open: true,
      label: `Ανοιχτά τώρα · μέχρι ${fmt(to)}`,
      now: `${pad(hour)}:${pad(minute)}`,
      minutesUntilChange: Math.round((to - now) * 60),
    };
  }

  // Walk forward to the next weekday opening. At most seven steps, so a
  // holiday-shaped rule added later cannot loop forever.
  let daysAhead = isWeekday && now < from ? 0 : 1;
  for (let i = 0; i < 7; i += 1) {
    const target = (day + daysAhead) % 7;
    if (target >= 1 && target <= 5) break;
    daysAhead += 1;
  }

  const when =
    daysAhead === 0 ? "σήμερα" : daysAhead === 1 ? "αύριο" : `τη ${DAY_NAMES[(day + daysAhead) % 7]}`;

  return {
    open: false,
    label: `Κλειστά · ανοίγει ${when} ${fmt(from)}`,
    now: `${pad(hour)}:${pad(minute)}`,
    minutesUntilChange: Math.round((daysAhead * 24 + from - now) * 60),
  };
}
