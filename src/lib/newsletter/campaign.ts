import "server-only";
import { prisma } from "@/lib/prisma";
import { renderTemplate } from "@/lib/mail/templates";
import { grossAmount, formatMoney } from "@/lib/format";
import { siteOrigin } from "@/lib/seo/urls";
import manifest from "@/emails/manifest.json";

/**
 * Ό,τι χρειάζεται ο wizard από τον server: ποια πρότυπα υπάρχουν, ποια προϊόντα
 * μπορούν να μπουν σε καμπάνια, και πώς γίνεται όλο αυτό HTML.
 */

export type TemplateMeta = {
  id: string;
  name: string;
  category: string;
  categoryTitle: string;
  subject: string;
  preheader: string;
  /** Αν δέχεται προϊόντα. Καθορίζει αν εμφανίζεται το βήμα επιλογής. */
  takesProducts: boolean;
  /** Αν δέχεται ελεύθερο κείμενο (WYSIWYG). */
  takesRichText: boolean;
};

type ManifestShape = {
  categories: Record<string, { title: string }>;
  templates: Record<
    string,
    { category: string; name: string; subject: string; preheader: string; footer: string }
  >;
};

/**
 * Ποια πρότυπα μπορεί να στείλει το marketing.
 *
 * ΜΟΝΟ η οικογένεια «newsletter». Τα υπόλοιπα 21 είναι transactional — τα
 * ενεργοποιεί μια παραγγελία, μια πληρωμή, μια εγγραφή — και δεν έχουν νόημα ως
 * μαζική αποστολή. Ένα «Η παραγγελία σας στάλθηκε» σε 4.000 παραλήπτες που δεν
 * παρήγγειλαν τίποτα δεν είναι λάθος επιλογή· είναι λάθος που η επιλογή
 * υπήρχε.
 */
const CAMPAIGN_CATEGORIES = new Set(["newsletter"]);

/** Ποια πρότυπα δέχονται τι. Από τη δομή τους, όχι από εικασία. */
const CAPABILITIES: Record<string, { products: boolean; richText: boolean }> = {
  "nl-offers": { products: true, richText: true },
  "nl-news": { products: false, richText: true },
  "nl-announcement": { products: false, richText: true },
};

export function campaignTemplates(): TemplateMeta[] {
  const m = manifest as ManifestShape;
  return Object.entries(m.templates)
    .filter(([, t]) => CAMPAIGN_CATEGORIES.has(t.category))
    .map(([id, t]) => ({
      id,
      name: t.name,
      category: t.category,
      categoryTitle: m.categories[t.category]?.title ?? t.category,
      subject: t.subject,
      preheader: t.preheader,
      takesProducts: CAPABILITIES[id]?.products ?? false,
      takesRichText: CAPABILITIES[id]?.richText ?? true,
    }));
}

export type PickedProduct = {
  id: string;
  slug: string;
  name: string;
  code: string;
  brand: string;
  image: string;
  price: string;
  priceOld: string;
  discount: string;
  stockLabel: string;
  url: string;
};

/**
 * Αναζήτηση προϊόντων για τον επιλογέα.
 *
 * Μόνο ενεργά και ΜΟΝΟ με εικόνα: μια κάρτα προϊόντος χωρίς φωτογραφία σε
 * newsletter είναι κενό γκρι κουτί, και δεν υπάρχει τρόπος να σωθεί από το
 * layout. Καλύτερα να μη μπορεί να επιλεγεί παρά να φύγει έτσι.
 */
export type ProductFilters = {
  query?: string;
  /** `mtrmark` της μάρκας. Το ίδιο κλειδί που κρατά το προϊόν. */
  mtrmark?: number | null;
  /** Μόνο όσα έχουν διαγραμμένη τιμή — δηλαδή είναι όντως σε προσφορά. */
  onSaleOnly?: boolean;
  /** Μόνο όσα μπορούν να σταλούν σήμερα. */
  inStockOnly?: boolean;
};

