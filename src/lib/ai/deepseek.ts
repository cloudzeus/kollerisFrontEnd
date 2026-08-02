import "server-only";

/**
 * Marketing copy and translation, through DeepSeek.
 *
 * Two jobs, deliberately separate prompts. Writing a headline and translating
 * one are different tasks: the first wants invention inside a length budget, the
 * second wants fidelity and nothing else. A single "do something with this text"
 * prompt does both badly.
 *
 * ── The constraint that matters ───────────────────────────────────────────
 * Every field in the builder has a character budget the layout was designed
 * around. The model is told that budget and asked for options that fit; anything
 * over is filtered out here rather than shown, because a suggestion that breaks
 * the tile is worse than one fewer suggestion.
 *
 * Output is never applied automatically. It arrives as options a person picks —
 * this writes the shop's voice, and nobody should discover a generated headline
 * live.
 */

const TIMEOUT_MS = 30_000;

export class DeepSeekError extends Error {}

function config() {
  const key = process.env.DEEPSEEK_API_KEY;
  const url = process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions";
  if (!key) throw new DeepSeekError("DEEPSEEK_API_KEY δεν έχει οριστεί.");
  return { key, url };
}

async function chat(system: string, user: string, maxTokens = 500): Promise<string> {
  const { key, url } = config();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Warm enough to produce different options, not so warm that a headline
      // wanders off the product.
      temperature: 0.8,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new DeepSeekError(`DeepSeek ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new DeepSeekError("Η DeepSeek δεν επέστρεψε κείμενο.");
  return text;
}

const LANGUAGE: Record<string, string> = {
  el: "Ελληνικά",
  en: "English",
  it: "Italiano",
};

/**
 * Marketing options for one field.
 *
 * `context` is what the widget is about — a product name, a category, whatever
 * the operator typed. Without it the model writes generic retail filler, which
 * is exactly the copy this is meant to replace.
 */
export async function generateCopy({
  field,
  context,
  maxChars,
  locale,
  count = 4,
}: {
  field: string;
  context: string;
  maxChars?: number;
  locale: string;
  count?: number;
}): Promise<string[]> {
  const limit = maxChars ?? 80;
  const language = LANGUAGE[locale] ?? "Ελληνικά";

  const system = [
    "Είσαι copywriter για ελληνικό e-shop επαγγελματικών εργαλείων (Kolleris, από το 1978).",
    "Κοινό: τεχνίτες, συνεργεία, ναυτιλία, εργοστάσια. Μιλούν στη δουλειά τους, όχι σε διαφήμιση.",
    "Ύφος: άμεσο, συγκεκριμένο, χωρίς υπερβολές, χωρίς θαυμαστικά, χωρίς emoji.",
    `Γράψε στα ${language}.`,
    `Κάθε πρόταση ΜΕΧΡΙ ${limit} χαρακτήρες. Αυτό είναι απόλυτο όριο.`,
    `Δώσε ακριβώς ${count} διαφορετικές εκδοχές, μία ανά γραμμή, χωρίς αρίθμηση ή εισαγωγικά.`,
  ].join(" ");

  const user = `Πεδίο: ${field}\nΘέμα: ${context || "γενικό μήνυμα καταστήματος"}`;

  const raw = await chat(system, user, 400);

  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*[\d.\-•*]+\s*/, "").replace(/^["«]|["»]$/g, "").trim())
    .filter(Boolean)
    // The length budget is enforced here, not hoped for: the model overshoots
    // often enough that showing an option which breaks the tile is a real risk.
    .filter((line) => line.length <= limit)
    .slice(0, count);
}

/**
 * Translate many strings in one request.
 *
 * Seven hundred category names one call at a time is seven hundred round trips
 * and about as many minutes. Batched, it is a handful of requests — and the
 * model sees siblings together, which is why "ΚΛΕΙΔΙΑ" comes back as "Wrenches"
 * rather than "Keys" when the batch also holds "ΚΑΣΤΑΝΙΕΣ" and "ΜΥΤΕΣ".
 *
 * JSON in, JSON out, positional. A batch that comes back the wrong length is
 * rejected rather than zipped up hopefully: a silent off-by-one here would
 * mislabel every category after it.
 */
export async function translateBatch({
  texts,
  from,
  to,
  context,
}: {
  texts: string[];
  from: string;
  to: string;
  /** What this set of strings IS, so the model can pick the right register. */
  context?: string;
}): Promise<string[]> {
  if (texts.length === 0) return [];

  const system = [
    `Μετάφρασε από ${LANGUAGE[from] ?? from} σε ${LANGUAGE[to] ?? to}.`,
    "Πρόκειται για e-shop επαγγελματικών εργαλείων.",
    context ? `Τα κείμενα είναι: ${context}.` : "",
    "Κράτησε αμετάφραστα: ονόματα brand, κωδικούς, μονάδες μέτρησης, διαστάσεις.",
    "Δέχεσαι πίνακα JSON και επιστρέφεις πίνακα JSON με ΤΟΝ ΙΔΙΟ αριθμό στοιχείων, στην ίδια σειρά.",
    "Επίστρεψε ΜΟΝΟ τον πίνακα JSON, χωρίς σχόλια ή markdown.",
  ]
    .filter(Boolean)
    .join(" ");

  const raw = await chat(system, JSON.stringify(texts), Math.min(8000, texts.length * 60 + 400));

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?|```$/g, "").trim());
  } catch {
    throw new Error("Η μετάφραση δεν επέστρεψε έγκυρο JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new Error(
      `Η μετάφραση επέστρεψε ${Array.isArray(parsed) ? parsed.length : "?"} αντί για ${texts.length} στοιχεία.`,
    );
  }

  return parsed.map((value, i) => (typeof value === "string" ? value.trim() : texts[i]));
}

/**
 * Translate one string.
 *
 * Product and brand names stay as they are — translating "FACOM" or a tool code
 * produces something nobody can search for. The instruction is explicit because
 * models otherwise translate them helpfully.
 */
export async function translateText({
  text,
  from,
  to,
  maxChars,
}: {
  text: string;
  from: string;
  to: string;
  maxChars?: number;
}): Promise<string> {
  if (!text.trim()) return "";

  const system = [
    `Μετάφρασε από ${LANGUAGE[from] ?? from} σε ${LANGUAGE[to] ?? to}.`,
    "Πρόκειται για κείμενο e-shop επαγγελματικών εργαλείων.",
    "Κράτησε αμετάφραστα: ονόματα brand, κωδικούς προϊόντων, μονάδες μέτρησης.",
    "Κράτησε ως έχουν τα {tokens} σε άγκιστρα.",
    maxChars ? `Το αποτέλεσμα ΜΕΧΡΙ ${maxChars} χαρακτήρες.` : "",
    "Επίστρεψε ΜΟΝΟ τη μετάφραση, χωρίς σχόλια ή εισαγωγικά.",
  ]
    .filter(Boolean)
    .join(" ");

  const raw = await chat(system, text, 600);
  return raw.replace(/^["«]|["»]$/g, "").trim();
}
