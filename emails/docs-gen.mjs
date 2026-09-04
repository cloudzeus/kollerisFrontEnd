// Παράγει docs/02-Τεκμηρίωση-Templates.md από manifest + samples + templates
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const common = JSON.parse(fs.readFileSync(path.join(SRC, "samples", "_common.json"), "utf8"));

const NOTES = {
  "nl-offers": ["Hero με ποσοστό έκπτωσης σε display 96 px — το «-25%» είναι το μήνυμα, ο τίτλος δευτερεύων.", "Το grid προϊόντων δέχεται `product_rows` = πίνακας από ζεύγη (`[[a,b],[c,d]]`) γιατί το Handlebars του Mailgun δεν έχει modulo· το backend ομαδοποιεί ανά 2. Μονός αριθμός → το τελευταίο ζεύγος έχει ένα στοιχείο.", "Badge `-25%` ανά προϊόν, παλιά τιμή διαγραμμένη σε Steel, νέα σε red-700 mono. Πάντα «με ΦΠΑ 24%» και stock label (πραγματικός αριθμός αν είναι < 10).", "Κλείνει με ink B2B banner (K-cut) — cross-sell προς λογαριασμό συνεργάτη."],
  "nl-news": ["Δομή editorial: τεύχος/μήνας → τίτλος → dark hero με φωτογραφία και accent word σε κόκκινο → stat row → 3 άρθρα → νέα brands (category-row pattern) → Concrete CTA panel.", "`hero.title_before / title_accent / title_after` για να χρωματίζεται μία λέξη/φράση κόκκινη χωρίς HTML στα δεδομένα.", "Τα stats είναι 3 (δεν αντέχει 4 στα 600 px)· τιμές ως strings («9.419+»)."],
  "nl-announcement": ["Νηφάλιο layout χωρίς φωτογραφία: Concrete header με κόκκινο K-cut «ΑΝΑΚΟΙΝΩΣΗ» stamp και ημερομηνία.", "Παράγραφοι ως array `announcement.paragraphs`, key facts ως `announcement.facts[{label,value}]`, note, outline CTA, υπογραφή προσώπου.", "Χρήση: ωράριο, τιμοκατάλογος, αργίες, αλλαγές όρων, νέα διεύθυνση. Μπορεί να πάει σε segment (B2B) μέσω ξεχωριστής mailing list."],
  "account-verify": [
    "Προαιρετικές παρακάμψεις κειμένου, με προεπιλογές τα σχεδιασμένα: `verify.lead` (εισαγωγική παράγραφος), `verify.cta` (ετικέτα κουμπιού), `verify.note` (η σημείωση «Δεν το ζητήσατε εσείς;»). Χρησιμεύουν όταν το ίδιο template εξυπηρετεί διεκδίκηση λογαριασμού πάνω σε υπάρχουσα παραγγελία, όπου η προεπιλεγμένη διατύπωση δεν ισχύει.",
    "Ο `verify.code` είναι προαιρετικός: χωρίς αυτόν το γκρι πλαίσιο δείχνει τον σύνδεσμο για αντιγραφή αντί για άδειο κουτί.","Ένα κουμπί + εναλλακτικός 6ψήφιος κωδικος για όσους δεν ανοίγουν links (Outlook desktop με safe links, κινητά).", "Link μίας χρήσης, 24 ώρες. Note «Δεν το ζητήσατε εσείς;» υποχρεωτικό."],
  "account-welcome": ["Στέλνεται μόνο μετά την επιβεβαίωση. Κόκκινο hero + 3 βήματα με το pattern `01 · τίτλος` + στοιχεία λογαριασμού + B2B note.", "Απαγορεύεται το «Καλώς ήρθατε!» — τίτλος «Ο λογαριασμός σας είναι έτοιμος»."],
  "account-password-reset": ["30 λεπτά, μία χρήση. Δείχνει αίτημα/συσκευή/τοποθεσία/IP ώστε ο χρήστης να αναγνωρίσει phishing.", "Ποτέ ο ίδιος ο κωδικός στο email. Tracking clicks off στο domain."],
  "account-password-changed": ["Security notice. Το μόνο κόκκινο CTA είναι «Κλείδωμα λογαριασμού» μέσα σε red-50 panel — το email δεν έχει άλλο κάλεσμα.", "Στέλνεται πάντα, ακόμη κι αν την αλλαγή την έκανε ο ίδιος ο χρήστης."],
  "account-b2b-pending": ["Επιβεβαιώνει τα στοιχεία που δηλώθηκαν (μετά τον έλεγχο ΑΦΜ) και θέτει προσδοκία SLA. Badge «Σε έλεγχο» amber.", "3 βήματα «Τι ακολουθεί» — ίδιο pattern με το welcome."],
  "account-b2b-approved": ["Κόκκινο hero + 4 οφέλη + στοιχεία λογαριασμού (τιμοκατάλογος, όροι πληρωμής, υπεύθυνος πωλήσεων από ERP) + ink CTA «Πρώτη παραγγελία με κωδικό»."],
  "order-confirmation": [
    "`order.paid` επιλέγει εκδοχή: κατάσταση «Πληρωμένη» με timeline βήμα 02 ενεργό, ή «Ελήφθη» με βήμα 01. Όταν η πληρωμή γίνεται μαζί με την παραγγελία, φεύγει ΑΥΤΟ με `paid=true` και ΔΕΝ στέλνεται `payment-success`.","Το πληρέστερο template: order-head (αριθμός/ημερομηνία/κατάσταση) → timeline βήμα 01 → πίνακας ειδών με εικόνες → totals → διευθύνσεις παράδοσης/τιμολόγησης → σχόλια → 2 CTA → πολιτική αλλαγών.", "Αν η πληρωμή ολοκληρώθηκε ταυτόχρονα (κάρτα), το backend στέλνει αυτό με `status=Πληρωμένη` και timeline `s2=done`, και ΔΕΝ στέλνει `payment-success`.", "`order.discount` κενό = η γραμμή έκπτωσης δεν εμφανίζεται. `order.document_type` = Απόδειξη | Τιμολόγιο."],
  "payment-success": ["Το ποσό σε display 40 px μέσα σε neutral-50 panel, μετά τα στοιχεία συναλλαγής (μέθοδος, κάρτα masked, transaction id, παραστατικό).", "Timeline βήμα 02. Note για παραστατικό (εκδίδεται με την αποστολή)."],
  "payment-failed": [
    "Καμία υπόσχεση κράτησης αποθέματος: το email λέει μόνο ότι δεν έγινε χρέωση. Μια προθεσμία που δεν την τηρεί κανένας μηχανισμός κάνει τον πελάτη να καθυστερήσει νομίζοντας ότι έχει χρόνο.","Badge danger, καμία χρέωση, κράτηση αποθέματος 48 ώρες με ρητή προθεσμία. Κόκκινο CTA «Δοκιμάστε ξανά» → σελίδα πληρωμής της παραγγελίας.", "Εναλλακτική: πίνακας IBAN (4 τράπεζες — Alpha, Eurobank, Εθνική, Πειραιώς όπως στα τιμολόγια) με αιτιολογία = αριθμός παραγγελίας.", "Οι IBAN στα samples είναι placeholders (GR00…) — αντικατάσταση από το backend/config."],
  "payment-pending-bank": [
    "`payment.reference` είναι η αιτιολογία κατάθεσης — δεν είναι πάντα ο αριθμός παραγγελίας. Όπου ο πάροχος πληρωμών δίνει δικό του κωδικό, η κατάθεση που τον αναγράφει ταυτοποιείται αυτόματα.",
    "`payment.card_url` (προαιρετικό) δίνει κόκκινο CTA άμεσης πληρωμής με κάρτα· χωρίς αυτό, κύριο CTA γίνεται το `payment.upload_url`. Αν λείπουν και τα δύο, δεν εμφανίζεται κόκκινο κουμπί αντί για κενό σύνδεσμο.",
    "`payment.hold_for` είναι ελεύθερο κείμενο («48 ώρες», «3 εργάσιμες ημέρες») ώστε να μη ζορίζεται η μονάδα της κράτησης.","Concrete K-cut panel με ποσό και αιτιολογία σε display mono, πίνακας τραπεζών, CTA «Αποστολή αποδεικτικού», πλήρης πίνακας ειδών, note για αλλαγή σε κάρτα."],
  "order-shipped": ["Ink K-cut panel με courier + tracking σε display mono + CTA «Παρακολούθηση» (link courier). Timeline βήμα 03.", "Λίστα ειδών της αποστολής (μπορεί να είναι υποσύνολο)· `shipment.backorder` για τμηματικές παραδόσεις.", "Παραστατικό PDF ως attachment στο ίδιο email."],
  "order-pickup-locker": ["Αντικαθιστά το order-shipped όταν η παράδοση γίνεται σε parcel locker. Κόκκινο K-cut panel με PIN και θυρίδα σε display mono 34 px. Παράλληλο SMS (Twilio) με τον ίδιο PIN.", "Προθεσμία παραλαβής ρητή, οδηγίες 3 βημάτων, χάρτης, note για πρόβλημα."],
  "order-delivered": ["Timeline βήμα 04. Ζητά έλεγχο ειδών εντός 48 ωρών, CTA παραστατικό PDF + επανάληψη παραγγελίας, δύο κάρτες Επιστροφές / Εγγύηση. Προαναγγέλλει το review-request."],
  "order-cancelled": ["Ποιος ακύρωσε, γιατί, τι γίνεται με την πληρωμή (`cancellation.refund_amount` προαιρετικό). Λίστα ακυρωμένων ειδών, ink CTA «Νέα παραγγελία με τα ίδια είδη», note για μη αναγνωρισμένη ακύρωση."],
  "order-refund": ["Ποσό επιστροφής σε display, μέθοδος, ETA 5–10 εργάσιμες, πιστωτικό (PDF), transaction id, είδη που επιστράφηκαν (`refund.items` — υποσύνολο)."],
  "rfp-received": ["Μόνο B2B. Πίνακας κωδικός (+IMPA) / είδος / ποσότητα χωρίς τιμές. SLA απάντησης, υπεύθυνος πωλήσεων από ERP, badge «Σε τιμολόγηση»."],
  "rfp-quote": ["Ink K-cut panel με σύνολο χωρίς ΦΠΑ και κόκκινο CTA «Αποδοχή προσφοράς» (→ μετατροπή σε παραγγελία). Πίνακας με τιμή μονάδας, σύνολο γραμμής, lead time ανά είδος. Ισχύς, όροι πληρωμής/παράδοσης, PDF attachment, outline CTA για σχόλια."],
  "newsletter-confirm": ["Double opt-in. Χωρίς αυτό δεν προστίθεται στη mailing list. Λέει τι θα λαμβάνει και πόσο συχνά (2–4/μήνα). Transactional footer (δεν υπάρχει ακόμη εγγραφή για unsubscribe)."],
  "cart-abandoned": ["Ένα email, 4 ώρες μετά, όχι σειρά. Είδη με badge αποθέματος (`low_stock` → amber «Τελευταία N τεμ.») — η πραγματική σπανιότητα είναι το επιχείρημα, όχι κουπόνι.", "Marketing footer (unsubscribe). Στέλνεται μόνο σε πελάτες με λογαριασμό ή συγκατάθεση."],
  "back-in-stock": ["Μόνο σε όσους ζήτησαν ειδοποίηση. Product card με badge διαθέσιμων τεμαχίων, τιμή (+ τιμή συνεργάτη αν B2B), CTA «Στο καλάθι» → PDP με προσθήκη. Note ότι δεν γίνεται κράτηση. Link κατάργησης ειδοποίησης."],
  "review-request": ["7 ημέρες μετά την παράδοση, μία φορά. Ανά είδος link αξιολόγησης, συν κλίμακα 1–5 για τη συνολική εμπειρία (κάθε κουμπί = link με score, one-click). «Κάτι δεν πήγε καλά; Απαντήστε» πριν την αξιολόγηση."]
};

