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

/**
 * What to say, not the words to say it in.
 *
 * The function stays pure and language-free: it decides *that* the shop opens
 * tomorrow at 08:00, and the page decides how to phrase that in Greek, English
 * or Italian. A formatted Greek sentence in here was a translation nobody could
 * reach — and the tests are better for asserting the decision instead of the
 * wording.
 */
export type OpenLabel =
  | { state: "open"; until: string }
  // One literal per member, so `when` actually discriminates the union — with
  // `"today" | "tomorrow"` on a single member, ruling out "today" leaves the
  // member itself in play and `day` stays unreachable.
  | { state: "opens"; when: "today"; at: string }
  | { state: "opens"; when: "tomorrow"; at: string }
  | { state: "opens"; when: "day"; day: number; at: string };

export type OpenState = {
  open: boolean;
  label: OpenLabel;
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
      label: { state: "open", until: fmt(to) },
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

  // Not `at` — that is this function's own parameter, the clock it was given.
  const opensAt = fmt(from);
  const label: OpenLabel =
    daysAhead === 0
      ? { state: "opens", when: "today", at: opensAt }
      : daysAhead === 1
        ? { state: "opens", when: "tomorrow", at: opensAt }
        : { state: "opens", when: "day", day: (day + daysAhead) % 7, at: opensAt };

  return {
    open: false,
    label,
    now: `${pad(hour)}:${pad(minute)}`,
    minutesUntilChange: Math.round((daysAhead * 24 + from - now) * 60),
  };
}
