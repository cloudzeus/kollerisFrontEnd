/**
 * Turn static `metadata` exports into localised `generateMetadata`.
 *
 * A page's `<title>` and description are the two strings a visitor sees before
 * the page renders — in the tab, in a search result, in a shared link. They sat
 * in a module-scope object, which cannot call a hook, so the extraction codemod
 * correctly refused them and they stayed Greek in all three languages.
 *
 * Only the localisable string properties move; `robots`, `alternates` and
 * anything else is carried across untouched. Files that already export
 * `generateMetadata` are left alone — this is a one-way conversion, not a
 * merge.
 */
import ts from "typescript";
import { readFileSync, writeFileSync, globSync, mkdirSync } from "node:fs";
import path from "node:path";

const GREEK = /[Ͱ-Ͽἀ-῿]/;
/** Properties whose value is prose a reader sees. */
const LOCALISABLE = new Set(["title", "description"]);

const TRANSLIT: Record<string, string> = {
  α:"a",β:"v",γ:"g",δ:"d",ε:"e",ζ:"z",η:"i",θ:"th",ι:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"x",
  ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",φ:"f",χ:"ch",ψ:"ps",ω:"o",ά:"a",έ:"e",ή:"i",
  ί:"i",ό:"o",ύ:"y",ώ:"o",ϊ:"i",ϋ:"y",ΐ:"i",ΰ:"y",
};

const keyFor = (text: string, prefix: string) =>
  `${prefix}_${[...text.toLowerCase()].map((c) => TRANSLIT[c] ?? c).join("")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").split("_").filter(Boolean).slice(0, 4).join("_")}` || prefix;

function namespaceFor(file: string): string {
  const rel = path.relative("src", file).replace(/\.tsx$/, "");
  const parts = rel.split("/").filter((p) => p !== "app" && p !== "components" && !p.startsWith("["));
  const name = parts.pop()!;
  const dir = parts.pop();
  return dir ? `${dir}.${name}` : name;
}

function convert(file: string) {
  const original = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const namespace = namespaceFor(file);
  const messages: Record<string, string> = {};

  if (/export async function generateMetadata/.test(original)) return null;

  let statement: ts.VariableStatement | null = null;
  let object: ts.ObjectLiteralExpression | null = null;

  for (const node of source.statements) {
    if (!ts.isVariableStatement(node)) continue;
    if (!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const decl = node.declarationList.declarations[0];
    if (!decl || !ts.isIdentifier(decl.name) || decl.name.text !== "metadata") continue;
    if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;
    statement = node;
    object = decl.initializer;
  }
  if (!statement || !object) return null;

  // Rebuild the object, swapping only the Greek prose for `t(…)` calls.
  const properties: string[] = [];
  let touched = 0;

  for (const property of object.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      LOCALISABLE.has(property.name.text) &&
      ts.isStringLiteral(property.initializer) &&
      GREEK.test(property.initializer.text)
    ) {
      const key = keyFor(property.initializer.text, property.name.text === "title" ? "titlos" : "perigrafi");
      messages[key] = property.initializer.text;
      properties.push(`    ${property.name.text}: t("${key}"),`);
      touched++;
    } else {
      properties.push(`    ${property.getText()},`);
    }
  }
  if (touched === 0) return null;

  const replacement = `export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // Explicit locale: \`setRequestLocale\` belongs to the render pass, and
  // metadata is generated outside it.
  const t = await getTranslations({ locale, namespace: "${namespace}" });
  return {
${properties.join("\n")}
  };
}`;

  let output = original.slice(0, statement.getStart()) + replacement + original.slice(statement.getEnd());

  // The two imports the new function needs, added only when absent.
  if (!/getTranslations/.test(output))
    output = output.replace(/^(import .*\n)/, `$1import { getTranslations } from "next-intl/server";\n`);
  if (!/\bLocale\b/.test(output))
    output = output.replace(/^(import .*\n)/, `$1import type { Locale } from "@/i18n/routing";\n`);

  writeFileSync(file, output);
  return { namespace, messages, touched };
}

const files = globSync("src/**/*.tsx")
  .filter((f: string) => f.startsWith("src/app/"))
  .filter((f) => !f.includes("/admin/"))
  // The root layout has no locale segment — its metadata is the site-wide
  // default and the localised layout overrides it.
  .filter((f) => f !== "src/app/layout.tsx");

const bundle: Record<string, Record<string, string>> = {};
let converted = 0;
for (const file of files) {
  const result = convert(file);
  if (!result) continue;
  converted++;
  bundle[result.namespace] = { ...bundle[result.namespace], ...result.messages };
  console.log(`  ${path.relative("src", file)} → ${result.touched}`);
}

mkdirSync("scripts/i18n/out", { recursive: true });
writeFileSync("scripts/i18n/out/extracted.json", JSON.stringify(bundle, null, 2) + "\n");
console.log(`\n  ${converted} αρχεία μετατράπηκαν`);