const flatten = (o, p = "") => Object.entries(o).flatMap(([k, v]) => {
  const key = p ? `${p}.${k}` : k;
  if (Array.isArray(v)) return v.length && typeof v[0] === "object" ? [`${key}[]`, ...flatten(v[0], `${key}[]`)] : [`${key}[]`];
  if (v && typeof v === "object") return flatten(v, key);
  return [key];
});
const partialsUsed = src => [...new Set([...src.matchAll(/\{\{>\s*([\w-]+)/g)].map(m => m[1]))];

let md = `# Kolleris Email System — Τεκμηρίωση Templates

Έκδοση 1.0 · 24 templates · Mailgun (Handlebars) · Παράγεται από \`docs-gen.mjs\` — μην επεξεργάζεστε χειροκίνητα.

## Κοινές μεταβλητές (σε κάθε αποστολή)

Το backend περνά **πάντα** τα παρακάτω μέσω \`h:X-Mailgun-Variables\`, μαζί με τις ειδικές μεταβλητές κάθε template:

| Μεταβλητή | Παράδειγμα | Χρήση |
|---|---|---|
${flatten({ recipient: common.recipient, company: common.company, urls: common.urls }).map(k => {
  const v = k.split(".").reduce((a, b) => a?.[b], common);
  return `| \`${k}\` | ${typeof v === "string" ? v.replace(/\|/g, "\\|") : ""} | ${k.startsWith("urls") ? "footer/header link" : k.startsWith("company") ? "footer legal" : "χαιρετισμός, footer"} |`;
}).join("\n")}
| \`preheader\` | — | Κρυφό κείμενο προεπισκόπησης (ορίζεται στο manifest ανά template, δέχεται μεταβλητές) |

Marketing templates χρησιμοποιούν επιπλέον το Mailgun token \`%unsubscribe_url%\` (αντικαθίσταται αυτόματα από τη mailing list).

## Κοινά blocks (partials)

| Partial | Τι είναι | Παράμετροι |
|---|---|---|
| \`header\` | Logo + links δεξιά (κρύβονται σε mobile) | — |
| \`footer-transactional\` / \`footer-marketing\` | Dark footer· η δεύτερη έχει unsubscribe/προτιμήσεις/προβολή online | — |
| \`button\` / \`button-ink\` / \`button-white\` / \`button-outline\` | 44 px CTA με βέλος, VML padding για Outlook | \`href\`, \`label\`, \`align\` |
| \`hero-red\` | Κόκκινο K-cut panel: eyebrow, H1, κείμενο, λευκό κουμπί | \`eyebrow\`, \`title\`, \`text\`, \`href\`, \`label\` |
| \`section-head\` | Eyebrow + H2 + link δεξιά + ink rule | \`eyebrow\`, \`title\`, \`href\`, \`label\` |
| \`order-head\` | H1 + κουτί αριθμός/ημερομηνία/κατάσταση | \`kicker\`, \`title\`, \`badge\` (style macro), \`status\` |
| \`timeline\` | 4 βήματα παραγγελίας | \`s1..s4\` = \`@done@\` / \`@active@\` / \`@todo@\` |
| \`order-items\` | Πίνακας ειδών + totals (\`order.*\`) | — |
| \`order-addresses\` | Παράδοση / Τιμολόγηση σε 2 στήλες | — |
| \`product-row\` | Γραμμή προϊόντος με εικόνα (μέσα σε \`{{#each}}\`) | — |
| \`kv\` | Γραμμή key/value | \`key\`, \`val\` |
| \`note\` | Panel με 4 px αριστερό border | \`accent\` (χρώμα), \`kicker\`, \`text\` |

`;

