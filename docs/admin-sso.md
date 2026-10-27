# Σύνδεση στο /admin μέσω HDCtool (SSO) — Kolleris

Οδηγός για τον ιδιοκτήτη και το ops. Ό,τι γράφεται εδώ προέρχεται από τον κώδικα (`src/lib/admin/sso/*`, `src/app/api/admin/sso/*`, `src/auth.ts`).

## 1. Τι είναι

Το προσωπικό μπαίνει στο `https://kolleris.com/admin` με τον λογαριασμό του HDCtool, χωρίς ξεχωριστό κωδικό για το e-shop. Το HDCtool υπογράφει ένα token ES256 διάρκειας 60 δευτερολέπτων και το στέλνει (auto-POST) στο `/api/admin/sso/callback` του e-shop. Το e-shop το ελέγχει με τα δημόσια κλειδιά του HDCtool, συνδέει (ή δημιουργεί) τον `AdminUser` και ανοίγει σύνδεση 12 ωρών. Ο ρόλος ορίζεται μόνο στο HDCtool.

Ροή:

1. Στο `/admin/login` ο χρήστης πατά «Σύνδεση με HDCtool». Το `POST /api/admin/sso/start` γράφει το cookie `sso_state` (5 λεπτά, `SameSite=None; Secure; HttpOnly`) και τον στέλνει στο `HDCTOOL_SSO_URL/sso/eshop?client=kolleris&state=…`.
2. Το HDCtool ζητά σύνδεση αν χρειάζεται, ελέγχει ότι ο χρήστης είναι ενεργός και έχει ρόλο `feature:eshop.kolleris.*`, και υπογράφει το token.
3. Το HDCtool κάνει auto-POST του token στο καταχωρημένο callback (`https://kolleris.com/api/admin/sso/callback`).
4. Το e-shop ελέγχει με τη σειρά: cookie `sso_state`, υπογραφή (μόνο ES256), `iss`/`aud`, λήξη, `state`, μίας χρήσης `jti`, ρόλος. Η πρώτη αποτυχία σταματά τη ροή και γράφεται στο log (`admin_sso_rejected reason=…`). Ο χρήστης βλέπει μόνο «Η σύνδεση δεν ολοκληρώθηκε, ξαναδοκίμασε».
5. Επιτυχία: αντιστοίχιση `AdminUser` (ενότητα 4), εγγραφή `sso_login` στο `AdminAuditLog`, σύνδεση 12 ωρών και ανακατεύθυνση στη σελίδα `/admin/...` που ζητήθηκε.

## 2. Μεταβλητές περιβάλλοντος

| Μεταβλητή | Τι κάνει | Παράδειγμα | Απαιτείται |
|---|---|---|---|
| `ADMIN_SSO` | Τρόπος λειτουργίας: `off` / `both` / `only` (πεζά-κεφαλαία αδιάφορα). Άγνωστη τιμή = `off` και γράφεται μία φορά `admin_sso_bad_mode` στο log. Κενό = `off`. | `both` | Πάντα (προεπιλογή `off`) |
| `ADMIN_SSO_CLIENT_ID` | Το id του eshop στο HDCtool. Μπαίνει στο `client=` και πρέπει να ισούται με το `aud` του token. | `kolleris` | `both`, `only` |
| `HDCTOOL_SSO_URL` | Βάση του HDCtool. Από εδώ γίνεται η ανακατεύθυνση και διαβάζεται το JWKS (`/.well-known/eshop-sso-keys`). Το τελικό `/` αγνοείται. | `https://hdctool.wwa.gr` | `both`, `only` |
| `ADMIN_SSO_ISSUER` | Ο αναμενόμενος εκδότης (`iss`) του token. | `https://hdctool.wwa.gr` | `both`, `only` |
| `ADMIN_EMERGENCY_EMAILS` | Διευθύνσεις έκτακτης ανάγκης, χωρισμένες με κόμμα (πεζά). Κρατούν κωδικό στο `only`. | `ops-emergency@example.gr` | Πρακτικά υποχρεωτική στο `only`, συνιστάται στο `both` |

