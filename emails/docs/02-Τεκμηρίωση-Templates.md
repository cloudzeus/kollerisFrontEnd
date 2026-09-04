# Kolleris Email System — Τεκμηρίωση Templates

Έκδοση 1.0 · 24 templates · Mailgun (Handlebars) · Παράγεται από `docs-gen.mjs` — μην επεξεργάζεστε χειροκίνητα.

## Κοινές μεταβλητές (σε κάθε αποστολή)

Το backend περνά **πάντα** τα παρακάτω μέσω `h:X-Mailgun-Variables`, μαζί με τις ειδικές μεταβλητές κάθε template:

| Μεταβλητή | Παράδειγμα | Χρήση |
|---|---|---|
| `recipient.first_name` | Νίκος | χαιρετισμός, footer |
| `recipient.last_name` | Παπαδόπουλος | χαιρετισμός, footer |
| `recipient.email` | n.papadopoulos@example.gr | χαιρετισμός, footer |
| `company.name` | ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ | footer legal |
| `company.vat` | 801234567 | footer legal |
| `company.gemi` | 123456789000 | footer legal |
| `urls.home` | https://kolleris.com | footer/header link |
| `urls.shop` | https://web.kolleris.com | footer/header link |
| `urls.account` | https://web.kolleris.com/account | footer/header link |
| `urls.orders` | https://web.kolleris.com/account/orders | footer/header link |
| `urls.b2b` | https://web.kolleris.com/b2b | footer/header link |
| `urls.contact` | https://web.kolleris.com/contact | footer/header link |
| `urls.terms` | https://web.kolleris.com/terms | footer/header link |
| `urls.privacy` | https://web.kolleris.com/privacy | footer/header link |
| `urls.preferences` | https://web.kolleris.com/newsletter/preferences | footer/header link |
| `urls.view_online` | https://web.kolleris.com/newsletter/view/2026-09 | footer/header link |
| `urls.quick_order` | https://web.kolleris.com/quick-order | footer/header link |
| `urls.offers` | https://web.kolleris.com/offers | footer/header link |
| `urls.new` | https://web.kolleris.com/new | footer/header link |
| `urls.brands` | https://web.kolleris.com/brands | footer/header link |
| `urls.support` | https://web.kolleris.com/support | footer/header link |
| `preheader` | — | Κρυφό κείμενο προεπισκόπησης (ορίζεται στο manifest ανά template, δέχεται μεταβλητές) |

Marketing templates χρησιμοποιούν επιπλέον το Mailgun token `%unsubscribe_url%` (αντικαθίσταται αυτόματα από τη mailing list).

## Κοινά blocks (partials)

| Partial | Τι είναι | Παράμετροι |
|---|---|---|
| `header` | Logo + links δεξιά (κρύβονται σε mobile) | — |
| `footer-transactional` / `footer-marketing` | Dark footer· η δεύτερη έχει unsubscribe/προτιμήσεις/προβολή online | — |
| `button` / `button-ink` / `button-white` / `button-outline` | 44 px CTA με βέλος, VML padding για Outlook | `href`, `label`, `align` |
| `hero-red` | Κόκκινο K-cut panel: eyebrow, H1, κείμενο, λευκό κουμπί | `eyebrow`, `title`, `text`, `href`, `label` |
| `section-head` | Eyebrow + H2 + link δεξιά + ink rule | `eyebrow`, `title`, `href`, `label` |
| `order-head` | H1 + κουτί αριθμός/ημερομηνία/κατάσταση | `kicker`, `title`, `badge` (style macro), `status` |
| `timeline` | 4 βήματα παραγγελίας | `s1..s4` = `@done@` / `@active@` / `@todo@` |
| `order-items` | Πίνακας ειδών + totals (`order.*`) | — |
| `order-addresses` | Παράδοση / Τιμολόγηση σε 2 στήλες | — |
| `product-row` | Γραμμή προϊόντος με εικόνα (μέσα σε `{{#each}}`) | — |
| `kv` | Γραμμή key/value | `key`, `val` |
| `note` | Panel με 4 px αριστερό border | `accent` (χρώμα), `kicker`, `text` |


---

## 01 · Marketing — Newsletter

Μαζικές αποστολές (Mailgun mailing list, %unsubscribe_url%). Τρία layouts που καλύπτουν προσφορές, ενημερωτικά νέα και επίσημες ανακοινώσεις.

### `nl-offers` — Newsletter — Προσφορές

| | |
|---|---|
| **Trigger** | Χειροκίνητη αποστολή από το marketing (campaign) |
| **Subject** | -25% σε Knipex έως 30/09 — Προσφορές Σεπτεμβρίου |
| **Preheader** | Πένσες, κόφτες και σετ Knipex σε τιμές που δεν επαναλαμβάνονται. Ισχύει έως 30.09 ή μέχρι εξαντλήσεως. |
| **Footer** | marketing |
| **Mailgun template** | `dist/mailgun/nl-offers.html` · variables: `dist/mailgun/nl-offers.variables.json` |
| **Blocks** | `button-white`, `section-head`, `button` |

