import "server-only";
import { prisma } from "@/lib/prisma";
import { removeBackground } from "@/lib/media/claid";
import { uploadImage } from "@/lib/media/bunny";
import { generateCopy } from "@/lib/ai/deepseek";
import type { Locale } from "@/i18n/routing";

/**
 * Ένα προϊόν, έτοιμο να μπει σε κελί banner.
 *
 * ── Τι λύνει ───────────────────────────────────────────────────────────────
 *
 * Για να δείξει ένα κελί ένα προϊόν, ο συντάκτης έκανε έξι πράγματα: διάλεγε
 * «Προϊόν», έβρισκε το προϊόν, άνοιγε το φόντο, διάλεγε φωτογραφία από τη
 * συλλογή του, πατούσε αφαίρεση φόντου, και έγραφε κείμενο. Καθένα από αυτά
 * μπορεί να ξεχαστεί, και το αποτέλεσμα φαίνεται σωστό μέχρι να μη φαίνεται.
 *
 * Αυτή η συνάρτηση τα κάνει μία κίνηση. Ό,τι μπορεί να παραχθεί, παράγεται:
 * η διεύθυνση της σελίδας, η κύρια φωτογραφία, το κείμενο.
 *
 * ── Τι ΔΕΝ αποθηκεύεται ────────────────────────────────────────────────────
 *
 * Ο τίτλος, η μάρκα και η τιμή δεν γράφονται ως κείμενο· τα layers κρατούν
 * `{title}`, `{brand}`, `{price}` και ο resolver τα γεμίζει σε κάθε απόδοση.
 * Ένα banner με γραμμένη την τιμή μέσα του δείχνει την περσινή τιμή για όσο
 * ζει. Επιστρέφονται εδώ μόνο για την προεπισκόπηση του συντάκτη και για να
 * ξέρει η DeepSeek τι γράφει.
 *
 * ── Η διεύθυνση δεν πληκτρώνεται ποτέ ──────────────────────────────────────
 *
 * Ο resolver ήδη παράγει `/proion/{slug}` για κάθε δεσμευμένο κελί. Δεν
 * αντιγράφεται στο `href` του κελιού: μια γραμμένη διεύθυνση παγώνει, και ένα
 * προϊόν που αλλάζει slug αφήνει πίσω του banner που δείχνει σε 404.
 */

export type ProductFill = {
  slug: string;
  title: string;
  brand: string;
  price: string;
  /** Η σελίδα του προϊόντος — παραγόμενη, για επίδειξη στον συντάκτη. */
  href: string;
  /** Η φωτογραφία που θα μπει ως φόντο. Κομμένη, αν ζητήθηκε και πέτυχε. */
  image: string;
  /** Η αρχική, πριν την αφαίρεση φόντου — για να μπορεί να γυρίσει πίσω. */
  originalImage: string;
  /** Το κείμενο του κελιού: του καταλόγου, ή γραμμένο από την DeepSeek. */
  text: string;
  textSource: "catalogue" | "ai" | "none";
  /** Τι δεν πέτυχε, χωρίς να ματαιώσει τα υπόλοιπα. */
  notes: string[];
};

const money = (value: number, locale: Locale) =>
  new Intl.NumberFormat(locale === "el" ? "el-GR" : locale, {
    style: "currency",
    currency: "EUR",
  }).format(value);

export async function productFill(
  slug: string,
  locale: Locale,
  options: { cutout?: boolean; write?: boolean } = {},
): Promise<ProductFill | null> {
  const p = await prisma.product.findUnique({
    where: { slug },
    select: {
      slug: true,
      name: true,
      code: true,
      mtrmark: true,
      priceNet: true,
      vatRate: true,
      translations: {
        where: { locale },
        select: { name: true, shortDescription: true },
        take: 1,
      },
      images: {
        orderBy: [{ isFeature: "desc" }, { order: "asc" }],
        select: { url: true },
        take: 1,
      },
    },
  });
  if (!p) return null;

  const brandRow =
    p.mtrmark == null
      ? null
      : await prisma.brand.findFirst({
          where: { mtrmark: p.mtrmark },
          select: { nameEl: true, nameEn: true, nameIt: true },
        });
  const brand =
    (locale === "en" ? brandRow?.nameEn : locale === "it" ? brandRow?.nameIt : brandRow?.nameEl) ||
    brandRow?.nameEl ||
    "";

  const title = p.translations[0]?.name ?? p.name;
  const net = p.priceNet == null ? null : Number(p.priceNet);
  const price = net == null ? "" : money(net * (1 + Number(p.vatRate ?? 24) / 100), locale);
  const original = p.images[0]?.url ?? "";

  const notes: string[] = [];

  /*
   * Η αφαίρεση φόντου.
   *
   * Αποτυχία ΔΕΝ ματαιώνει το γέμισμα: μια φωτογραφία με φόντο είναι πολύ
   * καλύτερη από κανένα banner, και ο συντάκτης μπορεί να ξαναπατήσει το
   * κουμπί μόνος του. Το πρωτότυπο δεν πειράζεται ποτέ — το Claid γυρίζει νέο
   * αρχείο και ανεβαίνει δίπλα στο παλιό.
   */
  let image = original;
  if (options.cutout && original) {
    const cut = await removeBackground(original);
    if (!cut.ok) {
      notes.push(`Το φόντο δεν αφαιρέθηκε: ${cut.error}`);
    } else {
      try {
        const stored = await uploadImage(cut.buffer, {
          folder: "cutouts",
          name: `${p.code || p.slug}-cutout.png`,
        });
        image = stored.url;
      } catch (error) {
        notes.push(
          `Το φόντο αφαιρέθηκε αλλά το αρχείο δεν ανέβηκε: ${
            error instanceof Error ? error.message : "άγνωστο σφάλμα"
          }`,
        );
      }
    }
  }

  /*
   * Το κείμενο, μόνο αν χρειάζεται.
   *
   * Η σύντομη περιγραφή του καταλόγου προηγείται πάντα — είναι γραμμένη από
   * άνθρωπο και ελεγμένη. Η DeepSeek καλείται ΜΟΝΟ όταν δεν υπάρχει, γιατί το
   * να αντικατασταθεί υπάρχον κείμενο από παραγόμενο είναι υποβάθμιση που
   * κανείς δεν ζήτησε.
   */
  const catalogue = (p.translations[0]?.shortDescription ?? "").trim();
  let text = catalogue;
  let textSource: ProductFill["textSource"] = catalogue ? "catalogue" : "none";

  if (!catalogue && options.write) {
    try {
      const [written] = await generateCopy({
        field: "Μία πρόταση για banner προϊόντος",
        context: [title, brand && `Μάρκα: ${brand}`, p.code && `Κωδικός: ${p.code}`]
          .filter(Boolean)
          .join(" · "),
        maxChars: 90,
        locale,
        count: 1,
      });
      if (written?.trim()) {
        text = written.trim();
        textSource = "ai";
      } else {
        notes.push("Η DeepSeek δεν επέστρεψε κείμενο.");
      }
    } catch (error) {
      notes.push(
        `Η DeepSeek δεν απάντησε: ${error instanceof Error ? error.message : "άγνωστο σφάλμα"}`,
      );
    }
  }

  return {
    slug: p.slug,
    title,
    brand,
    price,
    href: `/proion/${p.slug}`,
    image,
    originalImage: original,
    text,
    textSource,
    notes,
  };
}
