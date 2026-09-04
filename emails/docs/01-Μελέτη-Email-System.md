# Kolleris Email System — Μελέτη

**Πελάτης:** ΑΦΟΙ ΚΟΛΛΕΡΗ ΙΚΕ (Kolleris) · **Έργο:** Email layouts για newsletter και e-shop (web.kolleris.com)
**Βάση:** Kolleris Design System v1.0 (`11_Design_System`) · **Αποστολή:** Mailgun API · **Έκδοση:** 1.0 · DGSoft, 04.09.2026

---

## 1. Σκοπός και όρια

Η μελέτη ορίζει **πώς μεταφέρεται το Kolleris Design System στο email** και ποια emails χρειάζεται το e-shop για να καλύψει ολόκληρο τον κύκλο ζωής ενός πελάτη — από την εγγραφή μέχρι την αξιολόγηση μετά την παράδοση. Παραδίδονται 24 templates σε 4 οικογένειες, ένα κοινό layout, build system που παράγει έτοιμα Mailgun templates και previews, και η τεκμηρίωση ανά template (`02-Τεκμηρίωση-Templates.md`).

Εκτός σκοπού: η ενσωμάτωση στο backend (Magento → Mailgun), οι ρυθμίσεις DNS του domain, τα κείμενα των επόμενων campaigns. Για όλα αυτά δίνονται οδηγίες, όχι υλοποίηση.

## 2. Το πλαίσιο

Το e-shop (spec `eshopSpecs.docx`) είναι Magento 2.4.7 με Next.js front-end, PIM για περιεχόμενο προϊόντων, ERP (SoftOne) για πελάτες, τιμές, απόθεμα και παραγγελίες. Πληρωμές μέσω Viva / Stripe (redirect), αποστολές μέσω courier (aftersalespro) ή **parcel locker** με PIN μέσω SMS (Twilio). Οι πελάτες B2B εγκρίνονται από διαχειριστή μετά από έλεγχο ΑΦΜ (ΑΑΔΕ) και μπορούν να υποβάλλουν **RFP** (αίτημα προσφοράς). Η ναυτιλιακή αγορά αναζητά με κωδικούς **IMPA**.

Αυτά τα χαρακτηριστικά καθορίζουν το σετ των emails: δεν αρκούν τα «κλασικά» order/shipping — χρειάζονται και locker, RFP, έγκριση B2B, κατάθεση σε τράπεζα.

Το κοινό είναι κατά κύριο λόγο **επαγγελματίες** (συνεργεία, ναυπηγεία, τμήματα προμηθειών). Διαβάζουν email σε κινητό ανάμεσα σε δουλειές, θέλουν αριθμούς (κωδικός, ποσό, tracking, PIN) αμέσως ορατούς, και δεν έχουν υπομονή για marketing ύφος. Το voice του design system («κοφτό, σίγουρο, χωρίς θαυμαστικά») ταιριάζει ακριβώς.

## 3. Ταξινομία emails

| # | Οικογένεια | Templates | Τύπος | Footer | Mailgun stream |
|---|---|---|---|---|---|
| 01 | **Newsletter** | προσφορές · νέα · ανακοίνωση | marketing | unsubscribe | `news.kolleris.com` (mailing list) |
| 02 | **Λογαριασμός** | verify · welcome · password-reset · password-changed · b2b-pending · b2b-approved | transactional | χωρίς unsubscribe | `mail.kolleris.com` |
| 03 | **Παραγγελίες & Πληρωμές** | order-confirmation · payment-success · payment-failed · payment-pending-bank · order-shipped · order-pickup-locker · order-delivered · order-cancelled · order-refund · rfp-received · rfp-quote | transactional | χωρίς unsubscribe | `mail.kolleris.com` |
| 04 | **Lifecycle** | newsletter-confirm (double opt-in) · cart-abandoned · back-in-stock · review-request | 1 transactional + 3 marketing | ανάλογα | ανάλογα |

