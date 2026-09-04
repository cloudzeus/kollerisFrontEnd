"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { subscribeNewsletter } from "@/lib/newsletter/subscribe";
import type { Locale } from "@/i18n/routing";

export type NewsletterFormState = { status: "idle" | "ok" | "error"; message: string };

/**
 * Η ενέργεια πίσω από τη φόρμα της αρχικής.
 *
 * Μέχρι τώρα η φόρμα δεν είχε `action` καθόλου: πατούσες «Εγγραφή» και η σελίδα
 * απλώς ξαναφόρτωνε. Το κατάστημα ζητούσε email και τα πετούσε.
 */
export async function subscribeAction(
  _prev: NewsletterFormState,
  formData: FormData,
): Promise<NewsletterFormState> {
  const email = String(formData.get("email") ?? "");
  const source = String(formData.get("source") ?? "home").slice(0, 32);

  /*
   * Honeypot. Ένα πεδίο αόρατο στον άνθρωπο και ελκυστικό στο bot· αν έχει
   * τιμή, απαντάμε με επιτυχία και δεν γράφουμε τίποτα. Το «επιτυχία» είναι
   * σκόπιμο: ένα μήνυμα σφάλματος διδάσκει το bot τι να αποφύγει.
   */
  if (String(formData.get("website") ?? "").length > 0) {
    return { status: "ok", message: "Ελέγξτε το email σας για να ολοκληρώσετε την εγγραφή." };
  }

  const h = await headers();
  const locale = (await getLocale()) as Locale;

  const result = await subscribeNewsletter({
    email,
    locale,
    source,
    // Πίσω από proxy η πραγματική IP είναι στο πρώτο βήμα της αλυσίδας.
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
  });

  if (!result.ok) {
    return {
      status: "error",
      message:
        result.error === "invalid_email"
          ? "Ελέγξτε τη διεύθυνση email — κάτι λείπει."
          : "Δεν καταφέραμε να στείλουμε το email επιβεβαίωσης. Δοκιμάστε ξανά σε λίγο.",
    };
  }

  return { status: "ok", message: "Ελέγξτε το email σας για να ολοκληρώσετε την εγγραφή." };
}