**Μεταβλητές:** `campaign.eyebrow`, `campaign.discount`, `campaign.title`, `campaign.text`, `campaign.url`, `campaign.valid_until`, `product_rows[]`, `product_rows[].0.brand`, `product_rows[].0.sku`, `product_rows[].0.name`, `product_rows[].0.price_old`, `product_rows[].0.price`, `product_rows[].0.discount`, `product_rows[].0.stock_label`, `product_rows[].0.image`, `product_rows[].0.url`, `product_rows[].1.brand`, `product_rows[].1.sku`, `product_rows[].1.name`, `product_rows[].1.price_old`, `product_rows[].1.price`, `product_rows[].1.discount`, `product_rows[].1.stock_label`, `product_rows[].1.image`, `product_rows[].1.url`

- Hero με ποσοστό έκπτωσης σε display 96 px — το «-25%» είναι το μήνυμα, ο τίτλος δευτερεύων.
- Το grid προϊόντων δέχεται `product_rows` = πίνακας από ζεύγη (`[[a,b],[c,d]]`) γιατί το Handlebars του Mailgun δεν έχει modulo· το backend ομαδοποιεί ανά 2. Μονός αριθμός → το τελευταίο ζεύγος έχει ένα στοιχείο.
- Badge `-25%` ανά προϊόν, παλιά τιμή διαγραμμένη σε Steel, νέα σε red-700 mono. Πάντα «με ΦΠΑ 24%» και stock label (πραγματικός αριθμός αν είναι < 10).
- Κλείνει με ink B2B banner (K-cut) — cross-sell προς λογαριασμό συνεργάτη.

### `nl-news` — Newsletter — Νέα

| | |
|---|---|
| **Trigger** | Μηνιαία αποστολή (1η εργάσιμη κάθε μήνα) |
| **Subject** | Νέα Σεπτεμβρίου: 3 νέα brands, 480 νέοι κωδικοί, παράδοση σε 24 ώρες |
| **Preheader** | Τι άλλαξε στο web.kolleris.com αυτόν τον μήνα. |
| **Footer** | marketing |
| **Mailgun template** | `dist/mailgun/nl-news.html` · variables: `dist/mailgun/nl-news.variables.json` |
| **Blocks** | `button`, `section-head`, `button-ink` |

**Μεταβλητές:** `issue.label`, `issue.number`, `issue.title`, `issue.intro`, `hero.image`, `hero.image_alt`, `hero.url`, `hero.eyebrow`, `hero.title_before`, `hero.title_accent`, `hero.title_after`, `hero.text`, `hero.cta`, `stats[]`, `stats[].value`, `stats[].label`, `articles[]`, `articles[].index`, `articles[].tag`, `articles[].title`, `articles[].excerpt`, `articles[].cta`, `articles[].url`, `articles[].image`, `brands[]`, `brands[].index`, `brands[].name`, `brands[].category`, `brands[].codes`, `brands[].url`

- Δομή editorial: τεύχος/μήνας → τίτλος → dark hero με φωτογραφία και accent word σε κόκκινο → stat row → 3 άρθρα → νέα brands (category-row pattern) → Concrete CTA panel.
- `hero.title_before / title_accent / title_after` για να χρωματίζεται μία λέξη/φράση κόκκινη χωρίς HTML στα δεδομένα.
- Τα stats είναι 3 (δεν αντέχει 4 στα 600 px)· τιμές ως strings («9.419+»).

### `nl-announcement` — Newsletter — Ανακοίνωση

| | |
|---|---|
| **Trigger** | Ad hoc, επίσημη ανακοίνωση προς όλη τη λίστα ή προς B2B segment |
| **Subject** | Ανακοίνωση: Αλλαγή ωραρίου και νέος τιμοκατάλογος από 1/10 |
| **Preheader** | Τι ισχύει από 1 Οκτωβρίου για παραδόσεις, ωράριο και τιμές. |
| **Footer** | marketing |
| **Mailgun template** | `dist/mailgun/nl-announcement.html` · variables: `dist/mailgun/nl-announcement.variables.json` |
| **Blocks** | `kv`, `note`, `button-outline` |

**Μεταβλητές:** `announcement.date`, `announcement.eyebrow`, `announcement.title`, `announcement.lead`, `announcement.paragraphs[]`, `announcement.facts[]`, `announcement.facts[].label`, `announcement.facts[].value`, `announcement.note`, `announcement.url`, `announcement.cta`, `announcement.signature_name`, `announcement.signature_role`

- Νηφάλιο layout χωρίς φωτογραφία: Concrete header με κόκκινο K-cut «ΑΝΑΚΟΙΝΩΣΗ» stamp και ημερομηνία.
- Παράγραφοι ως array `announcement.paragraphs`, key facts ως `announcement.facts[{label,value}]`, note, outline CTA, υπογραφή προσώπου.
- Χρήση: ωράριο, τιμοκατάλογος, αργίες, αλλαγές όρων, νέα διεύθυνση. Μπορεί να πάει σε segment (B2B) μέσω ξεχωριστής mailing list.

