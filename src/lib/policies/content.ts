import type { Locale } from "@/i18n/routing";
import type { PolicyContent, PolicySlug } from "@/lib/policies/types";

/**
 * The legal pages the storefront was missing entirely.
 *
 * Google's Merchant Center flagged the shop for Misrepresentation, and this
 * is most of what that flag was actually about: no terms, no privacy policy,
 * no stated payment methods, no shipping policy, and the footer linked to a
 * returns page and a warranty page that both 404'd. A machine reading the
 * site for "can this business be trusted" found nothing to read.
 *
 * Content, not design: every fact here is sourced from the company's own
 * published policy at milwaukeetoolshdc.gr, or — for shipping and payment —
 * cross-checked against what `src/lib/shipping/acs-tariff.ts` and
 * `src/lib/cart/options.ts` actually do, so a policy page cannot promise
 * something the checkout doesn't deliver.
 *
 * One legal-entity spelling exists across the two source pages that named
 * it — "ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ" and "ΑΦΟΙ Ι ΚΟΛΛΕΡΗΣ ΕΠΕ" — and HDCtool, the
 * system of record, uses "ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ" throughout (the supplier portal,
 * the ACS voucher, every order email). That is the one used here.
 *
 * Structured data, not next-intl message keys: this is long-form prose that
 * changes rarely, and next-intl's flat JSON namespaces are built for short UI
 * strings, not paragraphs. `getFaq()` already sets this precedent for
 * long-form content in this codebase.
 */

const COMPANY = {
  legalName: "ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ",
  address: "Κ. Μαυρομιχάλη 4, 185 45 Πειραιάς",
  email: "info@kolleris.com",
  phones: ["210 422 02 39", "210 411 37 54", "210 413 14 90"],
} as const;

