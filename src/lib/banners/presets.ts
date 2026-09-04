import {
  DEFAULT_BACKGROUND,
  DEFAULT_TEXT_STYLE,
  applyAnimRecipe,
  newLayer,
  type BadgeLayer,
  type Background,
  type ButtonLayer,
  type CellComposition,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
  type TickerLayer,
} from "@/lib/banners/contract";

/**
 * The variation library.
 *
 * ── Ρόλοι, όχι νούμερα ─────────────────────────────────────────────────────
 *
 * Κάθε κείμενο εδώ δηλώνει ΡΟΛΟ — eyebrow, τίτλος, κείμενο, τιμή, παλιά τιμή —
 * και το μέγεθος, το βάρος και το tracking τα δίνει το design system. Πριν,
 * κάθε παραλλαγή έγραφε δικά της νούμερα: «size 42» εδώ, «size 38» δίπλα,
 * «size 46» παρακάτω. Τρία διαφορετικά μεγέθη για το ίδιο πράγμα, κανένα
 * συνδεδεμένο με τις επικεφαλίδες της σελίδας — και το «size» σημαίνει pixel
 * σε κελί πλάτους 1000px, οπότε μια σύνθεση σε στενή στήλη έβγαζε τίτλο 11px.
 *
 * One widget with twenty switches asks an operator to design from nothing every
 * time; a shelf of finished looks asks them to choose, then adjust. Each preset
 * is an ordinary composition — background plus layers — so the moment it lands
 * on the canvas it is fully editable and nothing about it is special.
 *
 * Presets are deliberately opinionated about type, spacing and contrast, since
 * that is the part a marketing team should not have to re-derive per banner.
 * What they leave open is content and position.
 *
 * `{token}`s inside the text mean the preset works for a bound cell without
 * being written twice: `{title}` is the product's name in a product cell and
 * the campaign's title in an offer cell.
 */

export type PresetCategory = "photo" | "split" | "text" | "offer";

export type Preset = {
  id: string;
  label: string;
  hint: string;
  category: PresetCategory;
  /** Bindings this look is meant for. Shown first for a matching cell. */
  suits: Array<"none" | "product" | "offer" | "products">;
  build: () => { background: Background; layers: Layer[] };
};

/* ── helpers ── */

const text = (
  name: string,
  value: string,
  frame: TextLayer["frame"],
  style: Partial<TextLayer["style"]> = {},
): TextLayer => {
  const layer = newLayer("text") as TextLayer;
  layer.name = name;
  layer.text = { el: value };
  layer.frame = frame;
  layer.style = { ...DEFAULT_TEXT_STYLE, ...style };
  return layer;
};

const badge = (
  value: string,
  frame: BadgeLayer["frame"],
  tone: BadgeLayer["tone"] = "red",
): BadgeLayer => {
  const layer = newLayer("badge") as BadgeLayer;
  layer.text = { el: value };
  layer.frame = frame;
  layer.tone = tone;
  /* Το badge είναι eyebrow με φόντο: ίδιο mono, ίδιο tracking, ίδιο βάρος. */
  layer.style = { ...layer.style, role: "eyebrow" };
  return layer;
};

const button = (
  value: string,
  frame: ButtonLayer["frame"],
  variant: ButtonLayer["variant"] = "underline",
  color: ButtonLayer["style"]["color"] = "ink",
): ButtonLayer => {
  // No href: a preset's button follows the cell, which is what makes the same
  // look reusable across cells pointing at different places.
  const layer = newLayer("button") as ButtonLayer;
  layer.text = { el: value };
  layer.frame = frame;
  layer.variant = variant;
  layer.style = { ...layer.style, color };
  return layer;
};

const shape = (
  frame: ShapeLayer["frame"],
  color: ShapeLayer["color"],
  opacity: number,
): ShapeLayer => {
  const layer = newLayer("shape") as ShapeLayer;
  layer.frame = frame;
  layer.color = color;
  layer.opacity = opacity;
  return layer;
};

const ticker = (frame: TickerLayer["frame"]): TickerLayer => {
  const layer = newLayer("ticker") as TickerLayer;
  layer.frame = frame;
  return layer;
};

