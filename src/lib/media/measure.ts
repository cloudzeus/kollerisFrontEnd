/**
 * Η φυσική αναλογία ενός αρχείου, μετρημένη στον περιηγητή.
 *
 * Ο διακομιστής δεν μπορεί να την ξέρει: η βιβλιοθήκη δεν κρατά διαστάσεις για
 * τα βίντεο, και το να τις διαβάσει θα σήμαινε κατέβασμα metadata σε κάθε
 * απόδοση σελίδας. Ο περιηγητής του συντάκτη έχει ήδη το αρχείο μπροστά του.
 *
 * Για το βίντεο φορτώνονται ΜΟΝΟ τα metadata — μερικά kilobyte, όχι το αρχείο.
 * Χρονόμετρο υπάρχει επειδή ένα αρχείο που δεν απαντά δεν πρέπει να κρεμάσει
 * μια μαζική μέτρηση· η άγνωστη αναλογία είναι απλώς `null` και η παλιά
 * συμπεριφορά μένει.
 */
export function measureMedia(
  kind: "image" | "video",
  url: string,
  { timeoutMs = 8000 }: { timeoutMs?: number } = {},
): Promise<number | null> {
  if (!url) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);

    if (kind === "video") {
      const el = document.createElement("video");
      el.preload = "metadata";
      el.muted = true;
      el.onloadedmetadata = () =>
        done(el.videoHeight ? el.videoWidth / el.videoHeight : null);
      el.onerror = () => done(null);
      el.src = url;
      return;
    }

    const img = new window.Image();
    img.onload = () => done(img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
    img.onerror = () => done(null);
    img.src = url;
  });
}

/** Στρογγυλεμένη στο χιλιοστό — τρία δεκαδικά είναι κάτω από το εικονοστοιχείο. */
export const roundAspect = (ratio: number) => Math.round(ratio * 1000) / 1000;
