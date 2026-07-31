import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import type { Locale } from "@/i18n/routing";
import { FREE_SHIPPING_THRESHOLD_NET } from "@/lib/cart/options";
import { COD_FEE_NET, ZONES } from "@/lib/shipping/acs-tariff";
import { DEFAULT_VAT_RATE, formatMoney } from "@/lib/format";
import { searchKey } from "@/lib/greek";
import type { FaqEntry, FaqSection } from "@/lib/faq/faq-types";

/**
 * The FAQ.
 *
 * Every number in an answer is INTERPOLATED from the constant the rest of the
 * site uses — the free-shipping threshold from `cart/options`, the COD fee and
 * the delivery windows from the ACS tariff engine, the catalogue size from the
 * database. A FAQ is the first thing to go stale in a shop, and it goes stale
 * silently: nobody re-reads it when the threshold moves from 150 to 200, and
 * then it is quietly lying to customers.
 *
 * Content is hardcoded here rather than in a model on purpose. There are
 * twenty-odd answers, they change a few times a year, and a `Faq` model with an
 * admin screen is Phase 3 work — this file is the seam it will replace.
 */

export const getFaq = cache(async (locale: Locale): Promise<FaqSection[]> => {
  const [products, inStock, brands] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: true, inStock: true } }),
    prisma.product.findMany({
      where: { isActive: true, mtrmark: { not: null } },
      distinct: ["mtrmark"],
      select: { mtrmark: true },
    }),
  ]);

  const n = (value: number) => value.toLocaleString("el-GR");
  const eta = (id: keyof typeof ZONES) => ZONES[id].etaDays;

  // Locale is threaded through for when the copy is translated; the answers
  // below are Greek only today, which is the site's default.
  void locale;

  const sections: Array<Omit<FaqSection, "entries"> & { entries: Array<Omit<FaqEntry, "key">> }> = [
    {
      id: "paraggelia",
      title: "Παραγγελία",
      entries: [
        {
          q: "Χρειάζεται λογαριασμός για να παραγγείλω;",
          a: `Όχι. Μπορείτε να ολοκληρώσετε την παραγγελία ως επισκέπτης — ζητάμε μόνο όσα χρειάζονται για να σας τη στείλουμε. Λογαριασμός χρειάζεται αν θέλετε ιστορικό παραγγελιών ή, για εταιρείες, τιμή συνεργάτη και πληρωμή επί πιστώσει.`,
        },
        {
          q: "Μπορώ να παραγγείλω με τηλέφωνο;",
          a: `Ναι, στο 210 411 1355, Δευτέρα έως Παρασκευή 08:00–16:30. Αν έχετε λίστα κωδικών, μπορείτε επίσης να τους επικολλήσετε μαζικά στο καλάθι.`,
        },
        {
          q: "Πώς ξέρω ότι υπάρχει πραγματικά απόθεμα;",
          a: `Η διαθεσιμότητα στο site είναι το ERP μας, όχι εκτίμηση. Αυτή τη στιγμή ${n(inStock)} από τους ${n(products)} κωδικούς είναι άμεσα διαθέσιμοι. Αν λέει «3 τεμ.», υπάρχουν 3.`,
        },
        {
          q: "Δεν βρίσκω τον κωδικό που ψάχνω.",
          a: `Η αναζήτηση δέχεται κωδικό Kolleris, κωδικό κατασκευαστή και EAN. Αν δεν τον βρίσκετε, μάλλον τον προμηθευόμαστε κατά παραγγελία — καλέστε μας. Ο online κατάλογος είναι ${n(products)} κωδικοί από ${brands.length} brands, αλλά αντιπροσωπεύουμε περισσότερα.`,
        },
      ],
    },
    {
      id: "apostoli",
      title: "Αποστολή",
      entries: [
        {
          q: "Πόσο κοστίζει η αποστολή;",
          a: `Υπολογίζεται από το χρεώσιμο βάρος και τη ζώνη του Τ.Κ. σας, όχι με σταθερή χρέωση. Το ακριβές ποσό φαίνεται στο καλάθι πριν πληρώσετε. Άνω των ${formatMoney(FREE_SHIPPING_THRESHOLD_NET)} καθαρής αξίας τα μεταφορικά είναι δωρεάν.`,
        },
        {
          q: "Πότε θα φτάσει;",
          a: `Παραγγελία πριν τις 15:00 εργάσιμη φεύγει αυθημερόν. Αττική ${eta("attica")} εργάσιμη, ηπειρωτική Ελλάδα ${eta("mainland")}, νησιά ${eta("island")}, δυσπρόσιτες περιοχές ${eta("remote")} εργάσιμες.`,
        },
        {
          q: "Πόσο χρεώνεται η αντικαταβολή;",
          a: `${formatMoney(COD_FEE_NET * (1 + DEFAULT_VAT_RATE / 100))} με ΦΠΑ. Είναι η χρέωση της ACS και προστίθεται στα μεταφορικά — δεν την κρατάμε εμείς.`,
        },
        {
          q: "Μπορώ να παραλάβω από το κατάστημα;",
          a: `Ναι, από τον Πειραιά (Κ. Μαυρομιχάλη 4). Επιλέξτε «Παραλαβή από Πειραιά» στο ταμείο — η παραγγελία είναι έτοιμη σε 2 ώρες μέσα στο ωράριο.`,
        },
        {
          q: "Πώς παρακολουθώ την παραγγελία μου;",
          a: `Με τον αριθμό παραγγελίας και το email σας, στη σελίδα εντοπισμού — δεν χρειάζεται λογαριασμός. Μόλις φύγει το δέμα, εμφανίζεται και ο αριθμός αποστολής της ACS.`,
        },
      ],
    },
    {
      id: "times",
      title: "Τιμές και πληρωμή",
      entries: [
        {
          q: "Οι τιμές είναι με ΦΠΑ;",
          a: `Ναι, όλες. Κάθε τιμή στο site είναι τελική, με ΦΠΑ ${DEFAULT_VAT_RATE}% (ή τον συντελεστή που ισχύει για το είδος). Η καθαρή αξία φαίνεται από κάτω, για όσους τιμολογούν.`,
        },
        {
          q: "Πώς μπορώ να πληρώσω;",
          a: `Κάρτα και IRIS μέσω Viva Wallet, τραπεζική κατάθεση, ή αντικαταβολή. Τα στοιχεία της κάρτας σας δεν περνούν ποτέ από το κατάστημά μας. Οι εγκεκριμένοι εταιρικοί λογαριασμοί πληρώνουν και επί πιστώσει.`,
        },
        {
          q: "Έχετε τιμή για επαγγελματίες;",
          a: `Ναι. Ο εταιρικός λογαριασμός δίνει μόνιμη έκπτωση σε όλο τον κατάλογο — όχι εποχιακή προσφορά — μαζί με τιμολόγιο και πληρωμή επί πιστώσει. Η αίτηση ελέγχεται και ενεργοποιείται συνήθως σε 2 εργάσιμες.`,
        },
        {
          q: "Γιατί δεν βλέπω εκπτώσεις;",
          a: `Γιατί δεν τρέχει προσφορά. Θα μπορούσαμε να δείχνουμε διαγραμμένη τιμή στα δύο τρίτα του καταλόγου — η διαφορά λιανικής και τιμής eshop υπάρχει — αλλά μια «έκπτωση» που ισχύει πάντα δεν είναι έκπτωση. Όταν κάνουμε πραγματική προσφορά, θα τη δείτε με την προηγούμενη τιμή δίπλα.`,
        },
        {
          q: "Εκδίδετε τιμολόγιο;",
          a: `Ναι. Στο ταμείο επιλέξτε «Θέλω τιμολόγιο» και δώστε το ΑΦΜ — τα υπόλοιπα στοιχεία τα φέρνουμε αυτόματα από το μητρώο της ΑΑΔΕ.`,
        },
      ],
    },
    {
      id: "eggyisi",
      title: "Εγγύηση και επιστροφές",
      entries: [
        {
          q: "Τι εγγύηση έχουν τα εργαλεία;",
          a: `Επίσημη εγγύηση κατασκευαστή. Η διάρκεια διαφέρει ανά προϊόν και αναγράφεται στη σελίδα του. Επειδή είμαστε επίσημη αντιπροσωπεία, το σέρβις και τα ανταλλακτικά περνούν από εμάς — όχι από παράλληλη εισαγωγή.`,
        },
        {
          q: "Μπορώ να επιστρέψω κάτι;",
          a: `Εντός 14 ημερών, αμεταχείριστο, στη συσκευασία του και με το παραστατικό αγοράς. Καλέστε μας πρώτα για να σας δώσουμε οδηγίες — γλιτώνετε μεταφορικά και χρόνο.`,
        },
        {
          q: "Ήρθε λάθος ή ελαττωματικό. Τι κάνω;",
          a: `Τηλεφωνήστε την ίδια μέρα στο 210 411 1355. Τα μεταφορικά της αντικατάστασης τα αναλαμβάνουμε εμείς.`,
        },
      ],
    },
    {
      id: "logariasmos",
      title: "Λογαριασμός",
      entries: [
        {
          q: "Ποια η διαφορά ιδιώτη και εταιρικού λογαριασμού;",
          a: `Ο ιδιώτης έχει παραγγελίες, διευθύνσεις, εγγυήσεις και επιστροφές. Ο εταιρικός προσθέτει τιμή συνεργάτη, τιμολόγιο, πληρωμή επί πιστώσει, και πολλούς χρήστες με ρόλους και όρια δαπάνης.`,
        },
        {
          q: "Πόσο κάνει να εγκριθεί ο εταιρικός λογαριασμός;",
          a: `Συνήθως 2 εργάσιμες. Ελέγχουμε ΑΦΜ, δραστηριότητα και τυχόν υπάρχουσα συνεργασία. Μέχρι τότε μπορείτε να παραγγέλνετε κανονικά με λιανικές τιμές.`,
        },
        {
          q: "Μπορούν πολλοί υπάλληλοι να παραγγέλνουν;",
          a: `Ναι. Ο διαχειριστής της εταιρείας προσκαλεί χρήστες και ορίζει σε καθέναν ρόλο και όριο ανά παραγγελία.`,
        },
      ],
    },
  ];

  return sections.map((section) => ({
    ...section,
    entries: section.entries.map((entry) => ({
      ...entry,
      // Normalised once here so the client filter is a plain `includes`.
      key: searchKey(`${entry.q} ${entry.a}`),
    })),
  }));
});