Ο διαχωρισμός **transactional / marketing** δεν είναι μόνο νομικός (GDPR, ν. 3471/2006 για ηλεκτρονική επικοινωνία). Είναι και τεχνικός: τα marketing emails στέλνονται από ξεχωριστό sending domain, με unsubscribe και χαμηλότερη προτεραιότητα, ώστε ένα κακό campaign να μην επηρεάσει το reputation των emails παραγγελίας.

Τα `cart-abandoned`, `back-in-stock` και `review-request` θεωρούνται marketing (χρειάζονται συγκατάθεση ή προηγούμενη σχέση πελάτη — «soft opt-in» για υπάρχοντες πελάτες σε παρόμοια προϊόντα, με δυνατότητα διαγραφής σε κάθε email). Το `back-in-stock` στέλνεται μόνο σε όποιον το ζήτησε ρητά.

## 4. Customer journeys

**Εγγραφή → αγορά (λιανική)**
`account-verify` → `account-welcome` → (αγορά) `order-confirmation` → `payment-success` → `order-shipped` ή `order-pickup-locker` → `order-delivered` → +7 ημέρες `review-request`

**Εγγραφή B2B**
`account-verify` → `account-welcome` → (αίτηση B2B) `account-b2b-pending` → (έγκριση στο ERP) `account-b2b-approved` → (RFP) `rfp-received` → `rfp-quote` → αποδοχή = `order-confirmation`

**Εξαιρέσεις πληρωμής**
`payment-failed` (κάρτα απορρίφθηκε, κράτηση 48 ωρών, εναλλακτικά κατάθεση) · `payment-pending-bank` (επιλογή κατάθεσης, προθεσμία 3 εργάσιμες) · `order-cancelled` · `order-refund`

**Ανάκτηση / retention**
`cart-abandoned` (1 email στις 4 ώρες, όχι σειρά) · `back-in-stock` · newsletter

**Κανόνες αλληλουχίας:** ένα email ανά γεγονός, ποτέ δύο για το ίδιο γεγονός (π.χ. αν η πληρωμή γίνεται συγχρόνως με την παραγγελία, το `order-confirmation` περιλαμβάνει την κατάσταση «Πληρωμένη» και το `payment-success` παραλείπεται). Η επιβεβαίωση αποστολής στέλνεται μόνο όταν υπάρχει tracking number. Το `review-request` στέλνεται μία φορά ανά παραγγελία και ποτέ αν υπάρχει ανοιχτό ticket/επιστροφή.

## 5. Μεταφορά του Design System στο email

Το email είναι το πιο εχθρικό περιβάλλον για ένα design system: χωρίς web fonts στο Outlook/Gmail, χωρίς CSS grid, χωρίς `clip-path`, με Gmail που κόβει μηνύματα πάνω από 102 KB. Οι αποφάσεις:

| Στοιχείο DS | Στο web | Στο email | Γιατί |
|---|---|---|---|
| Κόκκινο | `#EA3E39` | `#EA3E39` παντού, hover `#D9332E` μόνο σε clients με `<style>` | Ένα κόκκινο, όπως ορίζει το DS |
| Ουδέτερα | 50–950 | canvas `#EFEFEF`, card `#FFFFFF`, borders `#D8D8D8` (Concrete), footer `#111111` | Ίδιες άγκυρες με το έντυπο |
| Display font | GT America Ext / Roboto Flex wdth 130 | **Inter 900 uppercase**, tracking −0.02em, fallback Arial Black | Η extended μορφή δεν φορτώνει σε email clients· η Inter 900 uppercase κρατά τον βιομηχανικό χαρακτήρα και είναι διαθέσιμη μέσω Google Fonts όπου υποστηρίζεται |
| Body / Mono | Inter / JetBrains Mono | Inter / JetBrains Mono με fallback Arial / Consolas, Courier New | Mono για κωδικούς, τιμές, tracking, PIN — όπως στο DS |
| Radius | 0 | 0 — ούτε ένα `border-radius` σε 24 templates | — |
| K-cut chamfer | `clip-path` | **CSS gradients** σε δύο layers (πάνω-δεξιά, κάτω-αριστερά, 22 px) | Λειτουργεί σε Apple Mail, iOS, Gmail (web/app), Outlook.com, Samsung. Στο Outlook desktop (Word engine) πέφτει σε ορθογώνιο — αποδεκτή υποβάθμιση, το κόκκινο block μένει |
| Red safety stripe | — | 4 px κόκκινη γραμμή στην κορυφή κάθε email | Η υπογραφή του συστήματος όταν το chamfer δεν αποδίδεται |
| Slash separator | `/` κόκκινο | `/` κόκκινο σε eyebrows, διευθύνσεις, footer | Από το email signature της Kommigraphics |
| Buttons | 44 px, uppercase +0.08em, βέλος → | td-based buttons 44 px με VML padding για Outlook· primary (κόκκινο), ink, white-on-red, outline | Bulletproof, χωρίς εικόνες |
| Badges | mono 10 px | ίδια, με `●` dot | Κατάσταση παραγγελίας/αποθέματος |
| Category row `01 · ΟΝΟΜΑ` | — | επαναχρησιμοποιείται για βήματα, οφέλη, brands | Το ίδιο pattern σε 8 templates |
| Ελληνικά κεφαλαία | `lang="el"` + `text-transform` | **γραμμένα κεφαλαία χωρίς τόνους στην πηγή** («ΠΑΡΑΓΓΕΛΙΑ», όχι «ΠΑΡΑΓΓΕΛΊΑ») | Το `text-transform` δεν είναι αξιόπιστο σε email clients και τα ελληνικά κεφαλαία με τόνους είναι λάθος |
| Σκιές | μόνο popovers | καμία | Flat-first |
| Motion | GSAP | καμία (μόνο `:hover` χρώμα σε buttons) | — |

