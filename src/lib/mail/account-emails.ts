import "server-only";
import { sendTemplateMail } from "@/lib/mail/send-template";
import { mailUrls } from "@/lib/mail/urls";
import { stampNow } from "@/lib/mail/request-context";
import type { RequestFingerprint } from "@/lib/mail/request-context";

/**
 * Τα email του κύκλου ζωής ενός λογαριασμού.
 *
 * Τέσσερα γεγονότα που συνέβαιναν ήδη και δεν έλεγαν τίποτα σε κανέναν:
 * δημιουργία λογαριασμού, αλλαγή κωδικού, αίτημα B2B, έγκριση B2B. Ο πελάτης
 * υπέβαλλε αίτηση για λογαριασμό συνεργάτη και περίμενε — χωρίς επιβεβαίωση
 * ότι ελήφθη, χωρίς προθεσμία, και χωρίς ειδοποίηση όταν εγκρινόταν. Η έγκριση
 * φαινόταν μόνο σε όποιον ξαναδοκίμαζε να συνδεθεί.
 *
 * ── Κανένα δεν μπλοκάρει το γεγονός του ────────────────────────────────────
 *
 * Όλα περνούν από το `sendTemplateMail`, που καταγράφει και επιστρέφει αντί να
 * πετάξει. Ένας λογαριασμός που εγκρίθηκε παραμένει εγκεκριμένος ακόμη κι αν
 * το Mailgun είναι κάτω.
 */

type Recipient = { firstName: string; lastName?: string; email: string };

const recipientOf = (r: Recipient) => ({
  first_name: r.firstName,
  last_name: r.lastName ?? "",
  email: r.email,
});

/**
 * «Ο λογαριασμός σας είναι έτοιμος» — μετά τη δημιουργία.
 *
 * Απαγορεύεται το «Καλώς ήρθατε!»: το ίδιο το design system το ορίζει, και ο
 * τίτλος είναι δήλωση κατάστασης, όχι χαιρετισμός.
 */
export async function sendWelcomeEmail(
  to: Recipient,
  account: { type: "individual" | "company"; customerCode?: string | null },
) {
  const urls = mailUrls();
  return sendTemplateMail({
    to: to.email,
    templateId: "account-welcome",
    subject: "Ο λογαριασμός σας είναι έτοιμος",
    preheader: "Γρήγορη παραγγελία με κωδικό, ιστορικό, αποθηκευμένες διευθύνσεις.",
    context: to.email,
    data: {
      recipient: recipientOf(to),
      account: {
        /*
         * Ο κωδικός πελάτη έρχεται από το ERP και δεν υπάρχει για ιδιώτες.
         * Παύλα αντί για κενό: το template τον δείχνει σε γραμμή στοιχείων,
         * και μια άδεια γραμμή διαβάζεται ως σφάλμα.
         */
        customer_code: account.customerCode || "—",
        type: account.type === "company" ? "Εταιρικός" : "Ιδιώτης",
      },
      steps: [
        {
          index: "01",
          title: "Παραγγειλτε με κωδικο",
          text: "Γράψτε κωδικούς και ποσότητες και το καλάθι γεμίζει χωρίς αναζήτηση.",
          cta: "Γρηγορη παραγγελια",
          url: urls.quick_order,
        },
        {
          index: "02",
          title: "Δειτε τις παραγγελιες σας",
          text: "Ιστορικό, κατάσταση αποστολής και επανάληψη παραγγελίας με ένα κλικ.",
          cta: "Οι παραγγελιες μου",
          url: urls.orders,
        },
        {
          index: "03",
          title: "Αποθηκευστε αγαπημενα",
          text: "Ό,τι παραγγέλνετε συχνά, σε ένα σημείο, από οποιαδήποτε συσκευή.",
          cta: "Ο λογαριασμος μου",
          url: urls.account,
        },
      ],
    },
    text: [
      "Ο λογαριασμός σας είναι έτοιμος",
      "",
      `Γρήγορη παραγγελία με κωδικό: ${urls.quick_order}`,
      `Οι παραγγελίες μου: ${urls.orders}`,
      `Ο λογαριασμός μου: ${urls.account}`,
    ].join("\n"),
  });
}

