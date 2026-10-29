import "server-only";
import { sanitizeHtml } from "@/lib/content/sanitize-html";
import type { ContentKind } from "@/lib/content/registry";

/**
 * Translation for editable copy, through OpenRouter.
 *
 * OpenRouter speaks the OpenAI chat-completions protocol, so this mirrors the
 * shape of `./deepseek.ts`: one low-level `chat`, then task-specific helpers
 * with prompts tuned for fidelity (a translation wants faithfulness and nothing
 * else — low temperature, keep brand names, codes, units and `{tokens}`).
 *
 * Output is never applied automatically. It is returned to the admin as a draft
 * a person reviews before saving — nobody should discover a machine translation
 * live on the shop.
 */

const TIMEOUT_MS = 30_000;

export class OpenRouterError extends Error {}

function config() {
  const key = process.env.OPENROUTER_API_KEY;
  const url = process.env.OPENROUTER_API_URL ?? "https://openrouter.ai/api/v1/chat/completions";
  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  if (!key) throw new OpenRouterError("OPENROUTER_API_KEY δεν έχει οριστεί.");
  return { key, url, model };
}

export async function chat(system: string, user: string, maxTokens = 600): Promise<string> {
  const { key, url, model } = config();

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // A translation is not a brainstorm: keep it close to the source.
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new OpenRouterError(`OpenRouter ${response.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new OpenRouterError("Η OpenRouter δεν επέστρεψε κείμενο.");
  return text;
}

const LANGUAGE: Record<string, string> = { el: "Ελληνικά", en: "English", it: "Italiano" };

/** Models sometimes wrap the answer in a ```json / ```html fence; take the body. */
function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json|html)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/**
 * Translate one plain string. Product and brand names, codes, units and
 * `{tokens}` stay verbatim — translating "FACOM" or a tool code helpfully
 * produces something nobody can search for.
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
    "Πρόκειται για κείμενο e-shop επαγγελματικών εργαλείων (Kolleris, από το 1978).",
    "Κράτησε αμετάφραστα: ονόματα brand, κωδικούς προϊόντων, μονάδες μέτρησης.",
    "Κράτησε ως έχουν τα {tokens} σε άγκιστρα.",
    maxChars ? `Το αποτέλεσμα ΜΕΧΡΙ ${maxChars} χαρακτήρες.` : "",
    "Επίστρεψε ΜΟΝΟ τη μετάφραση, χωρίς σχόλια ή εισαγωγικά.",
  ]
    .filter(Boolean)
    .join(" ");

  const raw = await chat(system, text, 600);
  return stripFences(raw).replace(/^["«]|["»]$/g, "").trim();
}

/**
 * Translate a rich HTML value. The model is told to keep the tag structure and
 * translate only the visible text; the result is re-sanitised here, so a model
 * that adds an attribute or a stray tag cannot smuggle it into the page.
 */
export async function translateHtml({
  html,
  from,
  to,
}: {
  html: string;
  from: string;
  to: string;
}): Promise<string> {
  if (!html.trim()) return "";

  const system = [
    `Μετάφρασε από ${LANGUAGE[from] ?? from} σε ${LANGUAGE[to] ?? to}.`,
    "Το κείμενο είναι HTML. Επίστρεψε ΤΟ ΙΔΙΟ HTML, μεταφράζοντας μόνο το ορατό κείμενο.",
    "ΜΗΝ προσθέσεις, αφαιρέσεις ή αλλάξεις ετικέτες (tags) ή attributes.",
    "Κράτησε αμετάφραστα: ονόματα brand, κωδικούς, μονάδες μέτρησης.",
    "Χωρίς markdown, χωρίς ```html, χωρίς σχόλια — μόνο το HTML.",
  ].join(" ");

  const raw = await chat(system, html, Math.min(4000, html.length + 400));
  return sanitizeHtml(stripFences(raw));
}

/** Pick the right translator for a block's kind. Empty input short-circuits. */
export async function translateValue({
  kind,
  text,
  from,
  to,
  maxChars,
}: {
  kind: ContentKind;
  text: string;
  from: string;
  to: string;
  maxChars?: number;
}): Promise<string> {
  if (!text.trim()) return "";
  return kind === "rich" ? translateHtml({ html: text, from, to }) : translateText({ text, from, to, maxChars });
}

/**
 * Translate many strings in one request. JSON in, JSON out, positional: a batch
 * that comes back the wrong length is rejected rather than zipped up hopefully.
 */
export async function translateBatch({
  texts,
  from,
  to,
}: {
  texts: string[];
  from: string;
  to: string;
}): Promise<string[]> {
  if (texts.length === 0) return [];

  const system = [
    `Μετάφρασε από ${LANGUAGE[from] ?? from} σε ${LANGUAGE[to] ?? to}.`,
    "Πρόκειται για e-shop επαγγελματικών εργαλείων.",
    "Κράτησε αμετάφραστα: ονόματα brand, κωδικούς, μονάδες μέτρησης, τα {tokens}.",
    "Δέχεσαι πίνακα JSON και επιστρέφεις πίνακα JSON με ΤΟΝ ΙΔΙΟ αριθμό στοιχείων, στην ίδια σειρά.",
    "Επίστρεψε ΜΟΝΟ τον πίνακα JSON, χωρίς σχόλια ή markdown.",
  ].join(" ");

  const raw = await chat(system, JSON.stringify(texts), Math.min(8000, texts.length * 60 + 400));

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(raw));
  } catch {
    throw new OpenRouterError("Η μετάφραση δεν επέστρεψε έγκυρο JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length !== texts.length) {
    throw new OpenRouterError(
      `Η μετάφραση επέστρεψε ${Array.isArray(parsed) ? parsed.length : "?"} αντί για ${texts.length} στοιχεία.`,
    );
  }

  return parsed.map((value, i) => (typeof value === "string" ? value.trim() : texts[i]!));
}