Το layout είναι **600 px, single column με προαιρετικές δύο στήλες** που σπάνε σε μία κάτω από 620 px (`.k-col`). Όλα τα κρίσιμα CSS είναι inline (build-time macros), το `<style>` block υπάρχει μόνο για responsive και hover.

## 6. Ανατομία ενός email

```
┌──────────────────────────────┐  4 px κόκκινη γραμμή
│ [logo]      WEB.KOLLERIS.COM │  header, 1 px border
├──────────────────────────────┤
│ eyebrow (mono, red-700)      │
│ H1 UPPERCASE 900             │
│ lead / body                  │
│ [ CTA → ]                    │
│ ─────────────────────────    │
│ blocks: timeline, items,     │
│ key/value, note, panels      │
├──────────────────────────────┤
│ footer #111: logo negative,  │
│ διεύθυνση / τηλ / ωράριο,    │
│ links mono, legal, unsub     │
└──────────────────────────────┘
```

**Κανόνες περιεχομένου**

- Ένα CTA κύριο (κόκκινο) ανά email. Δεύτερο CTA πάντα outline ή ink, ποτέ δεύτερο κόκκινο.
- Ο **αριθμός** που ενδιαφέρει (παραγγελία, ποσό, tracking, PIN) εμφανίζεται σε mono, μεγάλο, πάνω από το fold.
- Timeline 4 βημάτων (Παραγγελία → Πληρωμή → Αποστολή → Παράδοση) σε κάθε email παραγγελίας: το ενεργό βήμα κόκκινο, τα ολοκληρωμένα ink, τα επόμενα γκρι.
- Κάθε transactional email κλείνει με «Δεν το ζητήσατε εσείς;» / «Χρειάζεστε βοήθεια;» note — τηλέφωνο και reply-to.
- Subject ≤ 60 χαρακτήρες, preheader ≤ 90, χωρίς θαυμαστικά, χωρίς emoji, χωρίς «Καλώς ήρθατε!».
- Τιμές πάντα με «€» μετά τον αριθμό και σημείωση ΦΠΑ. Τα ποσά έρχονται **προ-μορφοποιημένα** από το backend (`"537,10 €"`), τα templates δεν κάνουν αριθμητική.

## 7. Τεχνική αρχιτεκτονική