Κανόνες:

- **`ADMIN_SSO_ISSUER` = `ESHOP_SSO_ISSUER` του HDCtool, χαρακτήρα προς χαρακτήρα.** Το τελικό `/` αγνοείται και στις δύο πλευρές. Αλλιώς κάθε token απορρίπτεται με `bad_claims`.
- **Το callback που έχει καταχωρηθεί στο `ESHOP_SSO_CLIENTS` του HDCtool πρέπει να είναι ακριβώς η origin που χρησιμοποιεί το προσωπικό για το `/admin`, χωρίς redirect μπροστά:** `https://kolleris.com/api/admin/sso/callback`. Το cookie `sso_state` είναι host-only και ένα 301 χάνει το σώμα του POST. Σε άλλο host κάθε σύνδεση αποτυγχάνει με `no_state`.
- **Kolleris:** η `NEXT_PUBLIC_SITE_URL` πρέπει να είναι `https://kolleris.com` στο Coolify. Η προεπιλογή του Dockerfile είναι το παλιό `https://web.kolleris.com`.
- Αν λείπει κάποια από τις `ADMIN_SSO_CLIENT_ID`, `HDCTOOL_SSO_URL`, `ADMIN_SSO_ISSUER`, το SSO θεωρείται μη ρυθμισμένο: η σελίδα login δείχνει μόνο φόρμα κωδικού, και τα `/api/admin/sso/start` και `/callback` απαντούν 404. Προσοχή: η φόρμα κωδικού όμως ελέγχεται μόνο από το `ADMIN_SSO`. Με `only` και ελλιπή ρύθμιση, κωδικό δεν δέχονται παρά μόνο οι διευθύνσεις έκτακτης ανάγκης.

## 3. Τρόποι λειτουργίας

| | Σελίδα `/admin/login` | Σύνδεση με κωδικό | Reset κωδικού |
|---|---|---|---|
| `off` | Μόνο φόρμα κωδικού (όπως πριν) | Όλοι | Δεν υπάρχει reset κωδικού διαχείρισης στο Kolleris |
| `both` | Κουμπί «Σύνδεση με HDCtool» και φόρμα κωδικού | Όλοι όσοι έχουν κωδικό | Ίδιο |
| `only` | Μόνο το κουμπί HDCtool | Μόνο οι `ADMIN_EMERGENCY_EMAILS`, μέσω `/admin/login/emergency` | Ίδιο |

Οι χρήστες που δημιουργήθηκαν από SSO δεν έχουν κωδικό και δεν μπορούν ποτέ να μπουν με κωδικό.

## 4. Ρόλοι

- Στο HDCtool ανατίθενται τα δικαιώματα `feature:eshop.kolleris.admin`, `feature:eshop.kolleris.editor`, `feature:eshop.kolleris.ops` (μέσω `AppRole`). Αν έχει `admin` γίνεται ADMIN. Αλλιώς μόνο `editor` ή μόνο `ops`. Και τα δύο μαζί χωρίς `admin` = απόρριψη «αντικρουόμενοι ρόλοι» από το HDCtool.
- Ο μεταβατικός ρόλος ALL **δεν** δίνει πρόσβαση στο e-shop. Χρειάζεται ρητή ανάθεση.
- **Πρώτη σύνδεση:** αντιστοίχιση με το email (πεζά). Αν υπάρχει τοπικός `AdminUser` με το email και χωρίς δεσμό HDCtool, συνδέεται και κρατά το id και το ιστορικό του. Αν δεν υπάρχει, δημιουργείται νέος χωρίς κωδικό.
- **Επόμενες συνδέσεις:** αντιστοίχιση με το id του HDCtool (`hdctoolUserId`). Αν άλλαξε το email στο HDCtool, ενημερώνεται και εδώ.
- Email που ανήκει ήδη σε άλλο id HDCtool απορρίπτεται (`email_bound_to_other`). Τοπικά ανενεργός χρήστης (`isActive=false`) απορρίπτεται (`disabled_locally`) και δεν ξαναενεργοποιείται.
- Σε κάθε επιτυχή σύνδεση ενημερώνονται ο ρόλος, το όνομα και το `lastLoginAt`. **Ο ρόλος δεν αλλάζει από το e-shop**: ό,τι ορίζεται στο HDCtool ισχύει στην επόμενη σύνδεση (η ενεργή σύνδεση κρατά τον ρόλο μέχρι να λήξει ή να ανακληθεί).
- Αφαίρεση ρόλου στο HDCtool: η επόμενη σύνδεση απορρίπτεται. Για άμεσο αποκλεισμό: `isActive=false` στο e-shop.

