"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { routing } from "@/i18n/routing";
import { isValidAfm, normaliseAfm } from "@/lib/account/vat";

/**
 * Contact form submission.
 *
 * Writes a row. There is no mail service configured, and a form that collects a
 * message and drops it is worse than no form at all — the `/admin` inbox reads
 * this table, and email later becomes a notification on top of the row rather
 * than a replacement for it.
 */

export type ContactState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

const TOPICS = ["technical", "quote", "partnership", "order", "other"] as const;

const schema = z.object({
  topic: z.enum(TOPICS),
  name: z.string().trim().min(2, "Συμπληρώστε το όνομά σας").max(200),
  email: z.email("Μη έγκυρο email").max(320),
  phone: z.string().trim().max(64).optional().or(z.literal("")),
  company: z.string().trim().max(255).optional().or(z.literal("")),
  vatNumber: z.string().trim().max(32).optional().or(z.literal("")),
  subject: z.string().trim().min(3, "Συμπληρώστε ένα θέμα").max(255),
  message: z.string().trim().min(10, "Γράψτε λίγο περισσότερα — τουλάχιστον 10 χαρακτήρες").max(5000),
  orderRef: z.string().trim().max(32).optional().or(z.literal("")),
  pagePath: z.string().trim().max(512).optional().or(z.literal("")),
  locale: z.string().max(5).optional(),
  /** Honeypot — must stay empty. */
  website: z.string().max(0).optional().or(z.literal("")),
});

export async function submitContact(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { fieldErrors, error: "Ελέγξτε τα σημειωμένα πεδία." };
  }

  const input = parsed.data;

  /*
   * Honeypot. A field hidden from people and irresistible to naive bots — it
   * costs nothing, needs no third-party script, and stops the traffic that a
   * public form on a Greek trade site actually gets. It is checked AFTER the
   * schema so a bot cannot tell a rejection apart from a validation error.
   */
  if (input.website) return { ok: true };

  const afm = input.vatNumber ? normaliseAfm(input.vatNumber) : "";
  if (input.topic === "partnership" && afm && !isValidAfm(afm)) {
    return { fieldErrors: { vatNumber: "Το ΑΦΜ δεν είναι έγκυρο (9 ψηφία)" } };
  }

  try {
    await prisma.contactMessage.create({
      data: {
        topic: input.topic,
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        company: input.company || null,
        vatNumber: afm || null,
        subject: input.subject,
        message: input.message,
        orderRef: input.orderRef || null,
        pagePath: input.pagePath || null,
        locale: routing.locales.includes(input.locale as never)
          ? (input.locale as "el" | "en" | "it")
          : "el",
      },
    });
  } catch (error) {
    console.error("[contact]", error);
    return { error: "Δεν καταχωρήθηκε το μήνυμα. Δοκιμάστε ξανά ή καλέστε μας." };
  }

  return { ok: true };
}
