/**
 * Turn interpolated Greek templates into ICU messages.
 *
 * `` `Εικόνα ${index + 1}` `` becomes `t("eikona", { n: index + 1 })` against a
 * message of `"Εικόνα {n}"`. The word order is then the translator's to change,
 * which is the whole point: Italian does not put the number where Greek does,
 * and a template literal cannot express that.
 *
 * Parameter names come from the expression when it says something — `vatRate`
 * from `product.vatRate` — and fall back to `n`, `n2`, `n3`. A name a
 * translator can read is worth more than a positional index they cannot.
 *
 * Templates that already contain a `t(` call are left alone: they are a
 * translated fragment glued to a Greek one, and unpicking that is a rewrite
 * rather than a substitution.
 */
import ts from "typescript";
import { readFileSync, writeFileSync, globSync, mkdirSync } from "node:fs";
import path from "node:path";

const GREEK = /[Ͱ-Ͽἀ-῿]/;

const TRANSLIT: Record<string, string> = {
  α:"a",β:"v",γ:"g",δ:"d",ε:"e",ζ:"z",η:"i",θ:"th",ι:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"x",
  ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",φ:"f",χ:"ch",ψ:"ps",ω:"o",ά:"a",έ:"e",ή:"i",
  ί:"i",ό:"o",ύ:"y",ώ:"o",ϊ:"i",ϋ:"y",ΐ:"i",ΰ:"y",
};

const keyFor = (text: string) =>
  [...text.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join("")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    .split("_").filter(Boolean).slice(0, 5).join("_") || "text";

const namespaceFor = (file: string) => {
  const rel = path.relative("src", file).replace(/\.tsx$/, "");
  const parts = rel.split("/").filter((p) => p !== "app" && p !== "components" && !p.startsWith("["));
  const name = parts.pop()!;
  const dir = parts.pop();
  return dir ? `${dir}.${name}` : name;
};

/** A readable name for the value dropped into the sentence. */
function paramName(expr: ts.Expression, taken: Set<string>): string {
  let base = "n";
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  base = base.replace(/[^A-Za-z0-9_]/g, "") || "n";
  if (!taken.has(base)) { taken.add(base); return base; }
  let i = 2;
  while (taken.has(`${base}${i}`)) i++;
  taken.add(`${base}${i}`);
  return `${base}${i}`;
}

const files = globSync("src/{app/[locale],components}/**/*.tsx").filter(
  (f) => !f.includes("/admin/") && !f.includes("components/admin"),
);

const bundle: Record<string, Record<string, string>> = {};
const skipped: Array<{ file: string; value: string; why: string }> = [];
let converted = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  if (!GREEK.test(original)) continue;

  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const namespace = namespaceFor(file);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const messages: Record<string, string> = {};
  const used = new Set<string>();

  const visit = (node: ts.Node) => {
    if (ts.isTemplateExpression(node) && GREEK.test(node.getText())) {
      const raw = node.getText();
      if (/\bt\(/.test(raw)) {
        skipped.push({ file: path.relative("src", file), value: raw.slice(0, 60), why: "περιέχει ήδη t()" });
      } else {
        const taken = new Set<string>();
        const args: string[] = [];
        let message = node.head.text;

        for (const span of node.templateSpans) {
          const name = paramName(span.expression, taken);
          args.push(`${name}: ${span.expression.getText()}`);
          message += `{${name}}${span.literal.text}`;
        }

        let key = keyFor(message);
        let n = 2;
        while (used.has(key)) key = `${keyFor(message)}_${n++}`;
        used.add(key);
        messages[key] = message;

        edits.push({
          start: node.getStart(),
          end: node.getEnd(),
          text: `t("${key}", { ${args.join(", ")} })`,
        });
        converted++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (edits.length === 0) continue;

  let output = original;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  writeFileSync(file, output);
  bundle[namespace] = { ...bundle[namespace], ...messages };
}

mkdirSync("scripts/i18n/out", { recursive: true });
writeFileSync("scripts/i18n/out/extracted.json", JSON.stringify(bundle, null, 2) + "\n");
console.log(`  ${converted} templates → ICU σε ${Object.keys(bundle).length} namespaces`);
for (const s of skipped) console.log(`    παραλείφθηκε [${s.why}] ${s.file}: ${s.value}`);
