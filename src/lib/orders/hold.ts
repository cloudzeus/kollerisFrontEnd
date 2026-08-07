/**
 * The stock-hold deadline, phrased for a person.
 *
 * Shared by the confirmation page and the order email, because the two are read
 * minutes apart by the same customer and a difference between them reads as a
 * mistake — which, until now, it was: the checkout said «3 εργάσιμες», the email
 * said the same, and the payment link Viva issued lasted seven days.
 *
 * «Σε 3 ώρες» would make the reader work out when the email was sent and do the
 * arithmetic, and an email is read whenever it is read. An absolute time does
 * not decay.
 *
 * Athens time, always: the order was placed in a Greek shop and will be paid
 * from a Greek banking app. The server's timezone would be right about the
 * instant and useless about the deadline.
 */
export function holdDeadline(until: Date, locale = "el-GR"): string {
  const at = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "Europe/Athens", ...opts }).format(until);

  const day = new Intl.DateTimeFormat(locale, {
    timeZone: "Europe/Athens",
    dateStyle: "short",
  });
  /*
   * 24-hour, explicitly.
   *
   * `el-GR` defaults to a 12-hour clock and renders "04:17 μ.μ." — which is
   * both unlike every Greek opening-hours sign and, ending in a full stop,
   * produces "…στις 04:17 μ.μ.." wherever the sentence adds its own.
   */
  const time = at({ hour: "2-digit", minute: "2-digit", hour12: false });

  return day.format(until) === day.format(new Date())
    ? `σήμερα στις ${time}`
    : `${at({ day: "numeric", month: "long" })} στις ${time}`;
}