```
src/
  layout.html          σκελετός (head, media queries, stripe, header/content/footer slots)
  partials/*.html      build-time partials: header, footer-*, button-*, hero-red, timeline,
                       order-head, order-items, order-addresses, product-row, kv, note, section-head
  styles.json          style macros ($h1$, $mono$, $badge-ok$, $chamfer-red$ …) — inline στο build
  templates/<cat>/     το περιεχόμενο κάθε email με runtime Handlebars ({{order.number}}, {{#each}})
  samples/*.json       sample data για preview και ως συμβόλαιο για το backend
  manifest.json        subject, preheader, trigger, footer mode ανά template
build.mjs              → dist/mailgun/*.html (flattened Handlebars για Mailgun)
                       → dist/mailgun/*.variables.json (τι πρέπει να στείλει το backend)
                       → dist/preview/*.html + index.html (gallery)
```

Ο διαχωρισμός **build-time** (partials, style macros — σύνταξη `{{> name param="…"}}` και `$macro$`) από **runtime** (Handlebars του Mailgun — `{{var}}`, `{{#if}}`, `{{#each}}`) σημαίνει ότι κάθε αρχείο στο `dist/mailgun/` είναι αυτόνομο, χωρίς includes, έτοιμο για upload μέσω Templates API.

## 8. Mailgun

**Domains.** Δύο sending domains, ώστε τα transactional να μην μοιράζονται reputation με το marketing:

- `mail.kolleris.com` — transactional (account, orders, lifecycle/confirm). Tracking clicks **off** (τα links του locker/reset/verify δεν πρέπει να περνούν από redirect), tracking opens off.
- `news.kolleris.com` — marketing (newsletter, cart, stock, review). Tracking on, unsubscribe on, Mailing Lists.

Και στα δύο: SPF, DKIM 2048, DMARC `p=quarantine` → `p=reject` μετά από 4 εβδομάδες καθαρών reports, custom tracking CNAME (`email.kolleris.com`), TLS required. `From:` `Kolleris <noreply@mail.kolleris.com>` για transactional με `Reply-To: info@kolleris.com` (τα templates λένε «απαντήστε σε αυτό το email» — πρέπει να δουλεύει). Newsletter από `Kolleris <news@news.kolleris.com>`.

**Templates.** Upload μέσω `POST /v3/{domain}/templates` (name = id του template, π.χ. `order-confirmation`, engine handlebars). Versioning: κάθε αλλαγή = νέα version με tag, `active` μετά από test. Script: `mailgun/upload-templates.mjs`.

**Αποστολή transactional.** `POST /v3/mail.kolleris.com/messages` με `template=order-confirmation`, `h:X-Mailgun-Variables={json}` (το περιεχόμενο του αντίστοιχου `*.variables.json` με πραγματικά δεδομένα), `subject` από το manifest (το subject δέχεται τις ίδιες μεταβλητές), `o:tag=order-confirmation`, `h:Reply-To`. Attachments (τιμολόγιο PDF, προσφορά PDF) ως `attachment`.

**Αποστολή newsletter.** Mailing list `newsletter@news.kolleris.com` (και `b2b@news.kolleris.com` για segment B2B). Το `%unsubscribe_url%` στο footer αντικαθίσταται αυτόματα από το Mailgun (με ενεργό unsubscribe tracking προστίθενται και τα `List-Unsubscribe` / `List-Unsubscribe-Post` headers που απαιτούν Gmail/Yahoo από το 2024). Recipient variables (`%recipient.first_name%`) διαθέσιμα για batch. Double opt-in μέσω `newsletter-confirm` πριν την προσθήκη στη λίστα.

**Webhooks.** `delivered`, `failed` (permanent → απενεργοποίηση email στον λογαριασμό, ειδοποίηση), `complained` (→ άμεση διαγραφή από λίστες), `unsubscribed`. Ό,τι επιστρέφει permanent failure σε transactional πρέπει να φαίνεται στον διαχειριστή παραγγελιών.

## 9. Deliverability & συμμόρφωση