export async function searchCampaignProducts(
  filters: ProductFilters = {},
  limit = 24,
): Promise<PickedProduct[]> {
  const q = (filters.query ?? "").trim();
  const rows = await prisma.product.findMany({
    where: {
      isActive: true,
      images: { some: {} },
      ...(filters.mtrmark != null ? { mtrmark: filters.mtrmark } : {}),
      /*
       * «Σε προσφορά» = υπάρχει `priceList` μεγαλύτερη της τιμής. ΟΧΙ το
       * `onSale` flag: εκείνο έχει σβήσει σκόπιμα από την προηγούμενη δουλειά
       * στις τιμές, όπου 68% του καταλόγου φαινόταν μόνιμα «σε προσφορά»
       * επειδή συγκρίναμε δύο τιμοκαταλόγους. Η διαγραμμένη τιμή είναι το μόνο
       * σημάδι που σημαίνει πραγματική έκπτωση.
       */
      ...(filters.onSaleOnly ? { priceList: { not: null } } : {}),
      ...(filters.inStockOnly ? { inStock: true } : {}),
      ...(q.length >= 2
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
              { code2: { contains: q, mode: "insensitive" } },
              { searchKey: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      slug: true,
      name: true,
      code: true,
      priceNet: true,
      priceList: true,
      qty: true,
      mtrmark: true,
      images: { orderBy: [{ isFeature: "desc" }, { order: "asc" }], take: 1, select: { url: true } },
    },
    orderBy: q.length >= 2 ? { name: "asc" } : { firstListedAt: "desc" },
    take: limit,
  });

  /*
   * Η μάρκα δεν είναι σχέση πάνω στο Product — μόνο το `mtrmark` του ERP. Ένα
   * ερώτημα για όλες τις μάρκες της σελίδας, όχι ένα ανά προϊόν.
   */
  const marks = [...new Set(rows.map((r) => r.mtrmark).filter((m): m is number => m != null))];
  const brands = marks.length
    ? await prisma.brand.findMany({ where: { mtrmark: { in: marks } }, select: { mtrmark: true, nameEl: true } })
    : [];
  const brandByMark = new Map(brands.map((b) => [b.mtrmark, b.nameEl]));

  return rows.map((p) => {
    const net = p.priceNet ? Number(p.priceNet) : 0;
    const list = p.priceList ? Number(p.priceList) : 0;
    const gross = grossAmount(net);
    const grossOld = list > net ? grossAmount(list) : 0;
    const qty = p.qty ? Number(p.qty) : 0;
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      code: p.code,
      brand: (p.mtrmark != null ? brandByMark.get(p.mtrmark) : "") ?? "",
      image: p.images[0]?.url ?? "",
      price: formatMoney(gross, "el"),
      priceOld: grossOld > 0 ? formatMoney(grossOld, "el") : "",
      discount: grossOld > 0 ? String(Math.round((1 - gross / grossOld) * 100)) : "",
      /*
       * Η ετικέτα λέει την αλήθεια τη στιγμή της ΑΠΟΣΤΟΛΗΣ και παγώνει εκεί.
       * Ένα email είναι στιγμιότυπο· δεν ενημερώνεται όταν το απόθεμα αλλάξει,
       * και το «Άμεσα διαθέσιμο» σε κάτι που εξαντλήθηκε είναι η πιο συχνή
       * αιτία παραπόνου μετά από newsletter προσφορών.
       */
      stockLabel: qty > 5 ? "Άμεσα διαθέσιμο" : qty > 0 ? `Τελευταία ${qty} τεμ.` : "Κατόπιν παραγγελίας",
      url: `${siteOrigin()}/proion/${p.slug}`,
    };
  });
}

/** Τα επιλεγμένα προϊόντα σε ζευγάρια — το layout του template είναι 2-up. */
export function toProductRows(products: PickedProduct[]) {
  const rows: Array<Array<Record<string, string>>> = [];
  for (let i = 0; i < products.length; i += 2) {
    rows.push(
      products.slice(i, i + 2).map((p) => ({
        brand: p.brand,
        sku: p.code,
        name: p.name,
        price: p.price,
        price_old: p.priceOld,
        discount: p.discount,
        stock_label: p.stockLabel,
        image: p.image,
        url: p.url,
      })),
    );
  }
  return rows;
}

export type CampaignPayload = {
  campaign: {
    eyebrow: string;
    discount: string;
    title: string;
    text: string;
    url: string;
    valid_until: string;
  };
  products: PickedProduct[];
  /** Ελεύθερο κείμενο από τον editor, ήδη ως HTML. */
  bodyHtml?: string;
};

/**
 * Το HTML της καμπάνιας, για προεπισκόπηση ή για αποστολή.
 *
 * Ο ίδιος δρόμος και για τα δύο — αλλιώς η προεπισκόπηση δείχνει κάτι που δεν
 * είναι αυτό που φεύγει, που είναι χειρότερο από καθόλου προεπισκόπηση.
 */
export async function renderCampaign(
  templateId: string,
  payload: CampaignPayload,
  recipient: { first_name?: string; last_name?: string; email?: string } = {},
): Promise<string> {
  return renderTemplate(templateId, {
    campaign: payload.campaign,
    product_rows: toProductRows(payload.products ?? []),
    body_html: payload.bodyHtml ?? "",
    preheader: payload.campaign.text,
    recipient: {
      first_name: recipient.first_name ?? "",
      last_name: recipient.last_name ?? "",
      email: recipient.email ?? "",
    },
  });
}
