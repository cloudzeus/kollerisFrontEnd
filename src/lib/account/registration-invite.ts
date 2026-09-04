import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";
import { siteOrigin } from "@/lib/seo/urls";

/**
 * Claiming an account after you have already bought.
 *
 * A retail customer buys as a guest, buys again, and then decides they would
 * like to see their orders in one place. They have no password and we will not
 * invent one for them — so they prove who they are with two things they
 * already hold: the email they ordered with, and one of their order numbers.
 * A link goes to that email; following it is what creates the account.
 *
 * The order number is the proof and it has to be. An email address alone is
 * public enough that anyone could ask for a link to somebody else's; an order
 * number alone is a sequence anybody can count up. Together they mean the
 * person asking placed that order, and the link still lands in the mailbox
 * rather than in the browser, so guessing both wins nothing.
 *
 * ── Nothing here touches the ERP ────────────────────────────────────────────
 *
 * No TRDR, by decision. `ensureRetailCustomerInSoftOne` exists so a document
 * can be issued; an account exists so a person can see their orders. Binding
 * them would make every account decision inherit an ERP matching rule — and
 * the ERP already holds 260 duplicate retail customers from an earlier
 * integration. Orders are adopted by EMAIL.
 *
 * ── The reply never says which half was wrong ───────────────────────────────
 *
 * Right email, wrong order number and unknown email produce the same answer.
 * Anything else turns this form into a way of asking "does this person shop
 * here", which is not a question a stranger gets to ask.
 */

/** Long enough to reach somebody who reads mail once a day, short enough to expire. */
const TOKEN_TTL_HOURS = 72;

export type InviteRequest = { email: string; orderNumber: string };

export type InviteOutcome =
  /** Sent, or would have been. Deliberately indistinguishable from a miss. */
  | { ok: true }
  /** Only for reasons that are not about whether the person exists. */
  | { ok: false; error: string };

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Ask for a registration link.
 *
 * Returns success whether or not anything matched — see the note above. Real
 * failures (no mail system) are reported, because those are ours.
 */
export async function requestRegistrationLink(input: InviteRequest): Promise<InviteOutcome> {
  const email = input.email.trim().toLowerCase();
  const orderNumber = input.orderNumber.trim().toUpperCase();

  if (!email.includes("@") || orderNumber.length < 4) {
    return { ok: false, error: "Συμπληρώστε email και κωδικό παραγγελίας." };
  }
  if (!mailConfigured()) {
    return { ok: false, error: "Η αποστολή email δεν είναι διαθέσιμη αυτή τη στιγμή." };
  }

  const order = await prisma.order.findFirst({
    where: {
      orderNumber,
      email: { equals: email, mode: "insensitive" },
      status: { notIn: ["CANCELLED", "FAILED"] },
    },
    select: {
      orderNumber: true,
      email: true,
      firstName: true,
      lastName: true,
      wantsInvoice: true,
      vatNumber: true,
      customerId: true,
    },
  });

  // No match, or the order already belongs to an account. Same answer either
  // way; somebody who already has an account should be signing in, and being
  // told "you already have one" tells a stranger the same thing.
  if (!order || order.customerId) return { ok: true };

  const existing = await prisma.customer.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: true };

  /*
   * Which account this becomes.
   *
   * A buyer who asked for an invoice against a ΑΦΜ is not a retail customer.
   * Handing them a retail account would cost them partner pricing, credit and
   * an invoice; handing a private buyer a company one would put them in an
   * approval queue they never asked to join.
   */
  const accountType = order.wantsInvoice && (order.vatNumber ?? "").replace(/\D/g, "").length === 9
    ? "company"
    : "individual";

  const token = newToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 3600_000);

  await prisma.retailRegistrationToken.create({
    data: { email, token, orderNumber: order.orderNumber, accountType, expiresAt, sentAt: new Date() },
  });

  const link = `${siteOrigin()}/eggrafi/${token}`;
  const name = `${order.firstName} ${order.lastName}`.trim();

  /*
   * Το `account-verify` του design system, με τα δικά μας λόγια.
   * ───────────────────────────────────────────────────────────────────────────
   * Η σχεδίαση είναι σωστή όπως είναι — σύνδεσμος μίας χρήσης που ανοίγει τον
   * λογαριασμό — αλλά η προεπιλεγμένη διατύπωσή της («δημιουργήσατε λογαριασμό
   * … ένα κλικ και ενεργοποιείται») δεν ισχύει εδώ: αυτός ο άνθρωπος ΔΕΝ έφτιαξε
   * λογαριασμό, αγόρασε ως επισκέπτης και τώρα τον διεκδικεί πάνω στην
   * παραγγελία του. Και το κουμπί δεν επιβεβαιώνει email — ορίζει κωδικό.
   *
   * Γι' αυτό το template δέχεται `verify.lead` και `verify.cta` με προεπιλογές
   * τα σχεδιασμένα κείμενα: η σχεδίαση μένει ακέραιη, και το μήνυμα λέει το
   * αληθές.
   *
   * Κωδικός 6 ψηφίων δεν στέλνεται — δεν υπάρχει σελίδα που να τον δέχεται.
   * Το template πέφτει μόνο του στην αντιγραφή του συνδέσμου.
   */
  const html = await renderTemplate("account-verify", {
    preheader: `Ορίστε κωδικό και δείτε όλες τις παραγγελίες σας. Ο σύνδεσμος ισχύει ${TOKEN_TTL_HOURS} ώρες.`,
    recipient: { first_name: order.firstName, last_name: order.lastName, email: order.email },
    verify: {
      url: link,
      expires_in: `${TOKEN_TTL_HOURS} ώρες`,
      cta: "Ορισμος κωδικου",
      lead:
        `${name ? `${name}, ζ` : "Ζ"}ητήσατε πρόσβαση στον λογαριασμό σας με βάση την ` +
        `παραγγελία ${order.orderNumber}. Επιλέξτε κωδικό και θα βρείτε εκεί όλες τις ` +
        "παραγγελίες που έχετε κάνει με αυτό το email — όχι μόνο αυτή που δηλώσατε.",
      /* Η προεπιλογή του template μιλά για λογαριασμό που «διαγράφεται σε 7
         ημέρες». Εδώ δεν έχει δημιουργηθεί λογαριασμός — ο σύνδεσμος είναι που
         τον δημιουργεί — οπότε η προεπιλογή θα ήταν αναληθής. */
      note:
        "Αγνοήστε αυτό το email — δεν δημιουργήθηκε λογαριασμός και δεν άλλαξε " +
        "τίποτα στις παραγγελίες σας. Ο σύνδεσμος λήγει από μόνος του.",
    },
  });

  const result = await sendMail({
    to: order.email,
    subject: "Ολοκληρώστε την εγγραφή σας — Kolleris",
    html,
    text: [
      "Ολοκληρώστε την εγγραφή σας — Kolleris",
      "",
      `Παραγγελία: ${order.orderNumber}`,
      "",
      `Ορισμός κωδικού: ${link}`,
      "",
      `Ο σύνδεσμος ισχύει για ${TOKEN_TTL_HOURS} ώρες. Αν δεν τον ζητήσατε, αγνοήστε το μήνυμα.`,
    ].join("\n"),
  });

  if (!result.ok) {
    console.error(`[registration-invite] ${email}: ${result.error}`);
    return { ok: false, error: "Δεν στάλθηκε το email. Δοκιμάστε ξανά σε λίγο." };
  }

  return { ok: true };
}

