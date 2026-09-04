import "server-only";
import { randomBytes } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { requestFingerprint, stampNow } from "@/lib/mail/request-context";
import { sendPasswordChangedEmail } from "@/lib/mail/account-emails";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * Forgotten passwords.
 *
 * Shares the token table with the registration invitation, because the two are
 * the same object with different intent: a single-use, expiring proof that
 * whoever holds it controls the mailbox. Two tables would be the same three
 * columns twice, and two ways to get expiry wrong.
 *
 * ── The reply is always the same ────────────────────────────────────────────
 *
 * An unknown address and a known one produce identical output and take a
 * similar time. A form that says "no account with that email" is a way of
 * asking whether somebody shops here, and the answer is worth having to anyone
 * assembling a list.
 *
 * ── Every session dies with the old password ────────────────────────────────
 *
 * A reset is what somebody does when they think their account is not theirs any
 * more. Leaving the existing sessions alive would mean the person who prompted
 * the reset stays signed in on their own machine, which defeats the point of
 * the exercise.
 */

/** Shorter than a registration link: a reset is something you asked for a minute ago. */
const TOKEN_TTL_HOURS = 2;

export type ResetOutcome = { ok: true } | { ok: false; error: string };

export async function requestPasswordReset(rawEmail: string): Promise<ResetOutcome> {
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@")) return { ok: false, error: "Συμπληρώστε το email σας." };
  if (!mailConfigured()) {
    return { ok: false, error: "Η αποστολή email δεν είναι διαθέσιμη αυτή τη στιγμή." };
  }

  const customer = await prisma.customer.findUnique({
    where: { email },
    select: { id: true, firstName: true, status: true },
  });

  /*
   * No account, or one that cannot sign in anyway. Same answer as success —
   * and no email, because sending "you have no account here" to an address
   * that never asked is both noise and a disclosure.
   */
  if (!customer || customer.status === "suspended" || customer.status === "rejected") {
    return { ok: true };
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.retailRegistrationToken.create({
    data: {
      email,
      token,
      purpose: "reset",
      accountType: "individual", // unused on this path; the account already exists
      expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000),
      sentAt: new Date(),
    },
  });

  const link = `${siteOrigin()}/eisodos/neos-kodikos/${token}`;

  /*
   * Ποιος ζήτησε την επαναφορά, από πού.
   * ───────────────────────────────────────────────────────────────────────────
   * Το template δείχνει αίτημα / συσκευή / IP ακριβώς για να μπορεί ο
   * παραλήπτης να καταλάβει ότι δεν το ζήτησε αυτός. Χωρίς αυτά, ένα email
   * «κάποιος ζήτησε νέο κωδικό» δεν δίνει τίποτα να συγκρίνει.
   *
   * Τοποθεσία δεν δηλώνεται: δεν υπάρχει geo-IP εδώ, και μια επινοημένη πόλη
   * σε μήνυμα ασφαλείας είναι χειρότερη από καμία.
   */
  const fingerprint = await requestFingerprint(await headers());

  const html = await renderTemplate("account-password-reset", {
    preheader: `Ο σύνδεσμος ισχύει για ${TOKEN_TTL_HOURS} ώρες.`,
    recipient: { first_name: customer.firstName ?? "", email },
    reset: {
      url: link,
      expires_in: `${TOKEN_TTL_HOURS} ώρες`,
      requested_at: stampNow(),
      device: fingerprint.device,
      location: fingerprint.location,
      ip: fingerprint.ip,
    },
  });

  const result = await sendMail({
    to: email,
    subject: "Επαναφορά κωδικού πρόσβασης",
    html,
    text: [
      "Επαναφορά κωδικού πρόσβασης — Kolleris",
      "",
      `Ορισμός νέου κωδικού: ${link}`,
      "",
      `Ισχύει για ${TOKEN_TTL_HOURS} ώρες και χρησιμοποιείται μία φορά.`,
      "Αν δεν τον ζητήσατε εσείς, αγνοήστε το μήνυμα — ο κωδικός σας δεν άλλαξε.",
    ].join("\n"),
  });

  if (!result.ok) {
    console.error(`[password-reset] ${email}: ${result.error}`);
    return { ok: false, error: "Δεν στάλθηκε το email. Δοκιμάστε ξανά σε λίγο." };
  }
  return { ok: true };
}

/** The email behind a reset link, or null when it is spent, expired or unknown. */
export async function resolveResetToken(token: string): Promise<{ email: string } | null> {
  const row = await prisma.retailRegistrationToken.findUnique({ where: { token } });
  if (!row || row.purpose !== "reset" || row.usedAt || row.expiresAt < new Date()) return null;
  return { email: row.email };
}

export type SetPasswordOutcome =
  | { ok: true }
  | { ok: false; error: string };

export async function setNewPassword(token: string, password: string): Promise<SetPasswordOutcome> {
  if (password.length < 8) {
    return { ok: false, error: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες." };
  }

  const resolved = await resolveResetToken(token);
  if (!resolved) {
    return { ok: false, error: "Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί." };
  }

  const customer = await prisma.customer.findUnique({
    where: { email: resolved.email },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!customer) return { ok: false, error: "Ο λογαριασμός δεν βρέθηκε." };

  const passwordHash = await hash(password);

  /*
   * One transaction: the new password, the spent token, and every existing
   * session. If the sessions survived a partial failure, the reset would have
   * changed the password while leaving whoever prompted it signed in.
   */
  await prisma.$transaction([
    prisma.customer.update({ where: { id: customer.id }, data: { passwordHash } }),
    prisma.retailRegistrationToken.update({ where: { token }, data: { usedAt: new Date() } }),
    prisma.customerSession.deleteMany({ where: { customerId: customer.id } }),
  ]);

  /*
   * Η ειδοποίηση αλλαγής φεύγει ΠΑΝΤΑ.
   * ───────────────────────────────────────────────────────────────────────────
   * Ακόμη κι όταν την αλλαγή την έκανε ο ίδιος ο κάτοχος — γιατί το νόημά της
   * είναι να φτάσει στον άνθρωπο που ΔΕΝ την έκανε. Ένας λογαριασμός που
   * κλάπηκε αλλάζει κωδικό χωρίς να το μάθει ποτέ ο ιδιοκτήτης του, αν το
   * μήνυμα παραλείπεται «επειδή το ξέρει ήδη».
   *
   * Μετά τη συναλλαγή και χωρίς να μπορεί να την αναιρέσει: ο κωδικός έχει ήδη
   * αλλάξει και οι συνεδρίες έχουν κλείσει, ό,τι κι αν πει το Mailgun.
   */
  await sendPasswordChangedEmail(
    {
      firstName: customer.firstName ?? "",
      lastName: customer.lastName ?? "",
      email: resolved.email,
    },
    await requestFingerprint(await headers()),
  );

  return { ok: true };
}