---

## 02 · Λογαριασμος — Λογαριασμός

Transactional emails του κύκλου ζωής ενός λογαριασμού: επιβεβαίωση email, ενεργοποίηση, κωδικοί πρόσβασης, έγκριση B2B.

### `account-verify` — Επιβεβαίωση email

| | |
|---|---|
| **Trigger** | Register → πριν την ενεργοποίηση (link λήγει σε 24 ώρες) |
| **Subject** | Επιβεβαιώστε το email σας — Kolleris |
| **Preheader** | Ένα κλικ για να ενεργοποιηθεί ο λογαριασμός σας. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/account-verify.html` · variables: `dist/mailgun/account-verify.variables.json` |
| **Blocks** | `button`, `note` |

**Μεταβλητές:** `verify.url`, `verify.expires_in`, `verify.code`, `verify.manual_url`, `verify.manual_url_label`

- Προαιρετικές παρακάμψεις κειμένου, με προεπιλογές τα σχεδιασμένα: `verify.lead` (εισαγωγική παράγραφος), `verify.cta` (ετικέτα κουμπιού), `verify.note` (η σημείωση «Δεν το ζητήσατε εσείς;»). Χρησιμεύουν όταν το ίδιο template εξυπηρετεί διεκδίκηση λογαριασμού πάνω σε υπάρχουσα παραγγελία, όπου η προεπιλεγμένη διατύπωση δεν ισχύει.
- Ο `verify.code` είναι προαιρετικός: χωρίς αυτόν το γκρι πλαίσιο δείχνει τον σύνδεσμο για αντιγραφή αντί για άδειο κουτί.
- Ένα κουμπί + εναλλακτικός 6ψήφιος κωδικος για όσους δεν ανοίγουν links (Outlook desktop με safe links, κινητά).
- Link μίας χρήσης, 24 ώρες. Note «Δεν το ζητήσατε εσείς;» υποχρεωτικό.

### `account-welcome` — Ο λογαριασμός είναι έτοιμος

| | |
|---|---|
| **Trigger** | Μετά την επιβεβαίωση email |
| **Subject** | Ο λογαριασμός σας είναι έτοιμος |
| **Preheader** | Γρήγορη παραγγελία με κωδικό, ιστορικό, τιμές συνεργάτη. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/account-welcome.html` · variables: `dist/mailgun/account-welcome.variables.json` |
| **Blocks** | `hero-red`, `kv`, `note` |

**Μεταβλητές:** `account.customer_code`, `account.type`, `steps[]`, `steps[].index`, `steps[].title`, `steps[].text`, `steps[].cta`, `steps[].url`

- Στέλνεται μόνο μετά την επιβεβαίωση. Κόκκινο hero + 3 βήματα με το pattern `01 · τίτλος` + στοιχεία λογαριασμού + B2B note.
- Απαγορεύεται το «Καλώς ήρθατε!» — τίτλος «Ο λογαριασμός σας είναι έτοιμος».

### `account-password-reset` — Επαναφορά κωδικού

| | |
|---|---|
| **Trigger** | Forgot password |
| **Subject** | Επαναφορά κωδικού πρόσβασης |
| **Preheader** | Ο σύνδεσμος ισχύει για 30 λεπτά. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/account-password-reset.html` · variables: `dist/mailgun/account-password-reset.variables.json` |
| **Blocks** | `button`, `kv`, `note` |

**Μεταβλητές:** `reset.url`, `reset.expires_in`, `reset.requested_at`, `reset.device`, `reset.location`, `reset.ip`

- 30 λεπτά, μία χρήση. Δείχνει αίτημα/συσκευή/τοποθεσία/IP ώστε ο χρήστης να αναγνωρίσει phishing.
- Ποτέ ο ίδιος ο κωδικός στο email. Tracking clicks off στο domain.

### `account-password-changed` — Ο κωδικός άλλαξε

| | |
|---|---|
| **Trigger** | Μετά από επιτυχή αλλαγή/επαναφορά κωδικού |
| **Subject** | Ο κωδικός πρόσβασής σας άλλαξε |
| **Preheader** | Αν δεν το κάνατε εσείς, επικοινωνήστε άμεσα μαζί μας. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/account-password-changed.html` · variables: `dist/mailgun/account-password-changed.variables.json` |
| **Blocks** | `kv`, `button` |

**Μεταβλητές:** `change.at`, `change.device`, `change.location`, `change.ip`, `change.lock_url`

- Security notice. Το μόνο κόκκινο CTA είναι «Κλείδωμα λογαριασμού» μέσα σε red-50 panel — το email δεν έχει άλλο κάλεσμα.
- Στέλνεται πάντα, ακόμη κι αν την αλλαγή την έκανε ο ίδιος ο χρήστης.