/**
 * «Ο κωδικός σας άλλαξε» — ειδοποίηση ασφαλείας, όχι επιβεβαίωση.
 *
 * Στέλνεται ΠΑΝΤΑ, ακόμη κι όταν την αλλαγή την έκανε ο ίδιος ο κάτοχος: το
 * νόημά της είναι να φτάσει στον άνθρωπο που ΔΕΝ την έκανε. Ένα email που
 * παραλείπεται «επειδή το ξέρει ήδη» δεν προστατεύει κανέναν.
 */
export async function sendPasswordChangedEmail(
  to: Recipient,
  fingerprint: RequestFingerprint,
) {
  return sendTemplateMail({
    to: to.email,
    templateId: "account-password-changed",
    subject: "Ο κωδικός πρόσβασής σας άλλαξε",
    preheader: "Αν δεν το κάνατε εσείς, επικοινωνήστε άμεσα μαζί μας.",
    context: to.email,
    data: {
      recipient: recipientOf(to),
      change: {
        at: stampNow(),
        device: fingerprint.device,
        location: fingerprint.location,
        ip: fingerprint.ip,
        /*
         * Δεν υπάρχει σελίδα κλειδώματος λογαριασμού, οπότε δεν στέλνεται
         * `lock_url`: το template πέφτει στο «καλέστε μας αμέσως», που είναι
         * αυτό που όντως συμβαίνει. Ένα κουμπί «Κλείδωμα λογαριασμού» που
         * βγάζει σε φόρμα επικοινωνίας κάνει τον παραλήπτη να νομίζει ότι ο
         * λογαριασμός κλείδωσε — τη στιγμή που δεν έχει κλειδώσει.
         *
         * Ούτε `security_email`: το γραμματοκιβώτιο δεν υπάρχει, και μια
         * αναφορά παραβίασης που πάει στο πουθενά είναι η χειρότερη εκδοχή.
         */
      },
    },
    text: [
      "Ο κωδικός πρόσβασής σας άλλαξε",
      "",
      `Ημερομηνία: ${stampNow()}`,
      `Συσκευή: ${fingerprint.device}`,
      `IP: ${fingerprint.ip}`,
      "",
      "Αν δεν το κάνατε εσείς, καλέστε μας άμεσα στο +30 210 411 1355.",
    ].join("\n"),
  });
}