const CONTENT: Record<PolicySlug, Record<Locale, PolicyContent>> = {
  /* ── Terms and conditions ─────────────────────────────────────────── */
  "oroi-chrisis": {
    el: {
      title: "Όροι Χρήσης",
      updated: "2026-08-04",
      intro:
        "Η πρόσβαση και η χρήση του παρόντος ηλεκτρονικού καταστήματος προϋποθέτει την ανεπιφύλακτη αποδοχή των παρακάτω όρων χρήσης, οι οποίοι ισχύουν για το σύνολο του περιεχομένου του site.",
      sections: [
        {
          heading: "Στοιχεία επιχείρησης",
          paragraphs: [
            `Το ηλεκτρονικό κατάστημα ανήκει και λειτουργεί από την εταιρεία ${COMPANY.legalName}, με έδρα ${COMPANY.address}.`,
            `Επικοινωνία: ${COMPANY.phones.join(", ")}, email: ${COMPANY.email}.`,
          ],
        },
        {
          heading: "Υπηρεσίες",
          paragraphs: [
            "Το ηλεκτρονικό κατάστημα παρέχει πληροφορίες προϊόντων και τη δυνατότητα ηλεκτρονικής παραγγελίας. Η εταιρεία διατηρεί το δικαίωμα τροποποίησης, αναστολής ή διακοπής οποιασδήποτε υπηρεσίας του site, χωρίς προηγούμενη ειδοποίηση.",
          ],
        },
        {
          heading: "Υποχρεώσεις χρήστη",
          paragraphs: ["Ο χρήστης οφείλει:"],
          list: [
            "να χρησιμοποιεί το site σύμφωνα με τον νόμο και τους παρόντες όρους,",
            "να μην προβαίνει σε ενέργειες που θα μπορούσαν να βλάψουν ή να διαταράξουν τη λειτουργία των συστημάτων του site,",
            "να παρέχει ακριβή και αληθή στοιχεία κατά την υποβολή παραγγελίας.",
          ],
        },
        {
          heading: "Ευθύνη της εταιρείας",
          paragraphs: [
            "Καταβάλλεται κάθε δυνατή προσπάθεια ώστε οι πληροφορίες που εμφανίζονται στο site (περιγραφές, διαθεσιμότητα, τιμές) να είναι ακριβείς και ενημερωμένες. Η εταιρεία δεν ευθύνεται για τυχόν λάθη που οφείλονται σε παραδρομή ή σε τεχνικό σφάλμα, ούτε για προσωρινή αδυναμία πρόσβασης στο site λόγω ανωτέρας βίας ή τεχνικών λόγων.",
          ],
        },
        {
          heading: "Πνευματική ιδιοκτησία",
          paragraphs: [
            "Το σύνολο του περιεχομένου του site (κείμενα, εικόνες, λογότυπα, σχεδιασμός) αποτελεί πνευματική ιδιοκτησία της εταιρείας ή τρίτων που έχουν παραχωρήσει τη σχετική άδεια χρήσης. Απαγορεύεται οποιαδήποτε αντιγραφή, αναπαραγωγή ή εκμετάλλευση χωρίς προηγούμενη έγγραφη άδεια.",
          ],
        },
        {
          heading: "Σύνδεσμοι προς τρίτους",
          paragraphs: [
            "Το site ενδέχεται να περιλαμβάνει συνδέσμους προς ιστότοπους τρίτων. Η εταιρεία δεν ελέγχει και δεν φέρει ευθύνη για το περιεχόμενο ή τις πρακτικές αυτών των ιστότοπων.",
          ],
        },
        {
          heading: "Προστασία δεδομένων",
          paragraphs: [
            "Η επεξεργασία των προσωπικών δεδομένων γίνεται σύμφωνα με τον Γενικό Κανονισμό Προστασίας Δεδομένων (ΓΚΠΔ). Αναλυτικά στην Πολιτική Απορρήτου.",
          ],
        },
        {
          heading: "Εφαρμοστέο δίκαιο",
          paragraphs: [
            "Οι παρόντες όροι διέπονται από το ελληνικό δίκαιο. Αρμόδια για κάθε σχετική διαφορά ορίζονται τα δικαστήρια του Πειραιά.",
          ],
        },
        {
          heading: "Τροποποίηση των όρων",
          paragraphs: [
            "Η εταιρεία διατηρεί το δικαίωμα τροποποίησης των παρόντων όρων. Οι τροποποιήσεις ισχύουν από τη δημοσίευσή τους στο site. Συνιστάται περιοδική ανάγνωση της σελίδας.",
          ],
        },
      ],
    },
    en: {
      title: "Terms and Conditions",
      updated: "2026-08-04",
      intro:
        "Access to and use of this online store requires unreserved acceptance of the following terms, which apply to the entire content of the site.",
      sections: [
        {
          heading: "Business details",
          paragraphs: [
            `This online store is owned and operated by ${COMPANY.legalName}, registered at ${COMPANY.address}.`,
            `Contact: ${COMPANY.phones.join(", ")}, email: ${COMPANY.email}.`,
          ],
        },
        {
          heading: "Services",
          paragraphs: [
            "The store provides product information and the ability to place orders online. The company reserves the right to modify, suspend or discontinue any service on the site without prior notice.",
          ],
        },
        {
          heading: "User obligations",
          paragraphs: ["The user is required to:"],
          list: [
            "use the site lawfully and in accordance with these terms,",
            "avoid any action that could damage or disrupt the site's systems,",
            "provide accurate and truthful information when placing an order.",
          ],
        },
        {
          heading: "Company liability",
          paragraphs: [
            "Every reasonable effort is made to keep the information shown on the site — descriptions, availability, prices — accurate and up to date. The company is not liable for errors caused by oversight or technical fault, nor for temporary unavailability of the site due to force majeure or technical reasons.",
          ],
        },
        {
          heading: "Intellectual property",
          paragraphs: [
            "All content on the site — text, images, logos, design — is the intellectual property of the company or of third parties who have granted the relevant licence. Copying, reproduction or exploitation without prior written permission is prohibited.",
          ],
        },
        {
          heading: "Third-party links",
          paragraphs: [
            "The site may include links to third-party websites. The company does not control and is not responsible for the content or practices of those sites.",
          ],
        },
        {
          heading: "Data protection",
          paragraphs: [
            "Personal data is processed in accordance with the General Data Protection Regulation (GDPR). See the Privacy Policy for details.",
          ],
        },
        {
          heading: "Governing law",
          paragraphs: [
            "These terms are governed by Greek law. The courts of Piraeus have jurisdiction over any related dispute.",
          ],
        },
        {
          heading: "Changes to these terms",
          paragraphs: [
            "The company reserves the right to amend these terms. Amendments take effect upon publication on the site. Users are advised to review this page periodically.",
          ],
        },
      ],
    },
    it: {
      title: "Termini e Condizioni",
      updated: "2026-08-04",
      intro:
        "L'accesso e l'utilizzo di questo negozio online presuppongono l'accettazione incondizionata dei seguenti termini, validi per l'intero contenuto del sito.",
      sections: [
        {
          heading: "Dati aziendali",
          paragraphs: [
            `Il negozio online è di proprietà e gestito da ${COMPANY.legalName}, con sede in ${COMPANY.address}.`,
            `Contatti: ${COMPANY.phones.join(", ")}, email: ${COMPANY.email}.`,
          ],
        },
        {
          heading: "Servizi",
          paragraphs: [
            "Il negozio fornisce informazioni sui prodotti e la possibilità di effettuare ordini online. L'azienda si riserva il diritto di modificare, sospendere o interrompere qualsiasi servizio del sito senza preavviso.",
          ],
        },
        {
          heading: "Obblighi dell'utente",
          paragraphs: ["L'utente è tenuto a:"],
          list: [
            "utilizzare il sito in conformità alla legge e ai presenti termini,",
            "evitare qualsiasi azione che possa danneggiare o compromettere i sistemi del sito,",
            "fornire informazioni accurate e veritiere al momento dell'ordine.",
          ],
        },
        {
          heading: "Responsabilità dell'azienda",
          paragraphs: [
            "Viene fatto ogni ragionevole sforzo per mantenere accurate e aggiornate le informazioni pubblicate sul sito — descrizioni, disponibilità, prezzi. L'azienda non è responsabile per errori dovuti a sviste o guasti tecnici, né per l'indisponibilità temporanea del sito per cause di forza maggiore o motivi tecnici.",
          ],
        },
        {
          heading: "Proprietà intellettuale",
          paragraphs: [
            "Tutti i contenuti del sito — testi, immagini, loghi, design — sono proprietà intellettuale dell'azienda o di terzi che ne hanno concesso l'uso. È vietata qualsiasi copia, riproduzione o sfruttamento senza previa autorizzazione scritta.",
          ],
        },
        {
          heading: "Link a terzi",
          paragraphs: [
            "Il sito può includere link a siti di terzi. L'azienda non controlla e non è responsabile dei contenuti o delle pratiche di tali siti.",
          ],
        },
        {
          heading: "Protezione dei dati",
          paragraphs: [
            "Il trattamento dei dati personali avviene in conformità al Regolamento Generale sulla Protezione dei Dati (GDPR). Per i dettagli, consultare l'Informativa sulla Privacy.",
          ],
        },
        {
          heading: "Legge applicabile",
          paragraphs: [
            "I presenti termini sono disciplinati dalla legge greca. Per qualsiasi controversia è competente il tribunale del Pireo.",
          ],
        },
        {
          heading: "Modifiche ai termini",
          paragraphs: [
            "L'azienda si riserva il diritto di modificare i presenti termini. Le modifiche hanno effetto dalla pubblicazione sul sito. Si consiglia di consultare periodicamente questa pagina.",
          ],
        },
      ],
    },
  },

  /* ── Privacy policy ───────────────────────────────────────────────── */
  aporrito: {
    el: {
      title: "Πολιτική Απορρήτου",
      updated: "2026-08-04",
      intro:
        "Η παρούσα πολιτική περιγράφει ποια προσωπικά δεδομένα συλλέγει η επιχείρηση, για ποιον σκοπό, και ποια δικαιώματα έχει ο επισκέπτης/πελάτης σύμφωνα με τον Γενικό Κανονισμό Προστασίας Δεδομένων (ΓΚΠΔ).",
      sections: [
        {
          heading: "Υπεύθυνος επεξεργασίας",
          paragraphs: [
            `${COMPANY.legalName}, ${COMPANY.address}. Τηλ: ${COMPANY.phones[0]}, email: ${COMPANY.email}.`,
          ],
        },
        {
          heading: "Δεδομένα που συλλέγονται",
          paragraphs: ["Κατά τη χρήση του site και την υποβολή παραγγελίας συλλέγονται:"],
          list: [
            "στοιχεία ταυτότητας και επικοινωνίας (όνομα, επώνυμο, διεύθυνση, τηλέφωνο, email),",
            "στοιχεία παραγγελίας και τιμολόγησης,",
            "στοιχεία πληρωμής, χωρίς αποθήκευση αριθμών κάρτας — η επεξεργασία πληρωμής γίνεται απευθείας από τον πάροχο πληρωμών,",
            "τεχνικά δεδομένα (διεύθυνση IP, τύπος browser, cookies),",
            "αρχείο επικοινωνίας με το τμήμα εξυπηρέτησης.",
          ],
        },
        {
          heading: "Σκοπός επεξεργασίας",
          paragraphs: ["Τα δεδομένα χρησιμοποιούνται για:"],
          list: [
            "την εκτέλεση και παρακολούθηση της παραγγελίας,",
            "την έκδοση παραστατικών,",
            "την εξυπηρέτηση πελατών,",
            "την αποστολή ενημερώσεων, προσφορών ή προωθητικού υλικού, μόνο κατόπιν συναίνεσης,",
            "τη βελτίωση του site,",
            "τη συμμόρφωση με νομικές υποχρεώσεις.",
          ],
        },
        {
          heading: "Νομική βάση",
          paragraphs: [
            "Η επεξεργασία στηρίζεται στην εκτέλεση της σύμβασης πώλησης, στη συμμόρφωση με νομικές υποχρεώσεις, στη συγκατάθεση του χρήστη όπου απαιτείται, και στο έννομο συμφέρον της επιχείρησης.",
          ],
        },
        {
          heading: "Αποδέκτες δεδομένων",
          paragraphs: [
            "Τα δεδομένα κοινοποιούνται, στον βαθμό που απαιτείται, σε εταιρείες ταχυμεταφορών, παρόχους πληρωμών, συνεργαζόμενο λογιστήριο, τεχνικούς συνεργάτες που υποστηρίζουν το site, και σε δημόσιες αρχές όπου αυτό επιβάλλεται από τον νόμο.",
          ],
        },
        {
          heading: "Χρόνος τήρησης",
          paragraphs: [
            "Τα παραστατικά και τα λογιστικά στοιχεία τηρούνται για το χρονικό διάστημα που ορίζει η φορολογική νομοθεσία. Τα στοιχεία επικοινωνίας τηρούνται όσο διάστημα απαιτείται για τον σκοπό συλλογής τους. Τα δεδομένα ενημερωτικού δελτίου (newsletter) τηρούνται μέχρι την ανάκληση της συγκατάθεσης.",
          ],
        },
        {
          heading: "Cookies",
          paragraphs: [
            "Το site χρησιμοποιεί cookies απαραίτητα για τη λειτουργία του και, όπου επιτρέπεται, cookies στατιστικής ανάλυσης. Ο επισκέπτης μπορεί να διαχειριστεί τα cookies μέσω των ρυθμίσεων του browser του.",
          ],
        },
        {
          heading: "Δικαιώματα του υποκειμένου",
          paragraphs: ["Ο χρήστης έχει δικαίωμα:"],
          list: [
            "πρόσβασης στα δεδομένα του,",
            "διόρθωσης ανακριβών δεδομένων,",
            "διαγραφής («δικαίωμα στη λήθη»),",
            "περιορισμού της επεξεργασίας,",
            "φορητότητας των δεδομένων,",
            "ανάκλησης της συγκατάθεσής του ανά πάσα στιγμή,",
            "υποβολής καταγγελίας στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα.",
          ],
        },
        {
          heading: "Επικοινωνία για θέματα προσωπικών δεδομένων",
          paragraphs: [`Για κάθε αίτημα σχετικό με τα προσωπικά σας δεδομένα: ${COMPANY.email}.`],
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      updated: "2026-08-04",
      intro:
        "This policy describes what personal data the business collects, for what purpose, and what rights a visitor or customer has under the General Data Protection Regulation (GDPR).",
      sections: [
        {
          heading: "Data controller",
          paragraphs: [
            `${COMPANY.legalName}, ${COMPANY.address}. Phone: ${COMPANY.phones[0]}, email: ${COMPANY.email}.`,
          ],
        },
        {
          heading: "Data collected",
          paragraphs: ["While using the site and placing an order, we collect:"],
          list: [
            "identity and contact details (first name, last name, address, phone, email),",
            "order and billing details,",
            "payment data, without storing card numbers — payment processing is handled directly by the payment provider,",
            "technical data (IP address, browser type, cookies),",
            "records of correspondence with customer support.",
          ],
        },
        {
          heading: "Purpose of processing",
          paragraphs: ["Data is used to:"],
          list: [
            "fulfil and track the order,",
            "issue invoices and receipts,",
            "provide customer support,",
            "send updates, offers or promotional material, only with consent,",
            "improve the site,",
            "comply with legal obligations.",
          ],
        },
        {
          heading: "Legal basis",
          paragraphs: [
            "Processing relies on the performance of the sales contract, compliance with legal obligations, the user's consent where required, and the company's legitimate interest.",
          ],
        },
        {
          heading: "Recipients of data",
          paragraphs: [
            "Data is shared, to the extent necessary, with courier companies, payment providers, our accounting partner, technical partners supporting the site, and public authorities where required by law.",
          ],
        },
        {
          heading: "Retention period",
          paragraphs: [
            "Invoices and accounting records are kept for the period required by tax law. Contact records are kept for as long as needed for the purpose they were collected for. Newsletter data is kept until consent is withdrawn.",
          ],
        },
        {
          heading: "Cookies",
          paragraphs: [
            "The site uses cookies necessary for it to function and, where permitted, analytics cookies. Visitors can manage cookies through their browser settings.",
          ],
        },
        {
          heading: "Data subject rights",
          paragraphs: ["Users have the right to:"],
          list: [
            "access their data,",
            "correct inaccurate data,",
            "request erasure ('the right to be forgotten'),",
            "restrict processing,",
            "data portability,",
            "withdraw consent at any time,",
            "lodge a complaint with the Hellenic Data Protection Authority.",
          ],
        },
        {
          heading: "Contact for privacy requests",
          paragraphs: [`For any request regarding your personal data: ${COMPANY.email}.`],
        },
      ],
    },
    it: {
      title: "Informativa sulla Privacy",
      updated: "2026-08-04",
      intro:
        "Questa informativa descrive quali dati personali raccoglie l'azienda, per quale scopo, e quali diritti ha il visitatore o cliente ai sensi del Regolamento Generale sulla Protezione dei Dati (GDPR).",
      sections: [
        {
          heading: "Titolare del trattamento",
          paragraphs: [
            `${COMPANY.legalName}, ${COMPANY.address}. Tel: ${COMPANY.phones[0]}, email: ${COMPANY.email}.`,
          ],
        },
        {
          heading: "Dati raccolti",
          paragraphs: ["Durante l'uso del sito e l'invio di un ordine raccogliamo:"],
          list: [
            "dati identificativi e di contatto (nome, cognome, indirizzo, telefono, email),",
            "dati dell'ordine e di fatturazione,",
            "dati di pagamento, senza memorizzare i numeri di carta — il pagamento è elaborato direttamente dal fornitore del servizio,",
            "dati tecnici (indirizzo IP, tipo di browser, cookie),",
            "registro delle comunicazioni con l'assistenza clienti.",
          ],
        },
        {
          heading: "Finalità del trattamento",
          paragraphs: ["I dati sono utilizzati per:"],
          list: [
            "evadere e tracciare l'ordine,",
            "emettere fatture e ricevute,",
            "fornire assistenza clienti,",
            "inviare aggiornamenti, offerte o materiale promozionale, solo previo consenso,",
            "migliorare il sito,",
            "adempiere agli obblighi di legge.",
          ],
        },
        {
          heading: "Base giuridica",
          paragraphs: [
            "Il trattamento si basa sull'esecuzione del contratto di vendita, sull'adempimento di obblighi legali, sul consenso dell'utente ove richiesto, e sul legittimo interesse dell'azienda.",
          ],
        },
        {
          heading: "Destinatari dei dati",
          paragraphs: [
            "I dati sono condivisi, nella misura necessaria, con corrieri, fornitori di servizi di pagamento, il nostro studio contabile, partner tecnici che supportano il sito, e autorità pubbliche ove previsto dalla legge.",
          ],
        },
        {
          heading: "Periodo di conservazione",
          paragraphs: [
            "Fatture e documenti contabili sono conservati per il periodo previsto dalla normativa fiscale. I dati di contatto sono conservati per il tempo necessario allo scopo per cui sono stati raccolti. I dati della newsletter sono conservati fino alla revoca del consenso.",
          ],
        },
        {
          heading: "Cookie",
          paragraphs: [
            "Il sito utilizza cookie necessari al suo funzionamento e, ove consentito, cookie di analisi statistica. Il visitatore può gestire i cookie tramite le impostazioni del proprio browser.",
          ],
        },
        {
          heading: "Diritti dell'interessato",
          paragraphs: ["L'utente ha diritto di:"],
          list: [
            "accedere ai propri dati,",
            "rettificare dati inesatti,",
            "richiedere la cancellazione ('diritto all'oblio'),",
            "limitare il trattamento,",
            "portabilità dei dati,",
            "revocare il consenso in qualsiasi momento,",
            "presentare reclamo all'Autorità Ellenica per la Protezione dei Dati.",
          ],
        },
        {
          heading: "Contatti per richieste privacy",
          paragraphs: [`Per qualsiasi richiesta relativa ai tuoi dati personali: ${COMPANY.email}.`],
        },
      ],
    },
  },

  /* ── Payment methods ──────────────────────────────────────────────── */
  "tropoi-pliromis": {
    el: {
      title: "Τρόποι Πληρωμής",
      updated: "2026-08-04",
      intro: "Στο ταμείο διατίθενται οι παρακάτω τρόποι πληρωμής.",
      sections: [
        {
          heading: "Πιστωτική / Χρεωστική κάρτα",
          paragraphs: [
            "Η πληρωμή με κάρτα διεκπεραιώνεται μέσω της Viva Payments, ευρωπαϊκού παρόχου πληρωμών. Γίνονται δεκτές κάρτες Visa, Mastercard και Maestro. Τα στοιχεία της κάρτας δεν αποθηκεύονται στους διακομιστές μας — η επεξεργασία γίνεται απευθείας από τη Viva Payments, με κρυπτογράφηση SSL, συμμόρφωση PCI DSS και επαλήθευση 3D Secure όπου απαιτείται.",
          ],
        },
        {
          heading: "IRIS",
          paragraphs: [
            "Άμεση πληρωμή μέσω IRIS, από τον τραπεζικό σας λογαριασμό, χωρίς προμήθεια.",
          ],
        },
        {
          heading: "PayPal",
          paragraphs: [
            "Πληρωμή μέσω του λογαριασμού σας PayPal, μέσω της σελίδας πληρωμής της Viva Payments.",
          ],
        },
        {
          heading: "Τραπεζική κατάθεση",
          paragraphs: [
            "Κατάθεση στον τραπεζικό λογαριασμό της εταιρείας. Τα στοιχεία κατάθεσης εμφανίζονται στην επιβεβαίωση της παραγγελίας. Η παραγγελία τίθεται σε επεξεργασία μετά την επιβεβαίωση της κατάθεσης.",
          ],
        },
        {
          heading: "Τρόποι πληρωμής που ΔΕΝ προσφέρονται",
          paragraphs: ["Δεν υποστηρίζεται αντικαταβολή."],
        },
      ],
    },
    en: {
      title: "Payment Methods",
      updated: "2026-08-04",
      intro: "The following payment methods are available at checkout.",
      sections: [
        {
          heading: "Credit / Debit card",
          paragraphs: [
            "Card payments are processed through Viva Payments, a European payment provider. Visa, Mastercard and Maestro are accepted. Card details are never stored on our servers — processing happens directly with Viva Payments, using SSL encryption, PCI DSS compliance and 3D Secure verification where required.",
          ],
        },
        {
          heading: "IRIS",
          paragraphs: ["Instant payment via IRIS, directly from your bank account, with no fee."],
        },
        {
          heading: "PayPal",
          paragraphs: ["Pay with your PayPal account, through Viva Payments' payment page."],
        },
        {
          heading: "Bank transfer",
          paragraphs: [
            "Deposit into the company's bank account. Deposit details are shown on order confirmation. The order is processed once the deposit is confirmed.",
          ],
        },
        {
          heading: "Payment methods NOT offered",
          paragraphs: ["Cash on delivery is not supported."],
        },
        {
          heading: "On credit",
          paragraphs: ["Available exclusively to business (B2B) accounts approved for credit terms."],
        },
      ],
    },
    it: {
      title: "Metodi di Pagamento",
      updated: "2026-08-04",
      intro: "Al momento del pagamento sono disponibili i seguenti metodi.",
      sections: [
        {
          heading: "Carta di credito / debito",
          paragraphs: [
            "I pagamenti con carta sono elaborati tramite Viva Payments, fornitore di pagamenti europeo. Sono accettate carte Visa, Mastercard e Maestro. I dati della carta non vengono mai memorizzati sui nostri server — l'elaborazione avviene direttamente con Viva Payments, con crittografia SSL, conformità PCI DSS e verifica 3D Secure ove richiesto.",
          ],
        },
        {
          heading: "IRIS",
          paragraphs: [
            "Pagamento istantaneo tramite IRIS, direttamente dal proprio conto bancario, senza commissioni.",
          ],
        },
        {
          heading: "PayPal",
          paragraphs: ["Paga con il tuo account PayPal, tramite la pagina di pagamento di Viva Payments."],
        },
        {
          heading: "Bonifico bancario",
          paragraphs: [
            "Versamento sul conto bancario dell'azienda. I dati per il versamento sono indicati nella conferma d'ordine. L'ordine viene elaborato dopo la conferma del versamento.",
          ],
        },
        {
          heading: "Metodi di pagamento NON offerti",
          paragraphs: ["Il contrassegno non è supportato."],
        },
        {
          heading: "A credito",
          paragraphs: ["Disponibile esclusivamente per account aziendali (B2B) approvati per il credito."],
        },
      ],
    },
  },

  /* ── Shipping & delivery ──────────────────────────────────────────── */
  "apostoli-paradosi": {
    el: {
      title: "Αποστολή & Παράδοση",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Μεταφορική εταιρεία",
          paragraphs: [
            "Οι αποστολές πραγματοποιούνται μέσω ACS Courier, πανελλαδικά.",
          ],
        },
        {
          heading: "Χρόνος επεξεργασίας και παράδοσης",
          paragraphs: [
            "Η παραγγελία τίθεται σε επεξεργασία εντός 1–2 εργάσιμων ημερών από την επιβεβαίωση πληρωμής. Ο χρόνος παράδοσης εξαρτάται από τη ζώνη προορισμού και εμφανίζεται στο ταμείο πριν την ολοκλήρωση της παραγγελίας.",
          ],
        },
        {
          heading: "Κόστος αποστολής",
          paragraphs: [
            "Το κόστος υπολογίζεται στο ταμείο, με βάση το χρεώσιμο βάρος (πραγματικό ή ογκομετρικό, όποιο είναι μεγαλύτερο) και τη ζώνη παράδοσης. Όλες οι χρεώσεις εμφανίζονται καθαρά πριν την επιβεβαίωση της παραγγελίας — δεν υπάρχουν κρυφές χρεώσεις.",
          ],
        },
        {
          heading: "Δωρεάν αποστολή",
          paragraphs: [
            "Η τυπική αποστολή (ACS Courier) προσφέρεται δωρεάν για παραγγελίες άνω συγκεκριμένου ορίου καθαρής αξίας, το οποίο εμφανίζεται στο καλάθι.",
          ],
        },
        {
          heading: "Παραλαβή από το κατάστημα",
          paragraphs: [
            "Διατίθεται δωρεάν παραλαβή από το κατάστημα στον Πειραιά (Κ. Μαυρομιχάλη 4), συνήθως εντός 2 ωρών από την παραγγελία. Δεν χρεώνονται μεταφορικά στην περίπτωση αυτή.",
          ],
        },
        {
          heading: "Προβλήματα κατά τη μεταφορά",
          paragraphs: [
            "Σε περίπτωση φθοράς ή απώλειας του δέματος κατά τη μεταφορά, ο πελάτης καλείται να επικοινωνήσει άμεσα με την εταιρεία. Η εταιρεία δεν φέρει ευθύνη για καθυστερήσεις που οφείλονται στη μεταφορική εταιρεία, το τελωνείο ή σε λανθασμένα στοιχεία παράδοσης που δόθηκαν από τον πελάτη.",
          ],
        },
      ],
    },
    en: {
      title: "Shipping & Delivery",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Carrier",
          paragraphs: ["Orders are shipped nationwide via ACS Courier."],
        },
        {
          heading: "Processing and delivery time",
          paragraphs: [
            "Orders are processed within 1–2 business days of payment confirmation. Delivery time depends on the destination zone and is shown at checkout before the order is placed.",
          ],
        },
        {
          heading: "Shipping cost",
          paragraphs: [
            "Cost is calculated at checkout, based on chargeable weight (actual or volumetric, whichever is greater) and the delivery zone. All charges are shown clearly before the order is confirmed — there are no hidden fees.",
          ],
        },
        {
          heading: "Free shipping",
          paragraphs: [
            "Standard shipping (ACS Courier) is free for orders above a net-value threshold, shown in the cart.",
          ],
        },
        {
          heading: "Store pickup",
          paragraphs: [
            "Free pickup is available at the Piraeus store (Κ. Μαυρομιχάλη 4), usually ready within 2 hours of ordering. No shipping fee applies in this case.",
          ],
        },
        {
          heading: "Issues in transit",
          paragraphs: [
            "If a parcel is damaged or lost in transit, please contact the company immediately. The company is not liable for delays caused by the courier, customs, or incorrect delivery details supplied by the customer.",
          ],
        },
      ],
    },
    it: {
      title: "Spedizione e Consegna",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Corriere",
          paragraphs: ["Le spedizioni vengono effettuate tramite ACS Courier, in tutta la Grecia."],
        },
        {
          heading: "Tempi di elaborazione e consegna",
          paragraphs: [
            "L'ordine viene elaborato entro 1–2 giorni lavorativi dalla conferma del pagamento. Il tempo di consegna dipende dalla zona di destinazione ed è indicato al checkout prima di completare l'ordine.",
          ],
        },
        {
          heading: "Costo di spedizione",
          paragraphs: [
            "Il costo viene calcolato al checkout, in base al peso tassabile (reale o volumetrico, il maggiore dei due) e alla zona di consegna. Tutti gli addebiti sono mostrati chiaramente prima della conferma dell'ordine — nessun costo nascosto.",
          ],
        },
        {
          heading: "Spedizione gratuita",
          paragraphs: [
            "La spedizione standard (ACS Courier) è gratuita per ordini superiori a una soglia di valore netto, indicata nel carrello.",
          ],
        },
        {
          heading: "Ritiro in negozio",
          paragraphs: [
            "È disponibile il ritiro gratuito presso il negozio del Pireo (Κ. Μαυρομιχάλη 4), solitamente pronto entro 2 ore dall'ordine. In questo caso non viene addebitata alcuna spesa di spedizione.",
          ],
        },
        {
          heading: "Problemi durante il trasporto",
          paragraphs: [
            "In caso di danneggiamento o smarrimento del pacco durante il trasporto, contattare immediatamente l'azienda. L'azienda non è responsabile per ritardi causati dal corriere, dalla dogana o da dati di consegna errati forniti dal cliente.",
          ],
        },
      ],
    },
  },

  /* ── Returns ───────────────────────────────────────────────────────── */
  epistrofes: {
    el: {
      title: "Επιστροφές",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Δικαίωμα υπαναχώρησης",
          paragraphs: [
            "Ο πελάτης έχει δικαίωμα υπαναχώρησης, χωρίς να αναφέρει τον λόγο, εντός 14 ημερολογιακών ημερών από την ημέρα παραλαβής του προϊόντος.",
          ],
        },
        {
          heading: "Κατάσταση προϊόντος",
          paragraphs: [
            "Το προϊόν πρέπει να επιστρέφεται αχρησιμοποίητο, χωρίς φθορά, με άθικτη τη συσκευασία του και όλα τα συνοδευτικά έγγραφα (απόδειξη ή τιμολόγιο).",
          ],
        },
        {
          heading: "Έξοδα επιστροφής",
          paragraphs: [
            "Τα έξοδα επιστροφής επιβαρύνουν τον πελάτη, εκτός εάν το προϊόν είναι ελαττωματικό ή στάλθηκε λανθασμένο — στην περίπτωση αυτή τα έξοδα επιστροφής αναλαμβάνει η εταιρεία.",
          ],
        },
        {
          heading: "Επιστροφή χρημάτων",
          paragraphs: [
            "Η επιστροφή χρημάτων πραγματοποιείται εντός 14 ημερολογιακών ημερών από την ημερομηνία ενημέρωσης της εταιρείας για την υπαναχώρηση, με το ίδιο μέσο πληρωμής που χρησιμοποιήθηκε στην αρχική παραγγελία.",
          ],
        },
        {
          heading: "Εξαιρέσεις",
          paragraphs: [
            "Προϊόντα κατόπιν ειδικής παραγγελίας και αναλώσιμα δεν επιστρέφονται, εκτός εάν αποδειχθούν ελαττωματικά.",
          ],
        },
        {
          heading: "Πώς να ξεκινήσετε μια επιστροφή",
          paragraphs: [
            `Επικοινωνήστε μαζί μας στο ${COMPANY.email} ή στα τηλέφωνα ${COMPANY.phones.join(", ")}, αναφέροντας τον αριθμό παραγγελίας.`,
            `Διεύθυνση: ${COMPANY.address}.`,
          ],
        },
      ],
    },
    en: {
      title: "Returns",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Right of withdrawal",
          paragraphs: [
            "The customer has the right to withdraw from the purchase, without stating a reason, within 14 calendar days of receiving the product.",
          ],
        },
        {
          heading: "Condition of the product",
          paragraphs: [
            "The product must be returned unused, undamaged, with its packaging intact and all accompanying documents (receipt or invoice).",
          ],
        },
        {
          heading: "Return shipping cost",
          paragraphs: [
            "Return shipping is paid by the customer, unless the product is defective or was sent in error — in that case the company covers the return shipping cost.",
          ],
        },
        {
          heading: "Refund",
          paragraphs: [
            "The refund is issued within 14 calendar days from the date the company is notified of the withdrawal, using the same payment method as the original order.",
          ],
        },
        {
          heading: "Exclusions",
          paragraphs: [
            "Special-order products and consumables cannot be returned, unless proven defective.",
          ],
        },
        {
          heading: "How to start a return",
          paragraphs: [
            `Contact us at ${COMPANY.email} or on ${COMPANY.phones.join(", ")}, quoting your order number.`,
            `Address: ${COMPANY.address}.`,
          ],
        },
      ],
    },
    it: {
      title: "Resi",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Diritto di recesso",
          paragraphs: [
            "Il cliente ha diritto di recesso, senza dover indicare il motivo, entro 14 giorni di calendario dalla data di ricezione del prodotto.",
          ],
        },
        {
          heading: "Condizione del prodotto",
          paragraphs: [
            "Il prodotto deve essere restituito inutilizzato, privo di danni, con la confezione integra e tutti i documenti allegati (scontrino o fattura).",
          ],
        },
        {
          heading: "Spese di reso",
          paragraphs: [
            "Le spese di reso sono a carico del cliente, salvo che il prodotto sia difettoso o sia stato spedito per errore — in tal caso le spese di reso sono a carico dell'azienda.",
          ],
        },
        {
          heading: "Rimborso",
          paragraphs: [
            "Il rimborso viene effettuato entro 14 giorni di calendario dalla data in cui l'azienda viene informata del recesso, con lo stesso metodo di pagamento usato per l'ordine originale.",
          ],
        },
        {
          heading: "Esclusioni",
          paragraphs: [
            "I prodotti su ordinazione speciale e i materiali di consumo non sono restituibili, salvo che risultino difettosi.",
          ],
        },
        {
          heading: "Come avviare un reso",
          paragraphs: [
            `Contattaci a ${COMPANY.email} o ai numeri ${COMPANY.phones.join(", ")}, indicando il numero d'ordine.`,
            `Indirizzo: ${COMPANY.address}.`,
          ],
        },
      ],
    },
  },

  /* ── Warranty ──────────────────────────────────────────────────────── */
  eggyiseis: {
    el: {
      title: "Εγγυήσεις",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Επίσημη εγγύηση κατασκευαστή",
          paragraphs: [
            "Όλα τα προϊόντα καλύπτονται από την επίσημη εγγύηση του κατασκευαστή. Η διάρκεια διαφέρει ανά brand και κατηγορία προϊόντος και αναγράφεται στη σελίδα κάθε προϊόντος, όπου είναι γνωστή.",
          ],
        },
        {
          heading: "Τι απαιτείται",
          paragraphs: [
            "Για την ενεργοποίηση της εγγύησης απαιτείται η απόδειξη ή το τιμολόγιο αγοράς. Συνιστάται η φύλαξή τους μαζί με τη συσκευασία του προϊόντος.",
          ],
        },
        {
          heading: "Τι καλύπτει η εγγύηση",
          paragraphs: [
            "Η εγγύηση καλύπτει κατασκευαστικά ελαττώματα υπό κανονική χρήση. Δεν καλύπτει φθορά από κανονική χρήση, ζημιά από κακή χρήση ή ατύχημα, ούτε αναλώσιμα εξαρτήματα (π.χ. λεπίδες, μύτες, μπαταρίες σε ορισμένες κατηγορίες).",
          ],
        },
        {
          heading: "Διαδικασία σέρβις",
          paragraphs: [
            "Η επισκευή ή αντικατάσταση γίνεται μέσω των επίσημων εξουσιοδοτημένων σέρβις του κατασκευαστή ή μέσω της εταιρείας, ανάλογα με το brand. Επικοινωνήστε μαζί μας πριν στείλετε το προϊόν, ώστε να σας κατευθύνουμε στη σωστή διαδικασία.",
          ],
        },
        {
          heading: "Επικοινωνία",
          paragraphs: [`${COMPANY.phones.join(", ")} · ${COMPANY.email}`],
        },
      ],
    },
    en: {
      title: "Warranty",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Official manufacturer warranty",
          paragraphs: [
            "All products are covered by the manufacturer's official warranty. Duration varies by brand and product category and is shown on each product page, where known.",
          ],
        },
        {
          heading: "What is required",
          paragraphs: [
            "The receipt or invoice is required to activate the warranty. We recommend keeping it together with the product's packaging.",
          ],
        },
        {
          heading: "What the warranty covers",
          paragraphs: [
            "The warranty covers manufacturing defects under normal use. It does not cover wear from normal use, damage from misuse or accident, or consumable parts (e.g. blades, bits, batteries in certain categories).",
          ],
        },
        {
          heading: "Service process",
          paragraphs: [
            "Repair or replacement is handled through the manufacturer's official authorised service centres, or through the company, depending on the brand. Please contact us before sending the product back, so we can direct you to the right process.",
          ],
        },
        {
          heading: "Contact",
          paragraphs: [`${COMPANY.phones.join(", ")} · ${COMPANY.email}`],
        },
      ],
    },
    it: {
      title: "Garanzia",
      updated: "2026-08-04",
      sections: [
        {
          heading: "Garanzia ufficiale del produttore",
          paragraphs: [
            "Tutti i prodotti sono coperti dalla garanzia ufficiale del produttore. La durata varia in base al brand e alla categoria di prodotto ed è indicata nella pagina di ciascun prodotto, dove nota.",
          ],
        },
        {
          heading: "Cosa è richiesto",
          paragraphs: [
            "Per attivare la garanzia è richiesto lo scontrino o la fattura d'acquisto. Si consiglia di conservarli insieme alla confezione del prodotto.",
          ],
        },
        {
          heading: "Cosa copre la garanzia",
          paragraphs: [
            "La garanzia copre i difetti di fabbricazione in condizioni di uso normale. Non copre l'usura da uso normale, danni da uso improprio o incidenti, né le parti di consumo (es. lame, punte, batterie in alcune categorie).",
          ],
        },
        {
          heading: "Procedura di assistenza",
          paragraphs: [
            "La riparazione o sostituzione avviene tramite i centri di assistenza ufficiali autorizzati dal produttore o tramite l'azienda, a seconda del brand. Contattaci prima di spedire il prodotto, per indirizzarti alla procedura corretta.",
          ],
        },
        {
          heading: "Contatti",
          paragraphs: [`${COMPANY.phones.join(", ")} · ${COMPANY.email}`],
        },
      ],
    },
  },
};

export function getPolicyContent(slug: PolicySlug, locale: Locale): PolicyContent {
  return CONTENT[slug][locale];
}

export const POLICY_SLUGS: PolicySlug[] = [
  "oroi-chrisis",
  "aporrito",
  "tropoi-pliromis",
  "apostoli-paradosi",
  "epistrofes",
  "eggyiseis",
];