### `account-b2b-pending` — Αίτημα B2B — ελήφθη

| | |
|---|---|
| **Trigger** | Υποβολή φόρμας B2B (μετά τον έλεγχο ΑΦΜ) |
| **Subject** | Λάβαμε το αίτημά σας για λογαριασμό B2B |
| **Preheader** | Έλεγχος στοιχείων εντός 1–2 εργάσιμων ημερών. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/account-b2b-pending.html` · variables: `dist/mailgun/account-b2b-pending.variables.json` |
| **Blocks** | `kv`, `note` |

**Μεταβλητές:** `b2b.request_number`, `b2b.company_name`, `b2b.sla`, `b2b.vat`, `b2b.doy`, `b2b.activity`, `b2b.address`, `b2b.contact_name`, `b2b.contact_phone`, `next_steps[]`, `next_steps[].index`, `next_steps[].text`

- Επιβεβαιώνει τα στοιχεία που δηλώθηκαν (μετά τον έλεγχο ΑΦΜ) και θέτει προσδοκία SLA. Badge «Σε έλεγχο» amber.
- 3 βήματα «Τι ακολουθεί» — ίδιο pattern με το welcome.

### `account-b2b-approved` — Λογαριασμός B2B — εγκρίθηκε

| | |
|---|---|
| **Trigger** | Έγκριση από διαχειριστή (ERP → e-shop) |
| **Subject** | Ο λογαριασμός B2B εγκρίθηκε — τιμές συνεργάτη ενεργές |
| **Preheader** | Συνδεθείτε για να δείτε τις τιμές σας. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/account-b2b-approved.html` · variables: `dist/mailgun/account-b2b-approved.variables.json` |
| **Blocks** | `hero-red`, `kv`, `button-ink` |

**Μεταβλητές:** `b2b.company_name`, `b2b.customer_code`, `b2b.price_list`, `b2b.payment_terms`, `b2b.sales_rep`, `b2b.sales_rep_phone`, `benefits[]`, `benefits[].index`, `benefits[].title`, `benefits[].text`

- Κόκκινο hero + 4 οφέλη + στοιχεία λογαριασμού (τιμοκατάλογος, όροι πληρωμής, υπεύθυνος πωλήσεων από ERP) + ink CTA «Πρώτη παραγγελία με κωδικό».

---

## 03 · Παραγγελιες — Παραγγελίες & Πληρωμές

Από την επιβεβαίωση παραγγελίας μέχρι την παράδοση, με timeline κατάστασης, πίνακα ειδών, πληρωμές (Viva/Stripe/κατάθεση), courier, parcel locker, ακυρώσεις, επιστροφές και RFP για B2B.

### `order-confirmation` — Επιβεβαίωση παραγγελίας

| | |
|---|---|
| **Trigger** | Order placed (Magento → ERP) |
| **Subject** | Παραγγελία {{order.number}} — ελήφθη |
| **Preheader** | {{order.items_count}} είδη · {{order.total}} · παράδοση {{order.eta}} |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/order-confirmation.html` · variables: `dist/mailgun/order-confirmation.variables.json` |
| **Blocks** | `order-head`, `timeline`, `order-items`, `order-addresses`, `note`, `button`, `button-outline` |

**Μεταβλητές:** μόνο οι κοινές + `order.*` (βλ. `_common.json`)

- `order.paid` επιλέγει εκδοχή: κατάσταση «Πληρωμένη» με timeline βήμα 02 ενεργό, ή «Ελήφθη» με βήμα 01. Όταν η πληρωμή γίνεται μαζί με την παραγγελία, φεύγει ΑΥΤΟ με `paid=true` και ΔΕΝ στέλνεται `payment-success`.
- Το πληρέστερο template: order-head (αριθμός/ημερομηνία/κατάσταση) → timeline βήμα 01 → πίνακας ειδών με εικόνες → totals → διευθύνσεις παράδοσης/τιμολόγησης → σχόλια → 2 CTA → πολιτική αλλαγών.
- Αν η πληρωμή ολοκληρώθηκε ταυτόχρονα (κάρτα), το backend στέλνει αυτό με `status=Πληρωμένη` και timeline `s2=done`, και ΔΕΝ στέλνει `payment-success`.
- `order.discount` κενό = η γραμμή έκπτωσης δεν εμφανίζεται. `order.document_type` = Απόδειξη | Τιμολόγιο.

### `payment-success` — Πληρωμή — εγκρίθηκε

| | |
|---|---|
| **Trigger** | Payment gateway webhook (Viva / Stripe) → paid |
| **Subject** | Η πληρωμή για την παραγγελία {{order.number}} εγκρίθηκε |
| **Preheader** | {{payment.amount}} με {{payment.method}}. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/payment-success.html` · variables: `dist/mailgun/payment-success.variables.json` |
| **Blocks** | `order-head`, `timeline`, `kv`, `button`, `note` |

