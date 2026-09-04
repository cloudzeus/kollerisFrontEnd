import Handlebars from "handlebars";

/**
 * Πλούσιο κείμενο σε email — και γιατί «πλούσιο» σημαίνει πέντε ετικέτες.
 *
 * ── Το πρόβλημα που λύνει ──────────────────────────────────────────────────
 *
 * Τα templates γράφουν τα πεδία κειμένου ως `{{announcement.lead}}`, δηλαδή
 * ESCAPED. Ό,τι HTML περάσει από εκεί τυπώνεται κυριολεκτικά: ο παραλήπτης
 * βλέπει «<p>Καλησπέρα</p>» με τις γωνιακές αγκύλες. Ένας κλασικός WYSIWYG που
 * παράγει markup θα ήταν, κυριολεκτικά, σπασμένος.
 *
 * ── Γιατί ΔΕΝ κάνουμε τα πεδία raw και τελειώνουμε ─────────────────────────
 *
 * Επειδή τα email δεν είναι σελίδες. Το Outlook (Word engine) αγνοεί `div`,
 * `flex`, margins και τα μισά `style` — η διάταξη κρατιέται από ένθετους
 * πίνακες που έχει ήδη το template. Ελεύθερο HTML μέσα σε κελί πίνακα βγάζει
 * newsletter που δείχνει σωστό στον browser και διαλυμένο στον μισό κόσμο.
 *
 * ── Τι επιτρέπεται, και γιατί ακριβώς αυτά ────────────────────────────────
 *
 *   <strong> <em>  έμφαση — δουλεύουν παντού, δεν επηρεάζουν διάταξη
 *   <a href>       σύνδεσμος — ο λόγος που στέλνουμε το email
 *   <br>           αλλαγή γραμμής μέσα σε παράγραφο
 *
 * Παράγραφοι ΔΕΝ μπαίνουν εδώ: τα templates έχουν δικό τους `{{#each
 * announcement.paragraphs}}`, όπου κάθε παράγραφος παίρνει το σωστό στυλ και τα
 * σωστά κενά. Μία παράγραφος ανά στοιχείο, και το layout παραμένει του
 * template.
 */

/** Οι μόνες ετικέτες που επιβιώνουν. Τα πάντα άλλα αφαιρούνται, το κείμενό τους μένει. */
const ALLOWED = new Set(["strong", "b", "em", "i", "a", "br"]);

function escapeText(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Καθαρίζει HTML σε αυτό το υποσύνολο.
 *
 * Δεν είναι «σχεδόν ασφαλές»: το κείμενο έρχεται από τη διαχείριση, αλλά
 * καταλήγει στα εισερχόμενα χιλιάδων ανθρώπων και σε clients που αποδίδουν
 * HTML. Ένα `onerror` σε εικόνα ή ένα `javascript:` σε href είναι επίθεση που
 * φεύγει με την υπογραφή μας.
 */
export function sanitizeInline(html: string): string {
  let out = "";
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += escapeText(html.slice(i));
      break;
    }
    out += escapeText(html.slice(i, lt));

    /*
     * «<» ΔΕΝ σημαίνει πάντα ετικέτα.
     *
     * Το «μύτες < 5mm» ή το «1/2" > 3/8"» είναι απολύτως φυσιολογικό κείμενο σε
     * κατάστημα εργαλείων, και ο πρώτος parser το κατάπινε ολόκληρο: έβλεπε
     * «< 5mm και 8 >» ως ετικέτα και το πετούσε. Το έπιασε το test, όχι η
     * ανάγνωση του κώδικα.
     *
     * Ετικέτα είναι μόνο «<» που ακολουθείται από γράμμα ή «/». Οτιδήποτε άλλο
     * είναι το σύμβολο «μικρότερο» και γράφεται ως κείμενο.
     */
    if (!/^<\/?[a-zA-Z]/.test(html.slice(lt, lt + 3))) {
      out += "&lt;";
      i = lt + 1;
      continue;
    }

    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      out += escapeText(html.slice(lt));
      break;
    }

    const raw = html.slice(lt + 1, gt).trim();
    const closing = raw.startsWith("/");
    const name = (closing ? raw.slice(1) : raw).split(/[\s/]/)[0]!.toLowerCase();

    if (!ALLOWED.has(name)) {
      // Η ετικέτα πέφτει, το περιεχόμενό της συνεχίζει να διαβάζεται.
      i = gt + 1;
      continue;
    }

    if (name === "br") {
      out += "<br>";
    } else if (closing) {
      out += `</${name === "b" ? "strong" : name === "i" ? "em" : name}>`;
    } else if (name === "a") {
      /*
       * Μόνο http/https/mailto. Το `javascript:` και το `data:` είναι οι δύο
       * τρόποι που ένας σύνδεσμος γίνεται εκτελέσιμος.
       */
      const href = /href\s*=\s*["']([^"']*)["']/i.exec(raw)?.[1] ?? "";
      const safe = /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : "";
      out += safe
        ? `<a href="${escapeText(safe)}" target="_blank" rel="noopener noreferrer">`
        : "<a>";
    } else {
      out += `<${name === "b" ? "strong" : name === "i" ? "em" : name}>`;
    }
    i = gt + 1;
  }

  return out.trim();
}

/**
 * Καθαρισμένο κείμενο που το Handlebars ΔΕΝ θα ξανα-escape-άρει.
 *
 * Έτσι τα templates μένουν `{{x}}` — δεν χρειάζεται να γίνουν `{{{x}}}` και
 * πηγή τους παραμένει το άλλο project. Το SafeString είναι υπόσχεση ότι το
 * περιεχόμενο πέρασε από τον καθαριστή· δίνεται μόνο εδώ.
 */
export function richText(html: string): Handlebars.SafeString {
  return new Handlebars.SafeString(sanitizeInline(html));
}

/** Πολλές παράγραφοι → πίνακας, όπως τον περιμένει το `{{#each}}` του template. */
export function richParagraphs(blocks: string[]): Handlebars.SafeString[] {
  return blocks.map((b) => b.trim()).filter(Boolean).map(richText);
}
