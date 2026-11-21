/**
 * Google Ads Customer Match upload file.
 *
 * Google's own template: comma-separated, these exact English headers, phone in
 * E.164 (+30…). Google hashes the values itself on upload. Only people who
 * ticked the checkout «offers» box and then confirmed by email belong here.
 */

export type CustomerMatchRow = {
  email: string;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  zip?: string | null;
};

const HEADER = ["Email", "Phone", "First Name", "Last Name", "Country", "Zip"];

/** E.164, or "" when the number can't be read with confidence (Google rejects guesses). */
export function toE164(raw: string | null | undefined, country = "GR"): string {
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) return /^\+\d{8,15}$/.test(digits) ? digits : "";
  // Greek national numbers: 10 digits, mobiles 69…, landlines 2…
  if (country === "GR" && /^(69|2)\d+$/.test(digits) && digits.length === 10) return `+30${digits}`;
  return "";
}

function cell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildCustomerMatchCsv(rows: CustomerMatchRow[]): string {
  const lines = rows.map((r) => {
    const country = (r.country ?? "GR").toUpperCase();
    return [
      r.email.trim().toLowerCase(),
      toE164(r.phone, country),
      r.firstName?.trim() ?? "",
      r.lastName?.trim() ?? "",
      country,
      r.zip?.replace(/\s+/g, "") ?? "",
    ]
      .map(cell)
      .join(",");
  });
  return [HEADER.join(","), ...lines].join("\r\n") + "\r\n";
}