**Μεταβλητές:** `payment.amount`, `payment.method`, `payment.card`, `payment.transaction_id`, `payment.at`, `payment.document` + `order.*` (βλ. `_common.json`)

- Το ποσό σε display 40 px μέσα σε neutral-50 panel, μετά τα στοιχεία συναλλαγής (μέθοδος, κάρτα masked, transaction id, παραστατικό).
- Timeline βήμα 02. Note για παραστατικό (εκδίδεται με την αποστολή).

### `payment-failed` — Πληρωμή — απέτυχε

| | |
|---|---|
| **Trigger** | Payment gateway webhook → failed / declined |
| **Subject** | Η πληρωμή δεν ολοκληρώθηκε — παραγγελία {{order.number}} |
| **Preheader** | Η παραγγελία σας κρατείται για 48 ώρες. Δοκιμάστε ξανά ή επιλέξτε άλλον τρόπο πληρωμής. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/payment-failed.html` · variables: `dist/mailgun/payment-failed.variables.json` |
| **Blocks** | `order-head`, `kv`, `button`, `note` |

**Μεταβλητές:** `payment.amount`, `payment.method`, `payment.card`, `payment.reason`, `payment.error_code`, `payment.retry_url` + `order.*` (βλ. `_common.json`)

- Καμία υπόσχεση κράτησης αποθέματος: το email λέει μόνο ότι δεν έγινε χρέωση. Μια προθεσμία που δεν την τηρεί κανένας μηχανισμός κάνει τον πελάτη να καθυστερήσει νομίζοντας ότι έχει χρόνο.
- Badge danger, καμία χρέωση, κράτηση αποθέματος 48 ώρες με ρητή προθεσμία. Κόκκινο CTA «Δοκιμάστε ξανά» → σελίδα πληρωμής της παραγγελίας.
- Εναλλακτική: πίνακας IBAN (4 τράπεζες — Alpha, Eurobank, Εθνική, Πειραιώς όπως στα τιμολόγια) με αιτιολογία = αριθμός παραγγελίας.
- Οι IBAN στα samples είναι placeholders (GR00…) — αντικατάσταση από το backend/config.

### `payment-pending-bank` — Πληρωμή — κατάθεση σε τράπεζα

| | |
|---|---|
| **Trigger** | Order placed με τρόπο πληρωμής «Κατάθεση σε τράπεζα» |
| **Subject** | Στοιχεία κατάθεσης για την παραγγελία {{order.number}} |
| **Preheader** | Ποσό {{order.total}} · αιτιολογία {{order.number}} · προθεσμία 3 εργάσιμες ημέρες. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/payment-pending-bank.html` · variables: `dist/mailgun/payment-pending-bank.variables.json` |
| **Blocks** | `order-head`, `button`, `button-outline`, `order-items`, `note` |

**Μεταβλητές:** `order.number`, `order.date`, `order.url`, `order.items[]`, `order.items[].brand`, `order.items[].sku`, `order.items[].name`, `order.items[].qty`, `order.items[].unit_price`, `order.items[].line_total`, `order.items[].image`, `order.items_count`, `order.subtotal`, `order.discount`, `order.discount_label`, `order.shipping_method`, `order.shipping_cost`, `order.vat`, `order.total`, `order.eta`, `order.payment_method`, `order.document_type`, `order.shipping.name`, `order.shipping.line1`, `order.shipping.line2`, `order.shipping.phone`, `order.billing.name`, `order.billing.line1`, `order.billing.line2`, `order.billing.vat`, `order.billing.doy`, `order.notes`, `order.vat_label`, `payment.reference`, `payment.hold_for`, `payment.deadline`, `payment.card_url`, `payment.upload_url`

- `payment.reference` είναι η αιτιολογία κατάθεσης — δεν είναι πάντα ο αριθμός παραγγελίας. Όπου ο πάροχος πληρωμών δίνει δικό του κωδικό, η κατάθεση που τον αναγράφει ταυτοποιείται αυτόματα.
- `payment.card_url` (προαιρετικό) δίνει κόκκινο CTA άμεσης πληρωμής με κάρτα· χωρίς αυτό, κύριο CTA γίνεται το `payment.upload_url`. Αν λείπουν και τα δύο, δεν εμφανίζεται κόκκινο κουμπί αντί για κενό σύνδεσμο.
- `payment.hold_for` είναι ελεύθερο κείμενο («48 ώρες», «3 εργάσιμες ημέρες») ώστε να μη ζορίζεται η μονάδα της κράτησης.
- Concrete K-cut panel με ποσό και αιτιολογία σε display mono, πίνακας τραπεζών, CTA «Αποστολή αποδεικτικού», πλήρης πίνακας ειδών, note για αλλαγή σε κάρτα.

### `order-shipped` — Αποστολή

