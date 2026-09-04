"use server";

import { headers } from "next/headers";
import { auth } from "@/auth";
import { assertCan } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { sendTest } from "@/lib/newsletter/send";
import { generateCampaignCopy, type AngleId, type GeneratedCopy } from "@/lib/newsletter/ai-copy";
import {
  renderCampaign,
  searchCampaignProducts,
  type CampaignPayload,
  type PickedProduct,
  type ProductFilters,
} from "@/lib/newsletter/campaign";

async function guard() {
  const session = await auth();
  assertCan(session?.user.role, "engagement");
  return session!.user;
}

export async function searchProductsAction(filters: ProductFilters): Promise<PickedProduct[]> {
  await guard();
  return searchCampaignProducts(filters);
}

/** Οι μάρκες που έχουν έστω ένα ενεργό προϊόν με εικόνα — τίποτα άλλο δεν έχει νόημα στο φίλτρο. */
export async function campaignBrandsAction(): Promise<Array<{ mtrmark: number; name: string }>> {
  await guard();
  const rows = await prisma.brand.findMany({
    where: { mtrmark: { not: null }, productCount: { gt: 0 } },
    select: { mtrmark: true, nameEl: true },
    orderBy: { productCount: "desc" },
    take: 40,
  });
  return rows
    .filter((r): r is { mtrmark: number; nameEl: string } => r.mtrmark != null)
    .map((r) => ({ mtrmark: r.mtrmark, name: r.nameEl }));
}

/**
 * Η προεπισκόπηση περνά από τον ΙΔΙΟ δρόμο με την αποστολή.
 *
 * Αν η προεπισκόπηση είχε δικό της μονοπάτι, θα έδειχνε κάτι που δεν είναι
 * αυτό που φεύγει — και θα το ανακάλυπτε κανείς αφού είχε φύγει.
 */
export async function previewCampaignAction(input: {
  templateId: string;
  payload: CampaignPayload;
}): Promise<string> {
  await guard();

  /*
   * Η προεπισκόπηση τραβά τα εικαστικά από τον server που την σερβίρει, όχι από
   * την παραγωγή. Στην ανάπτυξη τα αρχεία υπάρχουν τοπικά και όχι ακόμη στο
   * web.kolleris.com· χωρίς αυτό, το λογότυπο έβγαινε σπασμένο σε κάθε
   * προεπισκόπηση και θα το θεωρούσε κανείς σφάλμα του template.
   */
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  return renderCampaign(
    input.templateId,
    input.payload,
    {
      // Δείγμα ονόματος, ώστε να φαίνεται πώς κάθεται η προσωποποίηση στη σελίδα.
      first_name: "Νίκος",
      last_name: "Παπαδόπουλος",
      email: "nikos@example.gr",
    },
    host ? { assetOrigin: `${proto}://${host}` } : {},
  );
}

