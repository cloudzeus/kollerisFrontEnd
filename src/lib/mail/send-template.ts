import "server-only";
import { sendMail, mailConfigured } from "@/lib/mail/client";
import { renderTemplate } from "@/lib/mail/templates";

/**
 * Ένα email του design system, από γεγονός σε παραλήπτη.
 *
 * ── Γιατί υπάρχει ─────────────────────────────────────────────────────────
 *
 * Κάθε αποστολή είναι το ίδιο τρίπτυχο: απόδοση template, plain-text μέρος,
 * παράδοση στο Mailgun με reply-to. Γραμμένο δέκα φορές, οι δέκα εκδοχές
 * αρχίζουν να διαφέρουν — σε κάποια ξεχνιέται το `text`, σε κάποια το
 * `replyTo`, και το λάθος φαίνεται μόνο στα εισερχόμενα κάποιου.
 *
 * ── Η αποτυχία δεν παίρνει μαζί της το γεγονός ────────────────────────────
 *
 * Ό,τι κι αν συμβεί εδώ, το γεγονός που το προκάλεσε έχει ήδη συμβεί: τα
 * χρήματα κινήθηκαν, το δέμα φορτώθηκε, ο λογαριασμός εγκρίθηκε. Ένας αργός
 * mail server δεν επιτρέπεται να αναιρέσει τίποτα από αυτά, οπότε η αποτυχία
 * καταγράφεται και επιστρέφεται — ποτέ δεν πετάγεται.
 *
 * ── Το plain-text μέρος δεν είναι προαιρετικό ─────────────────────────────
 *
 * Τα φίλτρα ανεπιθύμητης αλληλογραφίας το διαβάζουν, και ένα multipart μήνυμα
 * χωρίς αυτό βαθμολογείται χειρότερα. Η μελέτη το ζητά ρητά σε κάθε αποστολή
 * (§9), γι' αυτό είναι υποχρεωτικό όρισμα και όχι προεπιλογή.
 */

export type TemplateSend = {
  to: string;
  templateId: string;
  subject: string;
  /** Κρυφό κείμενο προεπισκόπησης — ό,τι βλέπει ο παραλήπτης πριν ανοίξει. */
  preheader: string;
  data: Record<string, unknown>;
  text: string;
  /** Για logs, ώστε μια αποτυχία να λέει ΠΟΙΟΥ email και ΠΟΙΟΥ γεγονότος. */
  context: string;
};

export type TemplateSendResult = { ok: true; id: string } | { ok: false; error: string };

export async function sendTemplateMail(send: TemplateSend): Promise<TemplateSendResult> {
  if (!mailConfigured()) {
    return { ok: false, error: "Το Mailgun δεν είναι ρυθμισμένο." };
  }

  try {
    const html = await renderTemplate(send.templateId, {
      preheader: send.preheader,
      ...send.data,
    });

    const result = await sendMail({
      to: send.to,
      subject: send.subject,
      html,
      text: send.text,
      replyTo: process.env.MAIL_REPLY_TO,
    });

    if (!result.ok) {
      console.error(`[mail:${send.templateId}] ${send.context}: ${result.error}`);
      return { ok: false, error: result.error };
    }
    return { ok: true, id: result.id };
  } catch (error) {
    /*
     * Η απόδοση του template μπορεί να πετάξει (λείπει αρχείο, χαλασμένο
     * Handlebars). Πιάνεται εδώ γιατί ο καλών είναι webhook ή ενέργεια που
     * έχει ήδη αλλάξει κατάσταση — μια εξαίρεση θα ακύρωνε τη σωστή δουλειά
     * εξαιτίας του email της.
     */
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[mail:${send.templateId}] ${send.context}: ${message}`);
    return { ok: false, error: message };
  }
}