| | |
|---|---|
| **Trigger** | ERP status → shipped (tracking number διαθέσιμο) |
| **Subject** | Η παραγγελία {{order.number}} απεστάλη |
| **Preheader** | {{shipment.courier}} · {{shipment.tracking}} · εκτιμώμενη παράδοση {{shipment.eta}} |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/order-shipped.html` · variables: `dist/mailgun/order-shipped.variables.json` |
| **Blocks** | `order-head`, `timeline`, `button`, `product-row`, `kv`, `note` |

**Μεταβλητές:** `shipment.courier`, `shipment.tracking`, `shipment.tracking_url`, `shipment.eta`, `shipment.packages`, `shipment.weight`, `shipment.document`, `shipment.backorder` + `order.*` (βλ. `_common.json`)

- Ink K-cut panel με courier + tracking σε display mono + CTA «Παρακολούθηση» (link courier). Timeline βήμα 03.
- Λίστα ειδών της αποστολής (μπορεί να είναι υποσύνολο)· `shipment.backorder` για τμηματικές παραδόσεις.
- Παραστατικό PDF ως attachment στο ίδιο email.

### `order-pickup-locker` — Παραλαβή από locker

| | |
|---|---|
| **Trigger** | Locker API → parcel deposited (παράλληλα με SMS Twilio) |
| **Subject** | Η παραγγελία {{order.number}} σας περιμένει στο locker |
| **Preheader** | Θυρίδα {{locker.box}} · PIN στο email · παραλαβή έως {{locker.valid_until}} |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/order-pickup-locker.html` · variables: `dist/mailgun/order-pickup-locker.variables.json` |
| **Blocks** | `order-head`, `kv`, `button`, `button-outline`, `note` |

**Μεταβλητές:** `locker.pin`, `locker.box`, `locker.valid_until`, `locker.phone_masked`, `locker.name`, `locker.address`, `locker.hours`, `locker.packages`, `locker.size`, `locker.map_url`, `steps[]`, `steps[].index`, `steps[].text` + `order.*` (βλ. `_common.json`)

- Αντικαθιστά το order-shipped όταν η παράδοση γίνεται σε parcel locker. Κόκκινο K-cut panel με PIN και θυρίδα σε display mono 34 px. Παράλληλο SMS (Twilio) με τον ίδιο PIN.
- Προθεσμία παραλαβής ρητή, οδηγίες 3 βημάτων, χάρτης, note για πρόβλημα.

### `order-delivered` — Παραδόθηκε

| | |
|---|---|
| **Trigger** | Courier webhook → delivered / locker pickup |
| **Subject** | Η παραγγελία {{order.number}} παραδόθηκε |
| **Preheader** | Ελέγξτε τα είδη σας. Πρόβλημα; Απαντήστε σε αυτό το email. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/order-delivered.html` · variables: `dist/mailgun/order-delivered.variables.json` |
| **Blocks** | `order-head`, `timeline`, `product-row`, `button`, `button-outline` |

**Μεταβλητές:** `delivery.at`, `delivery.where`, `delivery.invoice_url`, `delivery.reorder_url`, `delivery.returns_url`, `delivery.warranty_url` + `order.*` (βλ. `_common.json`)

- Timeline βήμα 04. Ζητά έλεγχο ειδών εντός 48 ωρών, CTA παραστατικό PDF + επανάληψη παραγγελίας, δύο κάρτες Επιστροφές / Εγγύηση. Προαναγγέλλει το review-request.

### `order-cancelled` — Ακύρωση

| | |
|---|---|
| **Trigger** | Ακύρωση από πελάτη ή από την Kolleris |
| **Subject** | Η παραγγελία {{order.number}} ακυρώθηκε |
| **Preheader** | {{cancellation.reason}} |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/order-cancelled.html` · variables: `dist/mailgun/order-cancelled.variables.json` |
| **Blocks** | `order-head`, `kv`, `product-row`, `button-ink`, `button-outline`, `note` |

**Μεταβλητές:** `cancellation.at`, `cancellation.by`, `cancellation.reason`, `cancellation.payment_status`, `cancellation.refund_amount`, `cancellation.reorder_url` + `order.*` (βλ. `_common.json`)

- Ποιος ακύρωσε, γιατί, τι γίνεται με την πληρωμή (`cancellation.refund_amount` προαιρετικό). Λίστα ακυρωμένων ειδών, ink CTA «Νέα παραγγελία με τα ίδια είδη», note για μη αναγνωρισμένη ακύρωση.

### `order-refund` — Επιστροφή χρημάτων