for (const [cid, cat] of Object.entries(manifest.categories)) {
  md += `\n---\n\n## ${cat.eyebrow.replace(" / ", " · ")} — ${cat.title}\n\n${cat.description}\n`;
  for (const [id, t] of Object.entries(manifest.templates).filter(([, t]) => t.category === cid)) {
    const src = fs.readFileSync(path.join(SRC, "templates", cid, `${id}.html`), "utf8");
    const samplePath = path.join(SRC, "samples", `${id}.json`);
    const sample = fs.existsSync(samplePath) ? JSON.parse(fs.readFileSync(samplePath, "utf8")) : {};
    // variables actually referenced
    const used = new Set([...src.matchAll(/\{\{#?(?:if|unless|each)?\s*([\w.]+)/g)].map(m => m[1]).filter(v => !["this", "else"].includes(v) && !v.startsWith("urls") && !v.startsWith("recipient") && !v.startsWith("company")));
    const vars = flatten(sample).filter(k => !k.startsWith("urls") && !k.startsWith("recipient"));
    const needsCommonOrder = /order\./.test(src) && !sample.order;
    md += `
### \`${id}\` — ${t.name}

| | |
|---|---|
| **Trigger** | ${t.trigger} |
| **Subject** | ${t.subject} |
| **Preheader** | ${t.preheader} |
| **Footer** | ${t.footer} |
| **Mailgun template** | \`dist/mailgun/${id}.html\` · variables: \`dist/mailgun/${id}.variables.json\` |
| **Blocks** | ${partialsUsed(src).map(p => `\`${p}\``).join(", ") || "—"} |

**Μεταβλητές:** ${vars.length ? vars.map(v => `\`${v}\``).join(", ") : "μόνο οι κοινές"}${needsCommonOrder ? " + `order.*` (βλ. `_common.json`)" : ""}

${(NOTES[id] || []).map(n => `- ${n}`).join("\n")}
`;
  }
}
fs.mkdirSync(path.join(ROOT, "docs"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "docs", "02-Τεκμηρίωση-Templates.md"), md);
console.log("docs ok");