## 5. Σύνδεση έκτακτης ανάγκης

- URL: `https://kolleris.com/admin/login/emergency` (κρυφό, δεν υπάρχει σύνδεσμος προς αυτό, `noindex`).
- Μπορούν να το χρησιμοποιήσουν μόνο οι διευθύνσεις στο `ADMIN_EMERGENCY_EMAILS`, και μόνο αν έχουν ήδη τοπικό κωδικό. Σε `only` οποιοσδήποτε άλλος απορρίπτεται.
- Κάθε σύνδεση με κωδικό λογαριασμού έκτακτης ανάγκης (όταν `ADMIN_SSO` δεν είναι `off`) γράφει στο `AdminAuditLog` την ενέργεια `emergency_login` και στο log `admin_emergency_login`.
- Οι διευθύνσεις έκτακτης ανάγκης **δεν** μπορούν να μπουν μέσω HDCtool (λόγος `emergency_account`). Να είναι ειδικοί λογαριασμοί, όχι το καθημερινό email κάποιου.

## 6. Αποτυχίες

Ο χρήστης βλέπει πάντα το ίδιο γενικό μήνυμα. Η αιτία είναι στο log του server: `admin_sso_rejected reason=<λόγος>` (το token δεν γράφεται ποτέ).

| Λόγος | Τι σημαίνει | Τι να ελέγξεις |
|---|---|---|
| `no_state` | Λείπει ή είναι άκυρο το cookie `sso_state` | Το callback ήταν σε άλλο host από εκεί που ξεκίνησε η σύνδεση, redirect μπροστά, πέρασαν 5 λεπτά, μπλοκάρισμα third-party cookies |
| `bad_signature` | Άκυρη υπογραφή, κενό ή υπερβολικό token, λάθος `alg`/`kid` | Κλειδιά HDCtool (`ESHOP_SSO_*`) και JWKS. Μετράει στο όριο |
| `bad_claims` | Λάθος `iss`/`aud`, ελλιπή claims, `iat` στο μέλλον | `ADMIN_SSO_ISSUER` = `ESHOP_SSO_ISSUER`, `ADMIN_SSO_CLIENT_ID` = client id. Μετράει στο όριο |
| `expired` | Το token έληξε (60″ + ανοχή 30″) | Ρολόι του server, ή ο χρήστης καθυστέρησε |
| `state_mismatch` | Το `state` του token δεν ταιριάζει με το cookie | Δύο καρτέλες σύνδεσης ταυτόχρονα, παλιό token |
| `bad_role` | Το `role` δεν είναι ADMIN/EDITOR/OPS | Έκδοση του HDCtool. Μετράει στο όριο |
| `jwks_unavailable` | Δεν υπάρχουν διαθέσιμα κλειδιά για το `kid` | `HDCTOOL_SSO_URL`, πρόσβαση στο `/.well-known/eshop-sso-keys`, HDCtool εκτός λειτουργίας και χωρίς cache |
| `replay` | Το `jti` έχει ήδη χρησιμοποιηθεί | Συνήθως Back/refresh στη σελίδα auto-POST. Αν επαναλαμβάνεται, ύποπτο |
| `rate_limited` | Πάνω από το όριο αποτυχιών της IP | Δες παρακάτω |
| `emergency_account` | Το email είναι στο `ADMIN_EMERGENCY_EMAILS` | Χρήση λογαριασμού έκτακτης ανάγκης μέσω SSO. Να μπει με κωδικό |
| `email_bound_to_other` | Το email ανήκει ήδη σε άλλο id HDCtool (ή ταυτόχρονη δημιουργία) | Διπλός λογαριασμός/αλλαγή email. Έλεγχος του `AdminUser` |
| `disabled_locally` | Ο `AdminUser` είναι `isActive=false` (ή ανενεργός τη στιγμή της σύνδεσης) | Ενεργοποίηση από τη διαχείριση χρηστών, αν το θέλεις |

