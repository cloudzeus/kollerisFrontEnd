/**
 * The sentences of EU sales (intra-EU sales design §3; global constraints).
 *
 * The Greek ones are the spec's, word for word — do not paraphrase them. The
 * form carries the same sentences in messages/*.json; the server uses these
 * for what it returns from `placeOrder` and the VAT check.
 *
 * Pure and client-safe.
 */

export type EuSalesCopy = {
  /** VIES valid: shown with the name VIES gave. */
  valid: (name: string | null) => string;
  invalid: string;
  unavailable: string;
  invalidFormat: string;
  /** The reverse-charge note on an exempt order. */
  exemptNote: string;
  /** DHL gave no price: the order cannot be completed. */
  noDhl: string;
  customerTypeRequired: string;
  companyRequired: string;
  required: string;
  /** Too many checks from one basket. */
  tooMany: string;
};

const EL: EuSalesCopy = {
  valid: (name) => (name ? `Επιβεβαιώθηκε στο VIES: ${name}` : "Επιβεβαιώθηκε στο VIES"),
  invalid: "Ο ΑΦΜ δεν είναι ενεργός στο VIES — η παραγγελία θα χρεωθεί με ΦΠΑ",
  unavailable: "Δεν ήταν δυνατός ο έλεγχος του ΑΦΜ τώρα — δοκιμάστε ξανά σε λίγο ή συνεχίστε με ΦΠΑ",
  invalidFormat: "Ο ΑΦΜ δεν έχει έγκυρη μορφή για τη χώρα που επιλέξατε",
  exemptNote: "Ενδοκοινοτική παράδοση — απαλλαγή ΦΠΑ (αντίστροφη επιβάρυνση, άρθρο 138 Οδηγίας 2006/112/ΕΚ)",
  noDhl: "Η αποστολή στη χώρα σας δεν είναι διαθέσιμη αυτή τη στιγμή — επικοινωνήστε μαζί μας",
  customerTypeRequired: "Επιλέξτε αν αγοράζετε ως ιδιώτης ή ως εταιρεία.",
  companyRequired: "Για εταιρεία χρειάζονται επωνυμία και ΑΦΜ.",
  required: "Απαιτείται",
  tooMany: "Πολλοί έλεγχοι σε λίγο χρόνο — δοκιμάστε ξανά σε λίγα λεπτά ή συνεχίστε με ΦΠΑ",
};

const EN: EuSalesCopy = {
  valid: (name) => (name ? `Confirmed in VIES: ${name}` : "Confirmed in VIES"),
  invalid: "This VAT number is not active in VIES — the order will be charged VAT",
  unavailable: "The VAT number could not be checked right now — try again shortly or continue with VAT",
  invalidFormat: "This VAT number does not have a valid format for the country you chose",
  exemptNote: "Intra-community supply — VAT exempt (reverse charge, Article 138 of Directive 2006/112/EC)",
  noDhl: "Delivery to your country is not available right now — please contact us",
  customerTypeRequired: "Choose whether you are buying as a private individual or as a company.",
  companyRequired: "A company needs its name and VAT number.",
  required: "Required",
  tooMany: "Too many checks in a short time — try again in a few minutes or continue with VAT",
};

const IT: EuSalesCopy = {
  valid: (name) => (name ? `Confermato in VIES: ${name}` : "Confermato in VIES"),
  invalid: "La partita IVA non è attiva in VIES — l'ordine sarà addebitato con IVA",
  unavailable: "Non è stato possibile verificare la partita IVA ora — riprova tra poco o continua con IVA",
  invalidFormat: "La partita IVA non ha un formato valido per il paese scelto",
  exemptNote: "Cessione intracomunitaria — esente IVA (inversione contabile, art. 138 della Direttiva 2006/112/CE)",
  noDhl: "La spedizione nel tuo paese non è disponibile al momento — contattaci",
  customerTypeRequired: "Scegli se acquisti come privato o come azienda.",
  companyRequired: "Per un'azienda servono ragione sociale e partita IVA.",
  required: "Obbligatorio",
  tooMany: "Troppe verifiche in poco tempo — riprova tra qualche minuto o continua con IVA",
};

export function euSalesCopy(locale: string | null | undefined): EuSalesCopy {
  return locale === "en" ? EN : locale === "it" ? IT : EL;
}
