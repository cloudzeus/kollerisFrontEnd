import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * Has this account shown that it controls its email address?
 *
 * ── Why it matters ──────────────────────────────────────────────────────────
 *
 * Guest orders are matched to an account by email. The direct registration
 * form signs a person in at once and never checks the address, so anyone could
 * register with somebody else's email and open that person's guest orders:
 * name, delivery address, phone, what they bought. The email match is only
 * safe once the address is proven.
 *
 * ── What counts as proof ────────────────────────────────────────────────────
 *
 * A link that reached the mailbox and was followed. Every such link is a row
 * in `retail_registration_tokens` with `usedAt` set, whatever its purpose:
 * `register` (claimed an account from an order), `reset` (set a new password)
 * or `verify` (the button on the orders page). A company member who accepted
 * an emailed invitation has proven it too.
 *
 * No column on `customers`: the proof already exists as a used link, and a
 * second copy of it is a second thing to keep in step.
 */
export async function hasProvenEmail(email: string): Promise<boolean> {
  const address = email.trim().toLowerCase();
  const [link, invite] = await Promise.all([
    prisma.retailRegistrationToken.findFirst({
      where: { email: address, usedAt: { not: null } },
      select: { id: true },
    }),
    prisma.customerInvite.findFirst({
      where: { email: { equals: address, mode: "insensitive" }, acceptedAt: { not: null } },
      select: { id: true },
    }),
  ]);
  return Boolean(link || invite);
}

const TOKEN_TTL_HOURS = 72;
/** A second click within this window does not send a second email. */
const RESEND_AFTER_MINUTES = 10;

export type ProofRequestOutcome = { ok: true } | { ok: false; error: string };

/** Email the signed-in customer a link that proves the address. */
export async function requestEmailProof(customerId: string): Promise<ProofRequestOutcome> {
  if (!mailConfigured()) {
    return { ok: false, error: "Η αποστολή email δεν είναι διαθέσιμη αυτή τη στιγμή." };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { email: true, firstName: true, lastName: true },
  });
  if (!customer) return { ok: false, error: "Ο λογαριασμός δεν βρέθηκε." };

  const email = customer.email.toLowerCase();
  if (await hasProvenEmail(email)) return { ok: true };

  const recent = await prisma.retailRegistrationToken.findFirst({
    where: {
      email,
      purpose: "verify",
      usedAt: null,
      sentAt: { gt: new Date(Date.now() - RESEND_AFTER_MINUTES * 60_000) },
    },
    select: { id: true },
  });
  if (recent) return { ok: true };

  const token = randomBytes(32).toString("base64url");
  await prisma.retailRegistrationToken.create({
    data: {
      email,
      token,
      purpose: "verify",
      accountType: "individual", // unused on this path; the account already exists
      expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000),
      sentAt: new Date(),
    },
  });

  const link = `${siteOrigin()}/logariasmos/epivevaiosi-email/${token}`;
  const html = await renderTemplate("account-verify", {
    preheader: `Επιβεβαιώστε το email σας. Ο σύνδεσμος ισχύει ${TOKEN_TTL_HOURS} ώρες.`,
    recipient: { first_name: customer.firstName, last_name: customer.lastName, email },
    verify: {
      url: link,
      expires_in: `${TOKEN_TTL_HOURS} ώρες`,
      cta: "Επιβεβαιωση email",
      lead:
        "Επιβεβαιώστε ότι αυτό το email είναι δικό σας. Μετά θα βρείτε στον λογαριασμό " +
        "σας και τις παραγγελίες που κάνατε ως επισκέπτης με αυτό το email.",
      note:
        "Αν δεν το ζητήσατε εσείς, αγνοήστε αυτό το email — δεν αλλάζει τίποτα στον " +
        "λογαριασμό σας και ο σύνδεσμος λήγει από μόνος του.",
    },
  });

  const result = await sendMail({
    to: email,
    subject: "Επιβεβαίωση email — Kolleris",
    html,
    text: [
      "Επιβεβαίωση email — Kolleris",
      "",
      `Επιβεβαίωση: ${link}`,
      "",
      `Ο σύνδεσμος ισχύει για ${TOKEN_TTL_HOURS} ώρες. Αν δεν τον ζητήσατε, αγνοήστε το μήνυμα.`,
    ].join("\n"),
  });

  if (!result.ok) {
    console.error(`[email-proof] ${email}: ${result.error}`);
    return { ok: false, error: "Δεν στάλθηκε το email. Δοκιμάστε ξανά σε λίγο." };
  }
  return { ok: true };
}

/**
 * Spend a proof link and adopt the guest orders placed with that address.
 *
 * Returns null when the link is spent, expired, unknown, or its account no
 * longer exists. The token and the adoption go in one transaction, so a used
 * link never leaves the orders behind.
 */
export async function confirmEmailProof(token: string): Promise<{ adopted: number } | null> {
  const row = await prisma.retailRegistrationToken.findUnique({ where: { token } });
  if (!row || row.purpose !== "verify" || row.usedAt || row.expiresAt < new Date()) return null;

  const customer = await prisma.customer.findUnique({
    where: { email: row.email },
    select: { id: true },
  });
  if (!customer) return null;

  const [, adopted] = await prisma.$transaction([
    prisma.retailRegistrationToken.update({ where: { token }, data: { usedAt: new Date() } }),
    prisma.order.updateMany({
      where: { customerId: null, email: { equals: row.email, mode: "insensitive" } },
      data: { customerId: customer.id },
    }),
  ]);
  return { adopted: adopted.count };
}
