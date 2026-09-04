import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import { SHOP } from "@/lib/seo/structured-data";
import { mailUrls } from "@/lib/mail/urls";

/**
 * Τα 24 email templates του Kolleris Email System, αποδοσμένα από το κατάστημα.
 *
 * ── Τι είναι αυτά τα αρχεία ────────────────────────────────────────────────
 *
 * Ήρθαν από το ξεχωριστό project `KOLLERIS-NEWSLETTER`, από τον φάκελο
 * `dist/mailgun` — δηλαδή τη «flattened» έκδοση, όπου τα partials είναι ήδη
 * ενσωματωμένα. Αυτό έχει σημασία: τα αρχεία εδώ δεν χρειάζονται καταχώριση
 * partials ούτε helpers, μόνο `{{μεταβλητή}}`, `{{#each}}`, `{{#if}}` και
 * `{{#unless}}`. Το επιβεβαίωσα πριν τα φέρω — μηδέν `{{>` σε 24 αρχεία.
 *
 * ΔΕΝ επεξεργαζόμαστε τα HTML εδώ. Πηγή τους παραμένει το άλλο project, και
 * κάθε αλλαγή σχεδίασης γίνεται εκεί και ξανα-αντιγράφεται. Ό,τι χρειάζεται
 * προσαρμογή στο κατάστημα περνά από τα ΔΕΔΟΜΕΝΑ — τον πίνακα διευθύνσεων στο
 * `urls.ts` — όχι από το markup, ώστε τα δύο να μην αποκλίνουν σιωπηλά.
 *
 * ── Γιατί Handlebars και όχι αντικατάσταση με regex ────────────────────────
 *
 * Θα ήταν δελεαστικό, και θα έσπαγε στο πρώτο `{{#each product_rows}}` με
 * ένθετο `{{#each this}}` — που είναι ακριβώς η δομή του newsletter προσφορών.
 * Τα templates ΕΙΝΑΙ γραμμένα σε Handlebars· το να τα διαβάζει κάτι άλλο είναι
 * μετάφραση, και η μετάφραση έχει λάθη.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "src", "emails", "templates");

/** Μεταγλωττισμένα μία φορά ανά διεργασία — το parse δεν είναι δωρεάν. */
const compiled = new Map<string, HandlebarsTemplateDelegate>();

export type TemplateId = string;

/**
 * Το κοινό υπόβαθρο κάθε αποστολής: ποιοι είμαστε και πού οδηγεί τι.
 *
 * Μπαίνει κάτω από ό,τι δίνει ο καλών, ώστε μια καμπάνια να μπορεί να
 * παρακάμψει το `view_online` της χωρίς να ξαναγράψει τον υπόλοιπο πίνακα.
 */
export function baseContext(overrides: { viewOnline?: string; preferences?: string } = {}) {
  return {
    /*
     * ΑΦΜ και ΓΕΜΗ από environment, με κενό προεπιλογή.
     *
     * Μπαίνουν στο υποσέλιδο κάθε εμπορικού email, όπου είναι νομική δήλωση.
     * Δόθηκαν από τον πελάτη στις 26 Αυγ 2026· δεν επινοήθηκαν και δεν
     * συμπεραίνονται από πουθενά αλλού στον κώδικα. Παραμένουν σε env ώστε μια
     * αλλαγή εταιρικής μορφής να μη χρειάζεται deploy.
     */
    company: {
      name: SHOP.legalName,
      vat: process.env.COMPANY_VAT?.trim() || "099095556",
      gemi: process.env.COMPANY_GEMI?.trim() || "44598907000",
    },
    urls: mailUrls(overrides),
  };
}

export async function listTemplateIds(): Promise<TemplateId[]> {
  const files = await readdir(TEMPLATE_DIR);
  return files.filter((f) => f.endsWith(".html")).map((f) => f.replace(/\.html$/, "")).sort();
}

export async function renderTemplate(
  id: TemplateId,
  data: Record<string, unknown>,
): Promise<string> {
  /*
   * Το `id` φτάνει από τη διαχείριση και καταλήγει σε διαδρομή αρχείου. Χωρίς
   * αυτόν τον έλεγχο, ένα `../../../etc/passwd` θα διαβαζόταν και θα στελνόταν
   * με email. Ο κανόνας είναι στενός επίτηδες: τα υπαρκτά id είναι της μορφής
   * `nl-offers`, `order-confirmation`.
   */
  if (!/^[a-z0-9-]{2,64}$/.test(id)) {
    throw new Error(`Άκυρο id template: ${id}`);
  }

  let template = compiled.get(id);
  if (!template) {
    const source = await readFile(path.join(TEMPLATE_DIR, `${id}.html`), "utf8");
    template = Handlebars.compile(source, { noEscape: false });
    compiled.set(id, template);
  }

  return template({ ...baseContext(), ...data });
}
