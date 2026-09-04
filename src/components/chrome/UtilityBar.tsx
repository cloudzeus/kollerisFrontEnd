import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import { upGreek } from "@/lib/greek";

/*
 * `prefetch={false}` σε κάθε σύνδεσμο αυτού του αρχείου.
 * ─────────────────────────────────────────────────────────────────────────────
 * Μετρημένο στην παραγωγή: μία επίσκεψη στο `/katalogos` έβγαζε **34** αιτήματα
 * RSC — 18 για κατηγορίες, 14 για την πλοήγηση και το υποσέλιδο, καθένα 450-780ms.
 * Κάθε ένα από αυτά είναι ΠΛΗΡΗΣ απόδοση στον διακομιστή, γιατί οι σελίδες
 * απαντούν `cache-control: no-store` (διαβάζουν καλάθι και γλώσσα από cookies).
 *
 * Δηλαδή ένας επισκέπτης παρήγαγε 34 renders, και με μερικούς ταυτόχρονους ο
 * διακομιστής κορεννύεται — γι' αυτό «αργεί σε ΟΛΕΣ τις σελίδες» και όχι σε μία.
 *
 * Η πλοήγηση και το υποσέλιδο είναι σε κάθε σελίδα και δείχνουν παντού· κανείς
 * δεν πρόκειται να πατήσει και τα δεκατέσσερα. Το prefetch έχει νόημα για τον
 * έναν σύνδεσμο που ΘΑ πατηθεί, όχι για τον κατάλογο των πάντων.
 */

/**
 * Η μαύρη λωρίδα πάνω από τα πάντα.
 *
 * Redesign Αυγούστου 2026. Άλλαξε από «τρεις υποσχέσεις παράδοσης» σε
 * «πού είμαστε και πώς μας βρίσκεις»: τηλέφωνο και διεύθυνση αριστερά, B2B και
 * σύνδεση δεξιά.
 *
 * Ο λόγος είναι ότι οι υποσχέσεις μετακόμισαν. Η παράδοση 24–48 ωρών και το
 * δωρεάν όριο λέγονται πια στο hero και στη λωρίδα στατιστικών, με μεγαλύτερα
 * γράμματα και μέσα στο πλαίσιο που τους δίνει νόημα. Επαναλαμβανόμενες σε
 * 11px γκρι στην κορυφή, δεν τις διάβαζε κανείς.
 *
 * Το τηλέφωνο στην κορυφή δεν είναι διακόσμηση: το μισό B2B κοινό αυτού του
 * καταστήματος παραγγέλνει τηλεφωνικά, και μέχρι τώρα ο αριθμός ήταν κρυμμένος
 * δεξιά, μετά τον επιλογέα γλώσσας.
 */
export function UtilityBar({ locale }: { locale: Locale }) {
  const t = useTranslations("chrome.UtilityBar");

  return (
    <>
      {/*
        Mobile — μόνο το τηλέφωνο, ως σύνδεσμος κλήσης.
        ────────────────────────────────────────────────────────────────────
        Η διεύθυνση και το B2B κόβονται· σε 390px η γραμμή θα τύλιγε σε τρεις
        σειρές και θα έσπρωχνε το λογότυπο κάτω από το fold. Ό,τι μένει είναι
        αυτό που κάνει κάποιος από κινητό: πατά και τηλεφωνεί.
      */}
      <div className="header-utility t-util flex h-8 items-center justify-center gap-3 bg-k-black text-k-on-dark-3 lg:hidden">
        <a href="tel:+302104111355" className="text-k-on-dark">
          {t("t_30_210_411_1355")}
        </a>
        <span className="text-white/20">·</span>
        <Link href="/eisodos" className="text-k-gold" prefetch={false}>
          {upGreek(t("b2b"))}
        </Link>
      </div>

      <div className="header-utility t-util shell-x hidden h-9 items-center justify-between gap-6 overflow-hidden bg-k-black text-k-on-dark-3 lg:flex">
        <div className="flex items-center gap-6 whitespace-nowrap">
          <a
            href="tel:+302104111355"
            className="transition-colors hover:text-k-on-dark"
          >
            {t("t_30_210_411_1355")}
          </a>
          <span className="hidden xl:inline">
            {t("k_mavromichali_4_peiraias")}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-5 whitespace-nowrap">
          {/*
            Ο χρυσός σύνδεσμος B2B είναι ο μοναδικός έγχρωμος στη μαύρη λωρίδα.
            Είναι σκόπιμο: είναι η μία ενέργεια εδώ που αξίζει περισσότερα από
            μια επίσκεψη — ένας λογαριασμός συνεργάτη αγοράζει για χρόνια.
          */}
          <Link
            href="/eisodos"
            className="text-k-gold transition-colors hover:text-white"
            prefetch={false}
          >
            {upGreek(t("times_synergati_b2b_aitisi_logariasmoy"))}
          </Link>

          <div className="flex border border-white/18">
            {routing.locales.map((code) => (
              <Link
                key={code}
                href="/"
                locale={code}
                aria-current={code === locale ? "true" : undefined}
                className={`t-lang px-2.5 py-[5px] transition-colors ${
                  code === locale
                    ? "bg-k-red text-white"
                    : "text-white/60 hover:text-white"
                }`}
                prefetch={false}
              >
                {LOCALE_LABELS[code]}
              </Link>
            ))}
          </div>

          <Link
            href="/eisodos"
            className="transition-colors hover:text-k-on-dark"
            prefetch={false}
          >
            {upGreek(t("syndesi"))}
          </Link>
        </div>
      </div>
    </>
  );
}
