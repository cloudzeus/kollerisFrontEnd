import {
  DEFAULT_BACKGROUND,
  DEFAULT_TEXT_STYLE,
  newLayer,
  type BadgeLayer,
  type Background,
  type ButtonLayer,
  type CellComposition,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/banners/contract";

/**
 * The variation library.
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
  suits: Array<"none" | "product" | "offer">;
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
  return layer;
};

const button = (
  value: string,
  frame: ButtonLayer["frame"],
  variant: ButtonLayer["variant"] = "underline",
  color: ButtonLayer["style"]["color"] = "ink",
): ButtonLayer => {
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

const picture = (frame: ImageLayer["frame"], fit: ImageLayer["fit"] = "contain"): ImageLayer => {
  const layer = newLayer("image") as ImageLayer;
  // The bound entity's own photograph. A literal URL can be picked instead.
  layer.src = "{image}";
  layer.frame = frame;
  layer.fit = fit;
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
        text("Υπέρτιτλος", "{brand}", { x: 6, y: 55, w: 50, h: 7 }, {
          font: "mono",
          size: 15,
          weight: 500,
          tracking: 10,
          color: "red",
        }),
        text("Τίτλος", "{title}", { x: 6, y: 63, w: 62, h: 19 }, { color: "white", size: 42 }),
        text("Τιμή", "{price}", { x: 6, y: 84, w: 40, h: 10 }, {
          font: "mono",
          size: 26,
          weight: 600,
          tracking: 0,
          color: "white",
          uppercase: false,
        }),
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
        text("Τίτλος", "{title}", { x: 12, y: 34, w: 76, h: 24 }, {
          color: "white",
          size: 46,
          align: "center",
        }),
        button("Δείτε περισσότερα", { x: 33, y: 64, w: 34, h: 9 }, "underline", "white"),
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
        shape({ x: 0, y: 58, w: 100, h: 42 }, "ink", 82),
        text("Τίτλος", "{title}", { x: 6, y: 63, w: 66, h: 20 }, { color: "white", size: 38 }),
        text("Τιμή", "{price}", { x: 6, y: 85, w: 40, h: 9 }, {
          font: "mono",
          size: 24,
          weight: 600,
          tracking: 0,
          color: "white",
          uppercase: false,
        }),
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
        text("Υπέρτιτλος", "{brand}", { x: 6, y: 22, w: 40, h: 7 }, {
          font: "mono",
          size: 15,
          weight: 500,
          tracking: 10,
          color: "red",
        }),
        text("Τίτλος", "{title}", { x: 6, y: 31, w: 44, h: 26 }, { size: 34 }),
        text("Τιμή", "{price}", { x: 6, y: 60, w: 40, h: 10 }, {
          font: "mono",
          size: 26,
          weight: 600,
          tracking: 0,
          uppercase: false,
        }),
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
        text("Τίτλος", "{title}", { x: 52, y: 31, w: 44, h: 26 }, { size: 34 }),
        text("Τιμή", "{price}", { x: 52, y: 60, w: 40, h: 10 }, {
          font: "mono",
          size: 26,
          weight: 600,
          tracking: 0,
          uppercase: false,
        }),
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
        text("Τιμή", "{price}", { x: 6, y: 30, w: 46, h: 18 }, {
          font: "mono",
          size: 56,
          weight: 700,
          tracking: -2,
          color: "red",
          uppercase: false,
        }),
        text("Πριν", "{compare}", { x: 6, y: 50, w: 30, h: 8 }, {
          font: "mono",
          size: 20,
          weight: 400,
          tracking: 0,
          color: "muted",
          uppercase: false,
        }),
        text("Τίτλος", "{title}", { x: 6, y: 60, w: 46, h: 22 }, { size: 24 }),
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
        text("Υπέρτιτλος", "", { x: 8, y: 22, w: 60, h: 7 }, {
          font: "mono",
          size: 15,
          weight: 500,
          tracking: 10,
          color: "red",
        }),
        text("Τίτλος", "{title}", { x: 8, y: 32, w: 84, h: 30 }, { size: 40 }),
        text("Κείμενο", "", { x: 8, y: 64, w: 78, h: 16 }, {
          font: "sans",
          size: 18,
          weight: 400,
          tracking: 0,
          leading: 155,
          color: "muted",
          uppercase: false,
        }),
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
        text("Τίτλος", "{title}", { x: 8, y: 30, w: 84, h: 28 }, { size: 38, color: "white" }),
        text("Κείμενο", "", { x: 8, y: 60, w: 78, h: 16 }, {
          font: "sans",
          size: 18,
          weight: 400,
          tracking: 0,
          leading: 155,
          color: "white-70",
          uppercase: false,
        }),
        button("Δείτε περισσότερα", { x: 8, y: 80, w: 44, h: 9 }, "underline", "white"),
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
        text("Τίτλος", "{title}", { x: 6, y: 33, w: 80, h: 26 }, { size: 36, color: "white" }),
        text("Λήγει", "Λήγει σε {ends}", { x: 6, y: 62, w: 50, h: 9 }, {
          font: "mono",
          size: 18,
          weight: 500,
          tracking: 4,
          color: "white-70",
          uppercase: false,
        }),
        button("Δείτε την προσφορά", { x: 6, y: 78, w: 46, h: 9 }, "solid", "white"),
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
        text("Τίτλος", "{title}", { x: 6, y: 62, w: 70, h: 22 }, { size: 38, color: "white" }),
        button("Δείτε την προσφορά", { x: 6, y: 85, w: 46, h: 9 }, "underline", "white"),
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
        text("Τίτλος", "{title}", { x: 6, y: 60, w: 70, h: 24 }, { size: 44, color: "white" }),
        button("Δείτε περισσότερα", { x: 6, y: 86, w: 40, h: 9 }, "underline", "white"),
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
export function applyPreset(cell: CellComposition, presetId: string): CellComposition {
  const preset = PRESETS_BY_ID.get(presetId);
  if (!preset) return cell;
  const built = preset.build();
  return { ...cell, background: built.background, layers: built.layers };
}