export type ResolvedInvite = {
  email: string;
  accountType: "individual" | "company";
  orderNumber: string | null;
  firstName: string;
  lastName: string;
  phone: string;
};

/** The invitation behind a link, or null when it is spent, expired or unknown. */
export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  const row = await prisma.retailRegistrationToken.findUnique({ where: { token } });
  if (!row || row.usedAt || row.expiresAt < new Date()) return null;

  // Already claimed some other way since the link was sent.
  const taken = await prisma.customer.findUnique({
    where: { email: row.email },
    select: { id: true },
  });
  if (taken) return null;

  /*
   * The details are read from the ORDER, not from the token.
   *
   * The customer typed them at checkout and they are the ones on the parcel;
   * copying them into the token as well would be a second version to keep in
   * step. The token holds only what identifies the invitation.
   */
  const order = row.orderNumber
    ? await prisma.order.findUnique({
        where: { orderNumber: row.orderNumber },
        select: { firstName: true, lastName: true, phone: true },
      })
    : null;

  return {
    email: row.email,
    accountType: row.accountType === "company" ? "company" : "individual",
    orderNumber: row.orderNumber,
    firstName: order?.firstName ?? "",
    lastName: order?.lastName ?? "",
    phone: order?.phone ?? "",
  };
}

/**
 * Spend the invitation and adopt what the customer already bought.
 *
 * Called after `register()` has created the account. Both writes go in one
 * transaction: a token marked used with the orders left unattached would
 * strand a customer in an empty account with no way back to their history.
 */
export async function completeInvite(token: string, customerId: string, email: string) {
  const [, adopted] = await prisma.$transaction([
    prisma.retailRegistrationToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
    /*
     * Every past order with this address, not only the one that proved it.
     * Matching on email is the whole point: the customer bought three times as
     * a guest and expects to find three orders, not the one they happened to
     * quote.
     */
    prisma.order.updateMany({
      where: { email: { equals: email, mode: "insensitive" }, customerId: null },
      data: { customerId },
    }),
  ]);

  return { adopted: adopted.count };
}