export async function saveCampaignAction(input: {
  id?: string;
  name: string;
  templateId: string;
  subject: string;
  preheader: string;
  payload: CampaignPayload;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await guard();
  if (!input.name.trim()) return { ok: false, error: "Δώστε όνομα στην καμπάνια." };
  if (!input.subject.trim()) return { ok: false, error: "Το θέμα του email δεν μπορεί να είναι κενό." };

  const data = {
    name: input.name.trim().slice(0, 160),
    templateId: input.templateId,
    subject: input.subject.trim().slice(0, 255),
    preheader: input.preheader.trim().slice(0, 500),
    payload: input.payload as unknown as object,
  };

  if (input.id) {
    const existing = await prisma.campaign.findUnique({ where: { id: input.id }, select: { status: true } });
    /*
     * Μια καμπάνια που έχει αρχίσει να φεύγει ΔΕΝ επεξεργάζεται. Οι μισοί
     * παραλήπτες θα είχαν πάρει την προηγούμενη εκδοχή και οι άλλοι μισοί τη
     * νέα, χωρίς να το ξέρει κανείς — και η αναφορά θα μετρούσε τα δύο μαζί.
     */
    if (existing && existing.status !== "draft") {
      return { ok: false, error: "Η καμπάνια έχει ήδη σταλεί και δεν αλλάζει." };
    }
    const updated = await prisma.campaign.update({ where: { id: input.id }, data });
    return { ok: true, id: updated.id };
  }

  const created = await prisma.campaign.create({
    data: { ...data, createdBy: user.email ?? user.name ?? null },
  });
  return { ok: true, id: created.id };
}

export type SubscriberRow = { id: string; email: string; name: string | null; createdAt: string };

/**
 * Αναζήτηση μέσα στη λίστα συνδρομητών.
 *
 * Χωρίς αυτό η επιλογή παραληπτών είναι «όλοι ή τίποτα». Με τέσσερις χιλιάδες
 * εγγεγραμμένους, η συχνή ανάγκη δεν είναι μαζική αποστολή — είναι «στείλε το
 * σε αυτούς τους δώδεκα του ναυπηγείου» ή «σε όποιον έχει @ ενός τομέα».
 *
 * Ψάχνει σε email ΚΑΙ σε όνομα: ο υπεύθυνος marketing θυμάται ονόματα, όχι
 * διευθύνσεις.
 */
export async function searchSubscribersAction(
  query: string,
  limit = 50,
): Promise<{ rows: SubscriberRow[]; total: number }> {
  await guard();
  const q = query.trim();
  const where = {
    status: "confirmed" as const,
    ...(q.length >= 2
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({
      where,
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.newsletterSubscriber.count({ where }),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString().slice(0, 10) })),
    total,
  };
}

/**
 * Δοκιμαστικό στον εαυτό σου, πριν φύγει σε χιλιάδες.
 *
 * Η προεπισκόπηση δείχνει το HTML σε iframe· δεν δείχνει πώς το αποδίδει το
 * Gmail, το Outlook ή το Mail του iPhone, ούτε αν το θέμα κόβεται στα
 * εισερχόμενα, ούτε αν κάτι σκόνταψε στα φίλτρα. Αυτά φαίνονται μόνο σε
 * πραγματικό γραμματοκιβώτιο.
 *
 * Προεπιλογή είναι η διεύθυνση του συνδεδεμένου χρήστη: η συχνή περίπτωση δεν
 * πρέπει να απαιτεί πληκτρολόγηση.
 */
export async function sendTestAction(input: {
  to?: string;
  templateId: string;
  subject: string;
  payload: CampaignPayload;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const user = await guard();
  const to = (input.to?.trim() || user.email || "").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    return { ok: false, error: "Δώστε έγκυρη διεύθυνση για το δοκιμαστικό." };
  }
  const res = await sendTest({ to, templateId: input.templateId, subject: input.subject, payload: input.payload });
  return res.ok ? { ok: true, to } : { ok: false, error: res.error };
}

/**
 * Παραγωγή κειμένων με DeepSeek.
 *
 * Επιστρέφει ΠΡΟΤΑΣΗ, όχι απόφαση: ο συντάκτης βλέπει τι βγήκε και διαλέγει αν
 * θα το εφαρμόσει. Τίποτα δεν αντικαθίσταται αυτόματα — κείμενο που άλλαξε μόνο
 * του, ενώ ο άνθρωπος κοίταζε αλλού, είναι ο πιο σίγουρος τρόπος να φύγει
 * καμπάνια που κανείς δεν διάβασε.
 */
export async function generateCopyAction(input: {
  angle: AngleId;
  products: PickedProduct[];
  validUntil: string;
}): Promise<{ ok: true; copy: GeneratedCopy } | { ok: false; error: string }> {
  await guard();
  try {
    return { ok: true, copy: await generateCampaignCopy(input) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    /*
     * Το «401 / invalid api key» ξεχωρίζει επίτηδες από τα υπόλοιπα σφάλματα.
     * Είναι ρύθμιση, όχι βλάβη, και το γενικό «η παραγωγή απέτυχε» στέλνει
     * κάποιον να ψάχνει τον κώδικα για μισή ώρα. Το κλειδί στο περιβάλλον ήταν
     * ήδη άκυρο όταν χτίστηκε αυτό (4 Σεπ 2026).
     */
    const invalidKey = /401|invalid|authentication fails/i.test(message);
    return {
      ok: false,
      error: message.includes("DEEPSEEK_API_KEY")
        ? "Το DEEPSEEK_API_KEY δεν έχει οριστεί σε αυτό το περιβάλλον."
        : invalidKey
          ? "Το DeepSeek απορρίπτει το κλειδί. Χρειάζεται νέο DEEPSEEK_API_KEY — δεν είναι πρόβλημα του κειμένου ή των προϊόντων."
          : `Η παραγωγή απέτυχε: ${message.slice(0, 160)}`,
    };
  }
}

/** Οι επιβεβαιωμένοι συνδρομητές — το κοινό που μπορεί να λάβει καμπάνια. */
export async function audienceCountAction(): Promise<{ confirmed: number }> {
  await guard();
  const confirmed = await prisma.newsletterSubscriber.count({ where: { status: "confirmed" } });
  return { confirmed };
}

/**
 * Καθαρίζει μια λίστα που ανέβασε ο χρήστης.
 *
 * Δέχεται CSV ή σκέτη επικόλληση. Ο έλεγχος γίνεται εδώ και όχι στον browser
 * γιατί το αποτέλεσμα — πόσοι πέρασαν, πόσοι κόπηκαν, πόσοι ήταν διπλοί —
 * είναι το μόνο που κάνει κάποιον να εμπιστευτεί ότι θα σταλεί σε αυτούς που
 * νομίζει.
 */
export async function parseRecipientListAction(raw: string): Promise<{
  valid: Array<{ email: string; name: string }>;
  invalid: string[];
  duplicates: number;
  unsubscribed: string[];
}> {
  await guard();
  const seen = new Set<string>();
  const valid: Array<{ email: string; name: string }> = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // «email» ή «email,Όνομα» ή «Όνομα,email» — δεχόμαστε και τις δύο σειρές.
    const parts = trimmed.split(/[;,\t]/).map((p) => p.trim());
    const email = (parts.find((p) => p.includes("@")) ?? "").toLowerCase();
    const name = parts.find((p) => p !== email && p.length > 0) ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      invalid.push(trimmed.slice(0, 80));
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    valid.push({ email, name });
  }

  /*
   * Όποιος έχει διαγραφεί ΔΕΝ ξαναμπαίνει επειδή ανέβηκε σε αρχείο. Η διαγραφή
   * είναι δήλωση του παραλήπτη, όχι κατάσταση μιας λίστας — και το να την
   * παρακάμπτει ένα upload είναι ακριβώς ο τρόπος που ένα κατάστημα γίνεται
   * spammer χωρίς να το θέλει.
   */
  const blocked = valid.length
    ? await prisma.newsletterSubscriber.findMany({
        where: { email: { in: valid.map((v) => v.email) }, status: { in: ["unsubscribed", "bounced"] } },
        select: { email: true },
      })
    : [];
  const blockedSet = new Set(blocked.map((b) => b.email));

  return {
    valid: valid.filter((v) => !blockedSet.has(v.email)),
    invalid,
    duplicates,
    unsubscribed: [...blockedSet],
  };
}
