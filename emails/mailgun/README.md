# Mailgun — οδηγός

## 1. Domains
| Domain | Χρήση | Tracking | Unsubscribe |
|---|---|---|---|
| `mail.kolleris.com` | transactional (account, orders, newsletter-confirm) | off | off |
| `news.kolleris.com` | marketing (nl-*, cart-abandoned, back-in-stock, review-request) | on | on (mailing lists, `%unsubscribe_url%`) |

DNS και στα δύο: SPF, DKIM (2048), DMARC, tracking CNAME (`email.kolleris.com`). Region: EU (`--eu`) για GDPR data residency.

## 2. Build και upload
```bash
ASSETS_URL=https://web.kolleris.com/email-assets node build.mjs
MAILGUN_API_KEY=… MAILGUN_DOMAIN=mail.kolleris.com MAILGUN_DOMAIN_MARKETING=news.kolleris.com \
  node mailgun/upload-templates.mjs --tag v1.0 --eu
```
Το script δημιουργεί το template αν δεν υπάρχει, αλλιώς προσθέτει νέα version και την ενεργοποιεί.

## 3. Αποστολή (transactional)
```
POST https://api.eu.mailgun.net/v3/mail.kolleris.com/messages
from      = Kolleris <noreply@mail.kolleris.com>
h:Reply-To= info@kolleris.com
to        = Νίκος Παπαδόπουλος <n.papadopoulos@example.gr>
subject   = Παραγγελία WK-2026-018342 — ελήφθη          ← manifest.subject, rendered με τις ίδιες μεταβλητές
template  = order-confirmation
h:X-Mailgun-Variables = { …περιεχόμενο του order-confirmation.variables.json… , "preheader": "…" }
o:tag     = order-confirmation
o:tracking-clicks = no
attachment = invoice.pdf (όπου χρειάζεται)
```
Δείτε `send-example.mjs`. Κάθε `dist/mailgun/<id>.variables.json` είναι το **συμβόλαιο δεδομένων** του template — το backend πρέπει να παράγει το ίδιο σχήμα με πραγματικές τιμές (ποσά ήδη μορφοποιημένα, π.χ. `"537,10 €"`).

## 4. Newsletter (mailing lists)
- Λίστες: `newsletter@news.kolleris.com` (όλοι), `b2b@news.kolleris.com` (segment). Μέλη μπαίνουν **μόνο** μετά το double opt-in (`newsletter-confirm`).
- Αποστολή σε λίστα: `to = newsletter@news.kolleris.com`, `template = nl-offers`, `h:X-Mailgun-Variables` για τα δεδομένα του campaign (campaign, product_rows…), `recipient-variables` αυτόματα από τη λίστα (`%recipient.first_name%`).
- Το footer έχει `%unsubscribe_url%` — με ενεργό unsubscribe tracking το Mailgun το αντικαθιστά και προσθέτει `List-Unsubscribe` headers.
- Το `urls.view_online` πρέπει να δείχνει σε hosted έκδοση του newsletter (ίδιο HTML, rendered server-side).

## 5. Webhooks
`delivered`, `permanent_fail` (→ σήμανση email ως invalid στον λογαριασμό + ειδοποίηση διαχειριστή αν είναι παραγγελία), `complained` (→ άμεση απεγγραφή από όλες τις λίστες), `unsubscribed`, `temporary_fail` (log).

## 6. Έλεγχος πριν το go-live
1. `node build.mjs` → άνοιγμα `dist/preview/index.html`, οπτικός έλεγχος.
2. Litmus / Email on Acid με τα `dist/preview/*.html` (Outlook 2016/2019/365 Windows, Gmail web/app, iOS Mail, Outlook.com).
3. `send-example.mjs` σε πραγματικά inbox (Gmail, Outlook, iPhone).
4. mail-tester.com score ≥ 9/10 και για τα δύο domains.