const picture = (
  frame: ImageLayer["frame"],
  fit: ImageLayer["fit"] = "contain",
): ImageLayer => {
  const layer = newLayer("image") as ImageLayer;
  // The bound entity's own photograph. A literal URL can be picked instead.
  layer.src = "{image}";
  layer.frame = frame;
  layer.fit = fit;
  return layer;
};

/**
 * Το σήμα του καταστήματος ως στρώση.
 *
 * Σταθερή διεύθυνση CDN και όχι `{image}`: αυτό ΔΕΝ είναι η φωτογραφία του
 * προϊόντος, είναι η υπογραφή πάνω της. Η λευκή εκδοχή γιατί μπαίνει πάντα σε
 * σκούρο — πάνω σε φωτογραφία με scrim ή σε κόκκινο πλακίδιο.
 */
const mark = (
  frame: ImageLayer["frame"],
  variant: "white" | "red" | "on-red" | "on-ink" = "white",
): ImageLayer => {
  const layer = newLayer("image") as ImageLayer;
  layer.name = "Σήμα Κολλέρη";
  layer.src = `https://kolleris.b-cdn.net/eshop/brand/kolleris-lockup-${variant}.svg`;
  layer.frame = frame;
  layer.fit = "contain";
  return layer;
};

/**
 * Το σήμα του ΚΑΤΑΣΚΕΥΑΣΤΗ.
 *
 * Στα επαγγελματικά εργαλεία η μάρκα είναι το επιχείρημα: κανείς δεν αγοράζει
 * «γωνιακό τροχό», αγοράζει Milwaukee. Το `{brand}` έδινε μόνο το όνομα σε
 * mono — σωστό, και εντελώς άλλο πράγμα από το σήμα που αναγνωρίζει ο πελάτης
 * από δέκα μέτρα.
 *
 * Πάνω δεξιά, μακριά από το σήμα του καταστήματος: δύο λογότυπα στην ίδια
 * γωνία διαβάζονται ως ένα ανακατεμένο. Λύνει σε κενό όταν η μάρκα δεν έχει
 * αρχείο, και στρώση χωρίς πηγή δεν αποδίδεται.
 */
const brandMark = (frame: ImageLayer["frame"]): ImageLayer => {
  const layer = newLayer("image") as ImageLayer;
  layer.name = "Σήμα μάρκας";
  layer.src = "{brandLogo}";
  layer.frame = frame;
  layer.fit = "contain";
  return layer;
};

const photoBg = (overlay: Background["overlay"]): Background => ({
  ...DEFAULT_BACKGROUND,
  kind: "image",
  image: "{image}",
  overlay,
});

const flatBg = (color: Background["color"]): Background => ({
  ...DEFAULT_BACKGROUND,
  kind: "color",
  color,
  overlay: "none",
});

/* ── the library ── */