/** «Λάβαμε το αίτημά σας για λογαριασμό B2B» — με προσδοκία χρόνου. */
export async function sendB2bPendingEmail(
  to: Recipient,
  company: {
    id: string;
    name: string;
    afm: string;
    doy?: string | null;
    profession?: string | null;
    address?: string | null;
    city?: string | null;
    postcode?: string | null;
    phone?: string | null;
  },
) {
  const sla = "1–2 εργάσιμες ημέρες";
  const address = [company.address, [company.postcode, company.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return sendTemplateMail({
    to: to.email,
    templateId: "account-b2b-pending",
    subject: "Λάβαμε το αίτημά σας για λογαριασμό B2B",
    preheader: `Έλεγχος στοιχείων εντός ${sla}.`,
    context: `${company.afm} · ${to.email}`,
    data: {
      recipient: recipientOf(to),
      b2b: {
        /*
         * Αριθμός αιτήματος: τα οκτώ τελευταία του cuid της εταιρείας, κεφαλαία.
         * Δεν υπάρχει ξεχωριστός μετρητής αιτημάτων, και το να επινοηθεί ένας
         * θα σήμαινε νούμερο που δεν βρίσκει κανείς όταν το αναφέρει ο πελάτης
         * στο τηλέφωνο. Αυτό οδηγεί στην πραγματική εγγραφή.
         */
        request_number: `B2B-${company.id.slice(-8).toUpperCase()}`,
        company_name: company.name,
        sla,
        vat: company.afm,
        doy: company.doy || "—",
        activity: company.profession || "—",
        address: address || "—",
        contact_name: `${to.firstName} ${to.lastName ?? ""}`.trim(),
        contact_phone: company.phone || "—",
      },
      next_steps: [
        { index: "01", text: "Ελέγχουμε το ΑΦΜ και τα στοιχεία της εταιρείας στο μητρώο." },
        { index: "02", text: "Αντιστοιχίζουμε τον λογαριασμό με τον τιμοκατάλογο συνεργάτη." },
        { index: "03", text: "Λαμβάνετε email έγκρισης και συνδέεστε με τις τιμές σας." },
      ],
    },
    text: [
      "Λάβαμε το αίτημά σας για λογαριασμό B2B",
      "",
      `Επωνυμία: ${company.name}`,
      `ΑΦΜ: ${company.afm}`,
      "",
      `Έλεγχος στοιχείων εντός ${sla}. Θα σας ενημερώσουμε με email.`,
    ].join("\n"),
  });
}

/** «Ο λογαριασμός B2B εγκρίθηκε» — και οι τιμές συνεργάτη είναι ενεργές. */
export async function sendB2bApprovedEmail(
  to: Recipient,
  company: { name: string; erpTrdr?: number | null; partnerFactor?: number | null },
) {
  const urls = mailUrls();
  /*
   * Το ποσοστό έκπτωσης δεν γράφεται στο email.
   * Η πολιτική τιμών ανήκει στο HDCtool και μπορεί να αλλάξει· ένα ποσοστό
   * τυπωμένο σε email γίνεται δέσμευση που κανείς δεν θυμάται ότι έδωσε.
   * Το template δείχνει τιμοκατάλογο, όχι νούμερο.
   */
  return sendTemplateMail({
    to: to.email,
    templateId: "account-b2b-approved",
    subject: "Ο λογαριασμός B2B εγκρίθηκε — τιμές συνεργάτη ενεργές",
    preheader: "Συνδεθείτε για να δείτε τις τιμές σας.",
    context: `${company.name} · ${to.email}`,
    data: {
      recipient: recipientOf(to),
      b2b: {
        company_name: company.name,
        customer_code: company.erpTrdr ? String(company.erpTrdr) : "—",
        price_list: company.partnerFactor ? "Τιμοκατάλογος συνεργάτη" : "Τιμοκατάλογος λιανικής",
        /* Οι όροι πληρωμής και ο υπεύθυνος πωλήσεων ζουν στο ERP και δεν
           φτάνουν εδώ ακόμη. Παύλα αντί για επινοημένη τιμή. */
        payment_terms: "—",
        sales_rep: "—",
        sales_rep_phone: "+30 210 411 1355",
      },
      benefits: [
        { index: "01", title: "Τιμες συνεργατη", text: "Οι τιμές σας εμφανίζονται παντού μόλις συνδεθείτε." },
        { index: "02", title: "Τιμολογιο με τα στοιχεια σας", text: "Εκδίδεται αυτόματα στην επωνυμία και το ΑΦΜ της εταιρείας." },
        { index: "03", title: "Πολλοι χρηστες", text: "Προσκαλέστε συναδέλφους στον ίδιο λογαριασμό." },
        { index: "04", title: "Ιστορικο και επαναληψη", text: "Κάθε παραγγελία επαναλαμβάνεται με ένα κλικ." },
      ],
    },
    text: [
      "Ο λογαριασμός B2B εγκρίθηκε",
      "",
      `Εταιρεία: ${company.name}`,
      "",
      `Συνδεθείτε: ${urls.account}`,
    ].join("\n"),
  });
}