| | |
|---|---|
| **Trigger** | Refund issued (gateway / ERP credit note) |
| **Subject** | Επιστροφή {{refund.amount}} για την παραγγελία {{order.number}} |
| **Preheader** | Το ποσό θα εμφανιστεί σε 5–10 εργάσιμες ημέρες, ανάλογα με την τράπεζά σας. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/order-refund.html` · variables: `dist/mailgun/order-refund.variables.json` |
| **Blocks** | `order-head`, `kv`, `product-row`, `button-outline`, `note` |

**Μεταβλητές:** `refund.amount`, `refund.method`, `refund.eta`, `refund.reason`, `refund.credit_note`, `refund.transaction_id`, `refund.at`, `refund.items[]`, `refund.items[].brand`, `refund.items[].sku`, `refund.items[].name`, `refund.items[].qty`, `refund.items[].unit_price`, `refund.items[].line_total`, `refund.items[].image` + `order.*` (βλ. `_common.json`)

- Ποσό επιστροφής σε display, μέθοδος, ETA 5–10 εργάσιμες, πιστωτικό (PDF), transaction id, είδη που επιστράφηκαν (`refund.items` — υποσύνολο).

### `rfp-received` — RFP — ελήφθη (B2B)

| | |
|---|---|
| **Trigger** | B2B πελάτης υποβάλλει RFP (→ ERP) |
| **Subject** | Αίτημα προσφοράς {{rfp.number}} — ελήφθη |
| **Preheader** | {{rfp.items_count}} είδη · απάντηση εντός 1 εργάσιμης ημέρας |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/rfp-received.html` · variables: `dist/mailgun/rfp-received.variables.json` |
| **Blocks** | `note`, `kv`, `button-outline` |

**Μεταβλητές:** `rfp.number`, `rfp.company_name`, `rfp.date`, `rfp.sla`, `rfp.items[]`, `rfp.items[].sku`, `rfp.items[].impa`, `rfp.items[].name`, `rfp.items[].qty`, `rfp.items[].unit`, `rfp.items[].note`, `rfp.items[].unit_price`, `rfp.items[].line_total`, `rfp.items[].lead_time`, `rfp.items_count`, `rfp.notes`, `rfp.delivery_to`, `rfp.needed_by`, `rfp.sales_rep`, `rfp.sales_rep_phone`, `rfp.url`, `rfp.valid_until`, `rfp.total`, `rfp.vat`, `rfp.total_incl`, `rfp.accept_url`, `rfp.discuss_url`, `rfp.payment_terms`, `rfp.delivery_terms`, `rfp.pdf_url`

- Μόνο B2B. Πίνακας κωδικός (+IMPA) / είδος / ποσότητα χωρίς τιμές. SLA απάντησης, υπεύθυνος πωλήσεων από ERP, badge «Σε τιμολόγηση».

### `rfp-quote` — RFP — προσφορά έτοιμη (B2B)