export const PRESETS: Preset[] = [
  {
    id: "photo-bottom",
    label: "Φωτογραφία, κείμενο κάτω",
    hint: "Η εικόνα γεμίζει το κελί, το κείμενο κάθεται κάτω αριστερά.",
    category: "photo",
    suits: ["product", "offer", "none"],
    build: () => ({
      background: photoBg("medium"),
      layers: [
        brandMark({ x: 74, y: 6, w: 20, h: 10 }),
        text(
          "Υπέρτιτλος",
          "{brand}",
          { x: 6, y: 55, w: 50, h: 7 },
          { role: "eyebrow", color: "red" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 63, w: 62, h: 19 },
          { role: "title", color: "white", valign: "end" },
        ),
        text(
          "Τιμή",
          "{price}",
          { x: 6, y: 84, w: 40, h: 10 },
          { role: "price", color: "white" },
        ),
      ],
    }),
  },
  {
    id: "photo-centre",
    label: "Φωτογραφία, κείμενο στο κέντρο",
    hint: "Κεντραρισμένος τίτλος και κουμπί πάνω στην εικόνα.",
    category: "photo",
    suits: ["offer", "none", "product"],
    build: () => ({
      background: photoBg("strong"),
      layers: [
        text(
          "Τίτλος",
          "{title}",
          { x: 12, y: 34, w: 76, h: 24 },
          { role: "title", color: "white", align: "center" },
        ),
        button(
          "Δείτε περισσότερα",
          { x: 33, y: 64, w: 34, h: 9 },
          "underline",
          "white",
        ),
      ],
    }),
  },
  {
    id: "photo-scrim",
    label: "Φωτογραφία με σκούρο πλαίσιο",
    hint: "Μαύρη ζώνη κάτω, ώστε το κείμενο να διαβάζεται πάνω σε κάθε φωτογραφία.",
    category: "photo",
    suits: ["product", "offer", "none"],
    build: () => ({
      background: photoBg("none"),
      layers: [
        brandMark({ x: 74, y: 6, w: 20, h: 10 }),
        /* Ψηλότερα από τον τίτλο: με `valign: "end"` ο τίτλος μεγαλώνει προς τα
           πάνω, και μια ζώνη που ξεκινά στο 58 τον άφηνε να βγει από πάνω της. */
        shape({ x: 0, y: 48, w: 100, h: 52 }, "ink", 82),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 63, w: 66, h: 20 },
          { role: "title", color: "white", valign: "end" },
        ),
        text(
          "Τιμή",
          "{price}",
          { x: 6, y: 85, w: 40, h: 9 },
          { role: "price", color: "white" },
        ),
      ],
    }),
  },
  {
    id: "split-right",
    label: "Εικόνα δεξιά",
    hint: "Το προϊόν κομμένο δεξιά, το κείμενο αριστερά σε καθαρό φόντο.",
    category: "split",
    suits: ["product", "none"],
    build: () => ({
      background: flatBg("white"),
      layers: [
        picture({ x: 52, y: 8, w: 44, h: 84 }),
        brandMark({ x: 6, y: 8, w: 22, h: 9 }),
        text(
          "Υπέρτιτλος",
          "{brand}",
          { x: 6, y: 22, w: 40, h: 7 },
          { role: "eyebrow", color: "red" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 31, w: 44, h: 26 },
          { role: "title", valign: "end" },
        ),
        text(
          "Τιμή",
          "{price}",
          { x: 6, y: 60, w: 40, h: 10 },
          { role: "price" },
        ),
        button("Δείτε το προϊόν", { x: 6, y: 74, w: 40, h: 9 }),
      ],
    }),
  },
  {
    id: "split-left",
    label: "Εικόνα αριστερά",
    hint: "Καθρέφτης του προηγούμενου — χρήσιμο σε διπλανά κελιά.",
    category: "split",
    suits: ["product", "none"],
    build: () => ({
      background: flatBg("white"),
      layers: [
        picture({ x: 4, y: 8, w: 44, h: 84 }),
        text(
          "Τίτλος",
          "{title}",
          { x: 52, y: 31, w: 44, h: 26 },
          { role: "title", valign: "end" },
        ),
        text(
          "Τιμή",
          "{price}",
          { x: 52, y: 60, w: 40, h: 10 },
          { role: "price" },
        ),
        button("Δείτε το προϊόν", { x: 52, y: 74, w: 40, h: 9 }),
      ],
    }),
  },
  {
    id: "price-first",
    label: "Η τιμή πρώτα",
    hint: "Τεράστια τιμή, τίτλος από κάτω. Για επιθετική προσφορά.",
    category: "split",
    suits: ["product"],
    build: () => ({
      background: flatBg("white"),
      layers: [
        badge("{badge}", { x: 0, y: 0, w: 20, h: 11 }),
        picture({ x: 54, y: 14, w: 42, h: 72 }),
        text(
          "Τιμή",
          "{price}",
          { x: 6, y: 30, w: 46, h: 18 },
          { role: "price", color: "red" },
        ),
        text(
          "Πριν",
          "{compare}",
          { x: 6, y: 50, w: 30, h: 8 },
          { role: "compare", color: "muted" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 60, w: 46, h: 22 },
          { role: "title", valign: "end" },
        ),
      ],
    }),
  },
  {
    id: "editorial",
    label: "Μόνο κείμενο",
    hint: "Μεγάλη δήλωση χωρίς εικόνα. Καλό δίπλα σε γεμάτο κελί.",
    category: "text",
    suits: ["none", "offer", "product"],
    build: () => ({
      background: flatBg("white"),
      layers: [
        text(
          "Υπέρτιτλος",
          "",
          { x: 8, y: 22, w: 60, h: 7 },
          { role: "eyebrow", color: "red" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 8, y: 32, w: 84, h: 30 },
          { role: "title" },
        ),
        text(
          "Κείμενο",
          "",
          { x: 8, y: 64, w: 78, h: 16 },
          { role: "body", color: "muted" },
        ),
        button("Δείτε περισσότερα", { x: 8, y: 82, w: 40, h: 9 }),
      ],
    }),
  },
  {
    id: "editorial-dark",
    label: "Μόνο κείμενο, σκούρο",
    hint: "Το ίδιο σε μαύρο φόντο, για αντίθεση ανάμεσα σε δύο λευκά κελιά.",
    category: "text",
    suits: ["none", "offer", "product"],
    build: () => ({
      background: flatBg("ink"),
      layers: [
        text(
          "Τίτλος",
          "{title}",
          { x: 8, y: 30, w: 84, h: 28 },
          { role: "title", color: "white", valign: "end" },
        ),
        text(
          "Κείμενο",
          "",
          { x: 8, y: 60, w: 78, h: 16 },
          { role: "body", color: "white-70" },
        ),
        button(
          "Δείτε περισσότερα",
          { x: 8, y: 80, w: 44, h: 9 },
          "underline",
          "white",
        ),
      ],
    }),
  },
  {
    id: "offer-strip",
    label: "Προσφορά με μέτρηση",
    hint: "Badge, τίτλος και πόσο μένει μέχρι τη λήξη.",
    category: "offer",
    suits: ["offer"],
    build: () => ({
      background: flatBg("ink"),
      layers: [
        badge("{badge}", { x: 6, y: 16, w: 22, h: 12 }),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 33, w: 80, h: 26 },
          { role: "title", color: "white", valign: "end" },
        ),
        text(
          "Λήγει",
          "Λήγει σε {ends}",
          { x: 6, y: 62, w: 50, h: 9 },
          { role: "eyebrow", color: "white-70" },
        ),
        button(
          "Δείτε την προσφορά",
          { x: 6, y: 78, w: 46, h: 9 },
          "solid",
          "white",
        ),
      ],
    }),
  },
  {
    id: "offer-photo",
    label: "Προσφορά με φωτογραφία",
    hint: "Η εικόνα της καμπάνιας γεμάτη, με badge και τίτλο πάνω της.",
    category: "offer",
    suits: ["offer"],
    build: () => ({
      background: photoBg("medium"),
      layers: [
        badge("{badge}", { x: 0, y: 0, w: 20, h: 11 }),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 62, w: 70, h: 22 },
          { role: "title", color: "white", valign: "end" },
        ),
        button(
          "Δείτε την προσφορά",
          { x: 6, y: 85, w: 46, h: 9 },
          "underline",
          "white",
        ),
      ],
    }),
  },
  {
    id: "video-hero",
    label: "Βίντεο",
    hint: "Βίντεο σε πλήρη κάλυψη με τίτλο από πάνω.",
    category: "photo",
    suits: ["none", "offer", "product"],
    build: () => ({
      background: { ...DEFAULT_BACKGROUND, kind: "video", overlay: "medium" },
      layers: [
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 60, w: 70, h: 24 },
          { role: "title", color: "white", valign: "end" },
        ),
        button(
          "Δείτε περισσότερα",
          { x: 6, y: 86, w: 40, h: 9 },
          "underline",
          "white",
        ),
      ],
    }),
  },
  {
    id: "offer-ticker",
    label: "Καμπάνια με εναλλαγή",
    hint: "Τίτλος και κουμπί σταθερά, τα προϊόντα να περνούν ένα-ένα δίπλα.",
    category: "offer",
    suits: ["products"],
    build: () => ({
      background: flatBg("white"),
      layers: [
        badge("{count} προϊόντα", { x: 6, y: 12, w: 24, h: 9 }, "ink"),
        text("Τίτλος", "", { x: 6, y: 26, w: 42, h: 26 }, { role: "title" }),
        text(
          "Κείμενο",
          "",
          { x: 6, y: 54, w: 40, h: 14 },
          { role: "body", color: "muted" },
        ),
        button("Δείτε την προσφορά", { x: 6, y: 76, w: 42, h: 9 }, "solid"),
        ticker({ x: 54, y: 10, w: 40, h: 78 }),
      ],
    }),
  },
  {
    id: "ticker-dark",
    label: "Εναλλαγή σε σκούρο",
    hint: "Το ίδιο σε μαύρο φόντο, με τα προϊόντα σε πλήρες ύψος.",
    category: "offer",
    suits: ["products"],
    build: () => ({
      background: flatBg("ink"),
      layers: [
        text(
          "Τίτλος",
          "",
          { x: 6, y: 30, w: 40, h: 26 },
          { role: "title", color: "white", valign: "end" },
        ),
        button(
          "Δείτε τα όλα",
          { x: 6, y: 66, w: 40, h: 9 },
          "underline",
          "white",
        ),
        ticker({ x: 52, y: 8, w: 44, h: 84 }),
      ],
    }),
  },
  /* ─────────────────────────────────────────────────────────────────────────
     Οι έξι παρακάτω γράφτηκαν με τους κανόνες αντίθεσης μπροστά:

       · Λευκό πάνω σε #EA3E39 δίνει 3,4:1. Περνά για ΜΕΓΑΛΟ κείμενο (το όριο
         είναι 3:1) και ΚΟΒΕΤΑΙ για σώμα κειμένου (όριο 4,5:1). Γι' αυτό καμία
         κόκκινη ζώνη εδώ δεν κουβαλά παράγραφο — μόνο υπέρτιτλο και τίτλο.
       · Ένα κουμπί ανά κελί. Δύο ισοδύναμα κουμπιά είναι μηδέν κουμπιά.
       · Η ιεραρχία βγαίνει από μέγεθος και κενό, όχι από χρώμα: το ίδιο
         πλακίδιο πρέπει να διαβάζεται και ασπρόμαυρο.
     ───────────────────────────────────────────────────────────────────────── */
  {
    id: "stat-slab",
    label: "Ο αριθμός πρώτα",
    hint: "Ένα μέγεθος που είναι το επιχείρημα — κωδικοί, χρόνια, ώρες παράδοσης.",
    category: "text",
    suits: ["none", "offer", "product"],
    build: () => ({
      background: flatBg("ink"),
      layers: [
        text(
          "Υπέρτιτλος",
          "",
          { x: 8, y: 20, w: 60, h: 7 },
          { role: "eyebrow", color: "red" },
        ),
        text(
          "Μέγεθος",
          "",
          { x: 8, y: 29, w: 84, h: 26 },
          { role: "stat", color: "white" },
        ),
        text(
          "Τίτλος",
          "",
          { x: 8, y: 58, w: 72, h: 18 },
          { role: "title", color: "white", valign: "end" },
        ),
        button("Δείτε τα", { x: 8, y: 80, w: 40, h: 9 }, "underline", "white"),
      ],
    }),
  },
  {
    id: "photo-band",
    label: "Φωτογραφία με κόκκινη ζώνη",
    hint: "Η εικόνα επάνω, συμπαγές κόκκινο κάτω. Διαβάζεται πάνω σε οποιαδήποτε φωτογραφία.",
    category: "photo",
    suits: ["offer", "product", "none"],
    build: () => ({
      background: photoBg("none"),
      layers: [
        /* Συμπαγές και όχι ημιδιαφανές: μια ζώνη 85% αφήνει τη φωτογραφία να
           περνά από μέσα, και το λευκό γράμμα κάθεται πάνω σε ό,τι τύχει. */
        brandMark({ x: 74, y: 7, w: 20, h: 10 }),
        shape({ x: 0, y: 62, w: 100, h: 38 }, "red", 100),
        text(
          "Υπέρτιτλος",
          "{brand}",
          { x: 6, y: 67, w: 50, h: 7 },
          { role: "eyebrow", color: "white" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 75, w: 76, h: 18 },
          { role: "title", color: "white", valign: "end" },
        ),
      ],
    }),
  },
  {
    id: "spec-strip",
    label: "Λωρίδα προδιαγραφών",
    hint: "Τίτλος επάνω, τρία νούμερα σε σειρά κάτω. Για ό,τι πουλιέται με μεγέθη.",
    category: "text",
    suits: ["product", "none", "offer"],
    build: () => ({
      background: flatBg("white"),
      layers: [
        /* Η φωτογραφία του προϊόντος δεξιά. Χωρίς αυτήν η παραλλαγή δήλωνε
           ότι ταιριάζει σε προϊόν και δεν έδειχνε το προϊόν πουθενά. */
        picture({ x: 62, y: 12, w: 34, h: 44 }),
        text(
          "Υπέρτιτλος",
          "{brand}",
          { x: 6, y: 16, w: 50, h: 7 },
          { role: "eyebrow", color: "red" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 25, w: 54, h: 24 },
          { role: "title" },
        ),
        /* Μια τρίχα, όχι πλαίσιο: χωρίζει χωρίς να προσθέτει σχήμα. */
        shape({ x: 6, y: 62, w: 88, h: 0.6 }, "ink", 14),
        text(
          "Στοιχείο 1",
          "",
          { x: 6, y: 68, w: 26, h: 7 },
          { role: "eyebrow", color: "muted" },
        ),
        text("Τιμή 1", "", { x: 6, y: 76, w: 26, h: 10 }, { role: "price" }),
        text(
          "Στοιχείο 2",
          "",
          { x: 37, y: 68, w: 26, h: 7 },
          { role: "eyebrow", color: "muted" },
        ),
        text("Τιμή 2", "", { x: 37, y: 76, w: 26, h: 10 }, { role: "price" }),
        text(
          "Στοιχείο 3",
          "",
          { x: 68, y: 68, w: 26, h: 7 },
          { role: "eyebrow", color: "muted" },
        ),
        text("Τιμή 3", "", { x: 68, y: 76, w: 26, h: 10 }, { role: "price" }),
      ],
    }),
  },
  {
    id: "floating-card",
    label: "Κάρτα πάνω στη φωτογραφία",
    hint: "Λευκή κάρτα με τίτλο και τιμή, πάνω σε ολόκληρη τη φωτογραφία.",
    category: "photo",
    suits: ["product", "offer", "none"],
    build: () => ({
      background: photoBg("light"),
      layers: [
        brandMark({ x: 72, y: 7, w: 22, h: 10 }),
        shape({ x: 5, y: 42, w: 60, h: 50 }, "white", 100),
        text(
          "Υπέρτιτλος",
          "{brand}",
          { x: 9, y: 47, w: 42, h: 6 },
          { role: "eyebrow", color: "red" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 9, y: 54, w: 52, h: 20 },
          { role: "title", valign: "end" },
        ),
        text(
          "Πριν",
          "{compare}",
          { x: 9, y: 79, w: 18, h: 6 },
          { role: "compare", color: "muted" },
        ),
        text(
          "Τιμή",
          "{price}",
          { x: 28, y: 77.5, w: 32, h: 9 },
          { role: "price", color: "red" },
        ),
      ],
    }),
  },
  {
    id: "brand-corner",
    label: "Υπογραφή Κολλέρη",
    hint: "Το σήμα επάνω αριστερά, σήμανση δεξιά, τίτλος και τιμή κάτω.",
    category: "photo",
    suits: ["product", "offer", "none"],
    build: () => ({
      background: photoBg("medium"),
      layers: [
        mark({ x: 5, y: 7, w: 22, h: 9 }),
        brandMark({ x: 72, y: 7, w: 22, h: 9 }),
        badge("{badge}", { x: 5, y: 21, w: 17, h: 9 }),
        text(
          "Τίτλος",
          "{title}",
          { x: 5, y: 62, w: 66, h: 20 },
          { role: "title", color: "white", valign: "end" },
        ),
        text(
          "Πριν",
          "{compare}",
          { x: 5, y: 85, w: 20, h: 7 },
          { role: "compare", color: "white-70" },
        ),
        text(
          "Τιμή",
          "{price}",
          { x: 26, y: 84, w: 34, h: 9 },
          { role: "price", color: "white" },
        ),
      ],
    }),
  },
  {
    id: "red-signature",
    label: "Κόκκινη υπογραφή",
    hint: "Το σήμα σε κόκκινο πλακίδιο πάνω αριστερά, τίτλος κάτω. Το πιο αναγνωρίσιμο.",
    category: "photo",
    suits: ["none", "offer", "product"],
    build: () => ({
      background: photoBg("medium"),
      layers: [
        /* Πλακίδιο και όχι διάφανο σήμα: πάνω σε φωτογραφία εργοταξίου ένα
           λευκό λογότυπο χάνεται μέσα στον θόρυβο· ένα κόκκινο ορθογώνιο όχι. */
        mark({ x: 5, y: 6, w: 20, h: 12 }, "on-red"),
        brandMark({ x: 74, y: 7, w: 20, h: 10 }),
        text(
          "Υπέρτιτλος",
          "{brand}",
          { x: 5, y: 62, w: 50, h: 7 },
          { role: "eyebrow", color: "red" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 5, y: 70, w: 72, h: 20 },
          { role: "title", color: "white", valign: "end" },
        ),
        text(
          "Τιμή",
          "{price}",
          { x: 5, y: 91, w: 34, h: 8 },
          { role: "price", color: "white" },
        ),
      ],
    }),
  },
  {
    id: "edge-rule",
    label: "Γραμμή στην άκρη",
    hint: "Μόνο μια κόκκινη γραμμή και ένας μεγάλος τίτλος. Το πιο ήσυχο από όλα.",
    category: "photo",
    suits: ["none", "offer", "product"],
    build: () => ({
      background: photoBg("strong"),
      layers: [
        shape({ x: 6, y: 58, w: 9, h: 0.9 }, "red", 100),
        text(
          "Υπέρτιτλος",
          "",
          { x: 6, y: 63, w: 50, h: 7 },
          { role: "eyebrow", color: "white-70" },
        ),
        text(
          "Τίτλος",
          "{title}",
          { x: 6, y: 71, w: 78, h: 20 },
          { role: "title", color: "white", valign: "end" },
        ),
      ],
    }),
  },
  {
    id: "blank",
    label: "Κενό",
    hint: "Λευκό κελί χωρίς τίποτα. Ξεκινήστε από το μηδέν.",
    category: "text",
    suits: ["none", "product", "offer"],
    build: () => ({ background: flatBg("white"), layers: [] }),
  },
];

