/**
 * Lift the FAQ copy out of `lib/faq/faq.ts` into the message files.
 *
 * The file is 19 questions and answers with every number interpolated from the
 * constant the rest of the site uses — the free-shipping threshold, the ACS
 * delivery windows, the live catalogue counts. That is worth keeping: a FAQ
 * goes stale silently, and hardcoded numbers are how it starts lying.
 *
 * So each answer becomes an ICU message with named parameters, and the values
 * are still computed in the module. The words move; the arithmetic does not.
 */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "src/lib/faq/faq.ts";
const TRANSLIT: Record<string, string> = {
  α:"a",β:"v",γ:"g",δ:"d",ε:"e",ζ:"z",η:"i",θ:"th",ι:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"x",
  ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",φ:"f",χ:"ch",ψ:"ps",ω:"o",ά:"a",έ:"e",ή:"i",
  ί:"i",ό:"o",ύ:"y",ώ:"o",ϊ:"i",ϋ:"y",ΐ:"i",ΰ:"y",
};
const slug = (text: string, words: number) =>
  [...text.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").split("_").filter(Boolean).slice(0, words).join("_");

/** `n(inStock)` → `inStock`; `eta("attica")` → `etaAttica`. */
function paramName(expression: string): string {
  const call = /^(\w+)\((.*)\)$/.exec(expression.trim());
  if (!call) return expression.trim().replace(/\W/g, "");
  const [, fn, arg] = call;
  if (fn === "n") return arg.replace(/\W/g, "");
  const cleaned = arg.replace(/["']/g, "").replace(/\W/g, "");
  return cleaned ? fn + cleaned[0].toUpperCase() + cleaned.slice(1) : fn;
}

const original = readFileSync(FILE, "utf8");
const source = ts.createSourceFile(FILE, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

type Edit = { start: number; end: number; text: string };
const edits: Edit[] = [];
const messages: Record<string, string> = {};
const used = new Set<string>();

/** Turn one `q`/`a`/`title` value into a `t(…)` call, recording the message. */
function lift(node: ts.Expression, hint: string, words: number): string | null {
  let icu: string;
  let args = "";

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    icu = node.text;
  } else if (ts.isTemplateExpression(node)) {
    const params: Array<[string, string]> = [];
    icu = node.head.text;
    for (const span of node.templateSpans) {
      const expression = span.expression.getText();
      let name = paramName(expression);
      // Two different expressions must not collide on one parameter name.
      let existing = params.find(([n]) => n === name);
      if (existing && existing[1] !== expression) name = `${name}${params.length + 1}`;
      if (!params.some(([n]) => n === name)) params.push([name, expression]);
      icu += `{${name}}` + span.literal.text;
    }
    if (params.length)
      args = `, { ${params.map(([n, e]) => (n === e ? n : `${n}: ${e}`)).join(", ")} }`;
  } else {
    return null;
  }

  let key = `${hint}_${slug(icu, words)}`;
  let i = 2;
  while (used.has(key)) key = `${hint}_${slug(icu, words)}_${i++}`;
  used.add(key);
  messages[key] = icu;
  return `t("${key}"${args})`;
}

const visit = (node: ts.Node) => {
  if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
    const field = node.name.text;
    const hint = field === "q" ? "erotisi" : field === "a" ? "apantisi" : field === "title" ? "enotita" : null;
    if (hint) {
      const call = lift(node.initializer, hint, field === "a" ? 6 : 5);
      if (call) edits.push({ start: node.initializer.getStart(), end: node.initializer.getEnd(), text: call });
    }
  }
  ts.forEachChild(node, visit);
};
visit(source);

let output = original;
for (const edit of edits.sort((a, b) => b.start - a.start))
  output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);

// The translator replaces the `void locale` placeholder that stood in for it.
output = output.replace(
  /  \/\/ Locale is threaded through for when the copy is translated; the answers\n  \/\/ below are Greek only today, which is the site's default\.\n  void locale;/,
  '  const t = await getTranslations({ locale, namespace: "faq" });',
);
output = output.replace('import { cache } from "react";', 'import { cache } from "react";\nimport { getTranslations } from "next-intl/server";');

writeFileSync(FILE, output);

const el = JSON.parse(readFileSync("src/messages/el.json", "utf8"));
el.faq = { ...messages, ...el.faq };
writeFileSync("src/messages/el.json", JSON.stringify(el, null, 2) + "\n");

console.log(`  ${edits.length} κείμενα → ${Object.keys(messages).length} κλειδιά`);
