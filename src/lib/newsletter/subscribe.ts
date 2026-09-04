import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/mail/templates";
import { sendMail } from "@/lib/mail/client";
import { siteOrigin } from "@/lib/seo/urls";
import type { Locale } from "@/i18n/routing";

/**
 * Εγγραφή στο newsletter, με διπλή επιβεβαίωση.
 *
 * ── Γιατί double opt-in και όχι απευθείας ──────────────────────────────────
 *
 * Επειδή οποιοσδήποτε μπορεί να γράψει το email οποιουδήποτε άλλου. Χωρίς
 * επιβεβαίωση, το κατάστημα γίνεται εργαλείο για να λαμβάνει κάποιος τρίτος
 * διαφημιστικά που δεν ζήτησε — και η ευθύνη είναι δική μας, όχι εκείνου που
 * το πληκτρολόγησε. Πρακτικά μετράει και για την παραδοσιμότητα: μια λίστα
 * χωρίς επιβεβαίωση γεμίζει με λάθος διευθύνσεις, τα bounces ανεβαίνουν, και ο
 * τομέας αρχίζει να πηγαίνει στα ανεπιθύμητα για όλους.
 */

const TOKEN_HOURS = 48;

/** Το κείμενο που εξηγεί τι θα λαμβάνει. Ίδιο με το δείγμα του template. */
const WHAT = [
  {
    index: "01",
    title: "Προσφορες",
    text: "Εκπτώσεις ανά brand και κατηγορία, με ημερομηνία λήξης και πραγματικό απόθεμα.",
  },
  {
    index: "02",
    title: "Νεα",
    text: "Νέα brands, νέοι κωδικοί, αλλαγές σε παραδόσεις και υπηρεσίες. Μία φορά τον μήνα.",
  },
  {
    index: "03",
    title: "Ανακοινωσεις",
    text: "Ωράριο, τιμοκατάλογοι, αργίες. Μόνο όταν χρειάζεται.",
  },
];

export type SubscribeResult =
  | { ok: true; state: "sent" | "already" }
  | { ok: false; error: string };

/**
 * Η ίδια απάντηση σε κάθε περίπτωση επιτυχίας — σκόπιμα.
 *
 * Αν λέγαμε «είστε ήδη εγγεγραμμένος», η φόρμα θα γινόταν ελεγκτής: πληκτρολογείς
 * μια διεύθυνση και μαθαίνεις αν ο άνθρωπος είναι πελάτης μας. Η διαφορά
 * `sent`/`already` μένει για τα logs, όχι για την οθόνη.
 */
export async function subscribeNewsletter(input: {
  email: string;
  name?: string | null;
  locale?: Locale;
  source?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<SubscribeResult> {
  const email = input.email.trim().toLowerCase();
  // Σκόπιμα χαλαρός: ο σκοπός είναι να κοπούν τα προφανώς άκυρα, όχι να
  // περάσει η φόρμα διαγωνισμό RFC. Το πραγματικό φίλτρο είναι η επιβεβαίωση.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 320) {
    return { ok: false, error: "invalid_email" };
  }

  const existing = await prisma.newsletterSubscriber.findUnique({ where: { email } });
  if (existing?.status === "confirmed") {
    return { ok: true, state: "already" };
  }

  const token = randomBytes(24).toString("base64url");
  const subscriber = await prisma.newsletterSubscriber.upsert({
    where: { email },
    create: {
      email,
      name: input.name?.trim() || null,
      locale: input.locale ?? "el",
      source: input.source ?? "home",
      confirmToken: token,
      consentIp: input.ip ?? null,
      consentUserAgent: input.userAgent?.slice(0, 255) ?? null,
    },
    update: {
      /*
       * Νέο token σε κάθε προσπάθεια. Κάποιος που ξαναγράφεται επειδή δεν βρήκε
       * το πρώτο email πρέπει να μπορεί να χρησιμοποιήσει το δεύτερο — και το
       * πρώτο να πάψει να ισχύει.
       */
      confirmToken: token,
      status: existing?.status === "unsubscribed" ? "pending" : existing?.status ?? "pending",
      name: input.name?.trim() || existing?.name || null,
      consentIp: input.ip ?? existing?.consentIp ?? null,
      consentUserAgent: input.userAgent?.slice(0, 255) ?? existing?.consentUserAgent ?? null,
      updatedAt: new Date(),
    },
  });

  const html = await renderTemplate("newsletter-confirm", {
    recipient: { email: subscriber.email, first_name: subscriber.name ?? "", last_name: "" },
    subscribe: {
      confirm_url: `${siteOrigin()}/newsletter/epibebaiosi/${token}`,
      expires_in: `${TOKEN_HOURS} ώρες`,
    },
    what: WHAT,
    preheader: "Ένα κλικ και τελειώσαμε. Χωρίς επιβεβαίωση δεν στέλνουμε τίποτα.",
  });

  const sent = await sendMail({
    to: subscriber.email,
    subject: "Επιβεβαιώστε την εγγραφή σας στο newsletter",
    html,
    text:
      "Επιβεβαιώστε την εγγραφή σας στο newsletter του Kolleris:\n" +
      `${siteOrigin()}/newsletter/epibebaiosi/${token}\n\n` +
      `Ο σύνδεσμος ισχύει για ${TOKEN_HOURS} ώρες. Αν δεν ζητήσατε εγγραφή, αγνοήστε το μήνυμα.`,
  });

  if (!sent.ok) {
    console.error("[newsletter] confirm mail failed", sent.error);
    return { ok: false, error: "mail_failed" };
  }
  return { ok: true, state: "sent" };
}

/** Το token είναι μιας χρήσης: καίγεται μόλις πετύχει. */
export async function confirmSubscription(token: string): Promise<"confirmed" | "invalid"> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return "invalid";
  const subscriber = await prisma.newsletterSubscriber.findUnique({ where: { confirmToken: token } });
  if (!subscriber) return "invalid";

  const ageHours = (Date.now() - subscriber.updatedAt.getTime()) / 36e5;
  if (ageHours > TOKEN_HOURS) return "invalid";

  await prisma.newsletterSubscriber.update({
    where: { id: subscriber.id },
    data: { status: "confirmed", confirmedAt: new Date(), confirmToken: null },
  });
  return "confirmed";
}

/**
 * Διαγραφή με email, όχι με token.
 *
 * Ο σύνδεσμος διαγραφής στα εμπορικά email είναι το `%unsubscribe_url%` της
 * Mailgun, που τη χειρίζεται εκείνη. Αυτό εδώ είναι για όποιον φτάσει από
 * αλλού — και δεν αποκαλύπτει αν η διεύθυνση υπήρχε: η απάντηση είναι ίδια.
 */
export async function unsubscribeByEmail(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  await prisma.newsletterSubscriber.updateMany({
    where: { email: clean, status: { in: ["pending", "confirmed"] } },
    data: { status: "unsubscribed", unsubscribedAt: new Date(), confirmToken: null },
  });
}