- Νέο domain: warm-up 2–3 εβδομάδες, ξεκινώντας από transactional (υψηλό engagement).
- Κάθε marketing email: ταυτότητα αποστολέα (επωνυμία, ΑΦΜ, ΓΕΜΗ, διεύθυνση — υπάρχουν στο footer), λόγος αποστολής, unsubscribe με ένα κλικ, προτιμήσεις.
- Transactional: χωρίς διαφημιστικό περιεχόμενο πέρα από ήπιο cross-sell (B2B note στο welcome) — διαφορετικά χάνουν τον χαρακτήρα τους.
- Δεδομένα στο email: ποτέ ολόκληρος αριθμός κάρτας, ποτέ κωδικός πρόσβασης, IBAN μόνο τα δικά μας. Links με tokens (verify, reset, locker) λήγουν και είναι μίας χρήσης· η διάρκεια αναγράφεται στο email.
- Απόρρητο: το `password-changed` δείχνει συσκευή/τοποθεσία/IP ως μέτρο ασφάλειας — δεν αποθηκεύεται στο Mailgun (log retention ≤ 7 ημέρες).
- Προσβασιμότητα: `role="presentation"` σε tables, `alt` σε εικόνες, `lang="el"`, αντίθεση AA (λευκό σε κόκκινο μόνο σε bold uppercase ≥ 12 px, κόκκινο κείμενο πάντα `#C42A26`), plain-text μέρος (`text=`) σε κάθε αποστολή.

## 10. Rendering matrix

| Client | Chamfer | Web fonts | Στήλες | Σημείωση |
|---|---|---|---|---|
| Apple Mail / iOS Mail | ✓ | ✓ | ✓ | Reference rendering |
| Gmail web / Android / iOS (Google account) | ✓ | ✗ (Arial) | ✓ | `<style>` υποστηρίζεται, media queries ✓ |
| Gmail app με IMAP account | ✓ | ✗ | ✗ (stack χωρίς media query — οι στήλες μένουν 50/50) | αποδεκτό στα 600 px |
| Outlook.com / Outlook iOS-Android | ✓ | ✗ | ✓ | — |
| Outlook desktop Windows (Word engine) | ✗ ορθογώνιο | ✗ (Arial/Consolas) | ✓ | VML padding στα buttons, `mso-line-height-rule:exactly` |
| Samsung Mail | ✓ | ✗ | ✓ | — |
| Thunderbird | ✓ | ✓ | ✓ | — |

Όλα τα templates < 30 KB (όριο clipping Gmail 102 KB). Έλεγχος πριν το go-live: Litmus ή Email on Acid με τα `dist/preview/*.html`, plus πραγματική αποστολή σε Gmail, Outlook desktop, iPhone.

## 11. Εικόνες και assets

Τα emails φορτώνουν εικόνες από `https://web.kolleris.com/email-assets/` (ρυθμίζεται με `ASSETS_URL` στο build). Περιεχόμενο του φακέλου `assets/`: logo horizontal @2x (320×40 → 160×20), logo negative @2x, symbol @2x, placeholders. Οι εικόνες προϊόντων έρχονται από το Bunny CDN του PIM — τετράγωνες, ≥ 352 px για 2×, λευκό ή `#EFEFEF` φόντο. Η hero φωτογραφία του newsletter: 1200×560, JPEG ≤ 150 KB, desaturated με το κόκκινο να μένει (κατά το DS).

Λογότυπο: μόνο PNG (το SVG δεν αποδίδεται σε Gmail/Outlook). Ποτέ επανα-χρωματισμένο. Ελάχιστο πλάτος 140 px.

## 12. Επόμενα βήματα

1. DNS (SPF/DKIM/DMARC) στα δύο subdomains, verification στο Mailgun.
2. Upload assets στο `web.kolleris.com/email-assets/`, `ASSETS_URL=… node build.mjs`.
3. `node mailgun/upload-templates.mjs` — δημιουργεί/ενημερώνει τα 24 templates.
4. Backend: ένα service `sendEmail(templateId, recipient, variables)` που διαβάζει subject/preheader από το `manifest.json` και στέλνει με `h:X-Mailgun-Variables`. Τα `*.variables.json` είναι το συμβόλαιο.
5. Test send σε Gmail / Outlook / iPhone, Litmus pass, διόρθωση, go-live transactional πρώτα, newsletter μετά το warm-up.
6. Μετρήσεις μετά από 30 ημέρες: delivery rate ≥ 99 %, complaint rate < 0,1 %, open rate transactional > 60 %, CTR newsletter, ανάκτηση καλαθιών.