**Όριο ρυθμού:** 5 καταμετρούμενες αποτυχίες (`bad_signature`, `bad_claims`, `bad_role`) ανά IP σε 15 λεπτά, μετά `rate_limited`. Οι υπόλοιπες αποτυχίες δεν μετρούν. Όσο ισχύει το κλείδωμα δεν γράφονται νέες αποτυχίες. Μία κοινή IP γραφείου μετράει ως μία: λάθη πολλών ατόμων αθροίζονται.

Αν το HDCtool αρνείται πριν γυρίσει στο e-shop (δεν έχεις πρόσβαση, αντικρουόμενοι ρόλοι), το μήνυμα εμφανίζεται στο HDCtool και όχι εδώ.

## 7. Εγκατάσταση (rollout)

1. **HDCtool:** δημιουργία ζεύγους κλειδιών ES256, ορισμός env (`ESHOP_SSO_ISSUER`, `ESHOP_SSO_CLIENTS` με callback `https://kolleris.com/api/admin/sso/callback`, κλειδιά), deploy, έλεγχος ότι το `HDCTOOL_SSO_URL/.well-known/eshop-sso-keys` επιστρέφει το κλειδί. Ανάθεση ρόλων `feature:eshop.kolleris.*` στο προσωπικό.
2. **Migration στην prod βάση** (`20261027150000_admin_sso`, μόνο προσθήκες: στήλη `hdctoolUserId`, `passwordHash` ως προαιρετικό, πίνακας `admin_sso_jti`):
   - read-only diff του σχήματος της prod με το Prisma schema,
   - εφαρμογή μόνο των προσθετικών αλλαγών,
   - νέο diff, που πρέπει να βγει **κενό**.
   - Ποτέ `--accept-data-loss`.
3. **Env του e-shop:** `ADMIN_SSO=both`, `ADMIN_SSO_CLIENT_ID`, `HDCTOOL_SSO_URL`, `ADMIN_SSO_ISSUER`, `ADMIN_EMERGENCY_EMAILS`, `NEXT_PUBLIC_SITE_URL=https://kolleris.com` (Coolify). Μετά deploy.
4. **Δοκιμή:** κάθε μέλος του προσωπικού μπαίνει μία φορά με «Σύνδεση με HDCtool», ώστε να δεθεί ο λογαριασμός του. Έλεγχος ρόλου και ότι ο λογαριασμός έκτακτης ανάγκης μπαίνει στο `/admin/login/emergency`.
5. **Μετάβαση σε `ADMIN_SSO=only`** όταν όλοι μπαίνουν μέσω HDCtool.

## 8. Επιστροφή (rollback)

- `only` → `both` → `off`, αλλάζοντας μόνο το `ADMIN_SSO` και κάνοντας redeploy. Δεν χρειάζεται αλλαγή στη βάση, και οι υπάρχοντες λογαριασμοί δεν επηρεάζονται.
- Εναλλαγή κλειδιού: το νέο κλειδί γίνεται κύριο και το παλιό μπαίνει ως `PREVIOUS` στο HDCtool, ώστε το JWKS να δείχνει και τα δύο. Το e-shop κρατά τα κλειδιά 1 ώρα (ξαναδιαβάζει σε άγνωστο `kid`, το πολύ μία φορά ανά λεπτό). Μετά από 1 ώρα αφαιρείται το `PREVIOUS`.
