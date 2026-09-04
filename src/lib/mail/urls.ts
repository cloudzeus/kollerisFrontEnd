import { siteOrigin } from "@/lib/seo/urls";

/**
 * Οι διευθύνσεις που βάζουν τα email templates στα κουμπιά τους.
 *
 * ── Γιατί υπάρχει αυτό το αρχείο ───────────────────────────────────────────
 *
 * Τα templates γράφτηκαν πριν κλειδώσουν τα routes του καταστήματος και
 * χρησιμοποιούν αγγλικά μονοπάτια: `/account`, `/orders`, `/offers`, `/new`,
 * `/contact`, `/terms`, `/privacy`, `/p/{sku}`. ΚΑΝΕΝΑ από αυτά δεν υπάρχει.
 * Τα πραγματικά είναι ελληνικά — `/logariasmos`, `/prosfores`, `/nees-afixeis`
 * — και ένα κουμπί «Δείτε τις προσφορές» που βγάζει σε 404 είναι χειρότερο από
 * απεσταλμένο email που δεν στάλθηκε ποτέ: ο παραλήπτης έκανε ό,τι του ζητήσαμε.
 *
 * Όλα τα templates διαβάζουν από ΕΝΑ αντικείμενο `urls`, οπότε η προσαρμογή
 * είναι αυτός ο πίνακας και τίποτε άλλο.
 */
export type MailUrls = ReturnType<typeof mailUrls>;

export function mailUrls(overrides: { viewOnline?: string; preferences?: string } = {}) {
  const o = siteOrigin();
  return {
    home: o,
    shop: o,
    /** Το προφίλ. Στο κατάστημα λέγεται «λογαριασμός», όχι «account». */
    account: `${o}/logariasmos`,
    orders: `${o}/logariasmos/paraggelies`,
    b2b: `${o}/b2b`,
    contact: `${o}/epikoinonia`,
    terms: `${o}/oroi-chrisis`,
    privacy: `${o}/aporrito`,
    offers: `${o}/prosfores`,
    new: `${o}/nees-afixeis`,
    brands: `${o}/brands`,
    /** Οι συχνές ερωτήσεις είναι η σελίδα υποστήριξης που όντως υπάρχει. */
    support: `${o}/syxnes-erotiseis`,
    /**
     * Η γρήγορη παραγγελία με κωδικό ζει στην αρχική, όχι σε δική της σελίδα.
     * Το άγκιστρο πάει τον επισκέπτη στο πεδίο αντί να τον αφήσει στην κορυφή.
     */
    quick_order: `${o}/#grigori-paraggelia`,
    /**
     * Ανά καμπάνια, όχι σταθερό: το «δείτε το online» δείχνει ΑΥΤΗ την αποστολή.
     * Χωρίς καμπάνια δεν υπάρχει σελίδα, οπότε πέφτει στις προσφορές αντί για
     * κενό href — ένα `href=""` ξαναφορτώνει τη σελίδα και μοιάζει με σπασμένο.
     */
    view_online: overrides.viewOnline ?? `${o}/prosfores`,
    /**
     * Οι «προτιμήσεις» δεν έχουν ακόμη δική τους σελίδα. Μέχρι να αποκτήσουν,
     * δείχνουν στον σύνδεσμο διαγραφής της Mailgun — που είναι η μία προτίμηση
     * που πρέπει πάντα να λειτουργεί, και είναι και νομική υποχρέωση.
     */
    preferences: overrides.preferences ?? "%unsubscribe_url%",
  };
}