| | |
|---|---|
| **Trigger** | ERP → quote issued |
| **Subject** | Η προσφορά {{rfp.number}} είναι έτοιμη — ισχύει έως {{rfp.valid_until}} |
| **Preheader** | Σύνολο {{rfp.total}} χωρίς ΦΠΑ. Αποδοχή με ένα κλικ. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/rfp-quote.html` · variables: `dist/mailgun/rfp-quote.variables.json` |
| **Blocks** | `button`, `kv`, `button-outline` |

**Μεταβλητές:** `rfp.number`, `rfp.company_name`, `rfp.date`, `rfp.sla`, `rfp.items[]`, `rfp.items[].sku`, `rfp.items[].impa`, `rfp.items[].name`, `rfp.items[].qty`, `rfp.items[].unit`, `rfp.items[].note`, `rfp.items[].unit_price`, `rfp.items[].line_total`, `rfp.items[].lead_time`, `rfp.items_count`, `rfp.notes`, `rfp.delivery_to`, `rfp.needed_by`, `rfp.sales_rep`, `rfp.sales_rep_phone`, `rfp.url`, `rfp.valid_until`, `rfp.total`, `rfp.vat`, `rfp.total_incl`, `rfp.accept_url`, `rfp.discuss_url`, `rfp.payment_terms`, `rfp.delivery_terms`, `rfp.pdf_url`

- Ink K-cut panel με σύνολο χωρίς ΦΠΑ και κόκκινο CTA «Αποδοχή προσφοράς» (→ μετατροπή σε παραγγελία). Πίνακας με τιμή μονάδας, σύνολο γραμμής, lead time ανά είδος. Ισχύς, όροι πληρωμής/παράδοσης, PDF attachment, outline CTA για σχόλια.

---

## 04 · Lifecycle — Lifecycle & Automation

Αυτοματοποιημένα emails που ενεργοποιούνται από συμπεριφορά: double opt-in, εγκαταλελειμμένο καλάθι, επιστροφή σε διαθεσιμότητα, αξιολόγηση.

### `newsletter-confirm` — Double opt-in

| | |
|---|---|
| **Trigger** | Newsletter signup (footer / checkout checkbox) |
| **Subject** | Επιβεβαιώστε την εγγραφή σας στο newsletter |
| **Preheader** | Ένα κλικ και τελειώσαμε. Χωρίς επιβεβαίωση δεν στέλνουμε τίποτα. |
| **Footer** | transactional |
| **Mailgun template** | `dist/mailgun/newsletter-confirm.html` · variables: `dist/mailgun/newsletter-confirm.variables.json` |
| **Blocks** | `button`, `note` |

**Μεταβλητές:** `subscribe.confirm_url`, `subscribe.expires_in`, `what[]`, `what[].index`, `what[].title`, `what[].text`

- Double opt-in. Χωρίς αυτό δεν προστίθεται στη mailing list. Λέει τι θα λαμβάνει και πόσο συχνά (2–4/μήνα). Transactional footer (δεν υπάρχει ακόμη εγγραφή για unsubscribe).

### `cart-abandoned` — Εγκαταλελειμμένο καλάθι

| | |
|---|---|
| **Trigger** | Καλάθι με είδη, χωρίς checkout για 4 ώρες (1 email, όχι σειρά) |
| **Subject** | Το καλάθι σας σας περιμένει — {{cart.items_count}} είδη |
| **Preheader** | Το απόθεμα αλλάζει καθημερινά. Ολοκληρώστε την παραγγελία σας. |
| **Footer** | marketing |
| **Mailgun template** | `dist/mailgun/cart-abandoned.html` · variables: `dist/mailgun/cart-abandoned.variables.json` |
| **Blocks** | `button` |

**Μεταβλητές:** `cart.items_count`, `cart.total`, `cart.url`, `cart.free_shipping_from`, `cart.items[]`, `cart.items[].brand`, `cart.items[].sku`, `cart.items[].name`, `cart.items[].qty`, `cart.items[].unit_price`, `cart.items[].stock_label`, `cart.items[].image`, `cart.items[].url`, `cart.items[].low_stock`

- Ένα email, 4 ώρες μετά, όχι σειρά. Είδη με badge αποθέματος (`low_stock` → amber «Τελευταία N τεμ.») — η πραγματική σπανιότητα είναι το επιχείρημα, όχι κουπόνι.
- Marketing footer (unsubscribe). Στέλνεται μόνο σε πελάτες με λογαριασμό ή συγκατάθεση.

### `back-in-stock` — Ξανά διαθέσιμο

| | |
|---|---|
| **Trigger** | Stock sync (ERP → e-shop) qty 0 → >0 για προϊόν με εγγραφή ειδοποίησης |
| **Subject** | Ξανά διαθέσιμο: {{product.name}} |
| **Preheader** | Το ζητήσατε — μπήκε στο απόθεμα. {{product.stock}} τεμ. αυτή τη στιγμή. |
| **Footer** | marketing |
| **Mailgun template** | `dist/mailgun/back-in-stock.html` · variables: `dist/mailgun/back-in-stock.variables.json` |
| **Blocks** | `button`, `note` |

**Μεταβλητές:** `product.brand`, `product.sku`, `product.name`, `product.price`, `product.price_b2b`, `product.stock`, `product.waitlist`, `product.image`, `product.url`, `product.unwatch_url`

- Μόνο σε όσους ζήτησαν ειδοποίηση. Product card με badge διαθέσιμων τεμαχίων, τιμή (+ τιμή συνεργάτη αν B2B), CTA «Στο καλάθι» → PDP με προσθήκη. Note ότι δεν γίνεται κράτηση. Link κατάργησης ειδοποίησης.

### `review-request` — Αξιολόγηση

| | |
|---|---|
| **Trigger** | 7 ημέρες μετά την παράδοση (μία φορά ανά παραγγελία) |
| **Subject** | Πώς δούλεψαν; Αξιολογήστε την παραγγελία {{order.number}} |
| **Preheader** | 60 δευτερόλεπτα. Βοηθάτε άλλους επαγγελματίες να επιλέξουν σωστά. |
| **Footer** | marketing |
| **Mailgun template** | `dist/mailgun/review-request.html` · variables: `dist/mailgun/review-request.variables.json` |
| **Blocks** | — |

**Μεταβλητές:** `order.number`, `order.date`, `order.url`, `order.items[]`, `order.items[].brand`, `order.items[].sku`, `order.items[].name`, `order.items[].qty`, `order.items[].unit_price`, `order.items[].line_total`, `order.items[].image`, `order.items[].review_url`, `order.items_count`, `order.subtotal`, `order.discount`, `order.discount_label`, `order.shipping_method`, `order.shipping_cost`, `order.vat`, `order.total`, `order.eta`, `order.payment_method`, `order.document_type`, `order.shipping.name`, `order.shipping.line1`, `order.shipping.line2`, `order.shipping.phone`, `order.billing.name`, `order.billing.line1`, `order.billing.line2`, `order.billing.vat`, `order.billing.doy`, `order.notes`, `review.scale[]`, `review.scale[].label`, `review.scale[].url`

- 7 ημέρες μετά την παράδοση, μία φορά. Ανά είδος link αξιολόγησης, συν κλίμακα 1–5 για τη συνολική εμπειρία (κάθε κουμπί = link με score, one-click). «Κάτι δεν πήγε καλά; Απαντήστε» πριν την αξιολόγηση.