export const PRESETS_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

export const CATEGORY_LABEL: Record<PresetCategory, string> = {
  photo: "Με φωτογραφία",
  split: "Χωρισμένα",
  text: "Κείμενο",
  offer: "Προσφορές",
};

/**
 * Apply a preset to a cell, keeping what the preset has no business changing.
 *
 * The binding and the link survive: choosing a different look for a cell bound
 * to a product should not un-bind it, and having to re-pick the product after
 * every preset change would make the gallery useless.
 */
export function applyPreset(
  cell: CellComposition,
  presetId: string,
): CellComposition {
  const preset = PRESETS_BY_ID.get(presetId);
  if (!preset) return cell;
  const built = preset.build();
  return {
    ...cell,
    background: built.background,
    /*
     * Η παραλλαγή έρχεται με τη σειρά της.
     * ─────────────────────────────────────────────────────────────────────
     * Τα layers γεννιούνται με `anim.preset: "none"` και ο συντάκτης έπρεπε
     * να θυμηθεί να επιλέξει κίνηση — οπότε τα περισσότερα banner δεν είχαν
     * καμία. Η κλιμακωτή είναι το σωστό προεπιλεγμένο: διαβάζεται με τη
     * σειρά που διαβάζεται και το κελί, και σβήνεται με ένα κλικ.
     */
    layers: applyAnimRecipe(built.layers, "stagger"),
  };
}
