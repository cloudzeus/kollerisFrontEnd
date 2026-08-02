/**
 * Lift the Greek out of the components and into the message files.
 *
 * Five hundred strings by hand is a week and a hundred typos. This walks the
 * syntax tree, so it edits code rather than text: no regex ever sees a JSX
 * attribute, and a Greek word inside a comment or a class name is invisible to
 * it.
 *
 * ── What it refuses to touch ──
 * Anything at module scope. A `const STATUS = { pending: "Σε αναμονή" }` above
 * the component cannot call a hook, and rewriting it would need the object
 * moved inside or turned into a function — a judgement about that file's shape,
 * not a mechanical substitution. Those are listed at the end for a human.
 *
 * Template literals with interpolation are skipped for the same reason: they
 * become ICU messages with named parameters, and the naming is a decision.
 *
 * Edits are spliced by character offset, back to front, so the positions the
 * parser reported stay valid and nothing else in the file is reformatted.
 */
import ts from "typescript";
import { readFileSync, writeFileSync, globSync, mkdirSync } from "node:fs";
import path from "node:path";

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const VISIBLE_ATTRS = new Set(["placeholder", "aria-label", "title", "alt", "label"]);

/* ── keys ── */

const TRANSLIT: Record<string, string> = {
  α:"a",β:"v",γ:"g",δ:"d",ε:"e",ζ:"z",η:"i",θ:"th",ι:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"x",
  ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",φ:"f",χ:"ch",ψ:"ps",ω:"o",ά:"a",έ:"e",ή:"i",
  ί:"i",ό:"o",ύ:"y",ώ:"o",ϊ:"i",ϋ:"y",ΐ:"i",ΰ:"y",
};

/** A key you can read in the JSON and match back to the screen. */
function keyFor(text: string): string {
  const slug = [...text.toLowerCase()]
    .map((c) => TRANSLIT[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .split("_")
    .filter(Boolean)
    .slice(0, 5)
    .join("_");
  return slug || "text";
}

/** `components/checkout/CheckoutForm.tsx` → `checkout.CheckoutForm` */
function namespaceFor(file: string): string {
  const rel = path.relative("src", file).replace(/\.tsx$/, "");
  const parts = rel.split("/").filter((p) => p !== "app" && p !== "components" && !p.startsWith("["));
  const name = parts.pop()!;
  const dir = parts.pop();
  return dir ? `${dir}.${name}` : name;
}

/* ── the pass ── */

type Edit = { start: number; end: number; text: string };

export type FileResult = {
  file: string;
  namespace: string;
  messages: Record<string, string>;
  edits: number;
  skipped: Array<{ line: number; value: string; why: string }>;
};

/** A function that renders JSX, i.e. somewhere `t` can live. */
function componentBody(node: ts.Node): ts.Block | null {
  if (
    (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
    node.body &&
    ts.isBlock(node.body)
  ) {
    let hasJsx = false;
    const look = (n: ts.Node) => {
      if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) hasJsx = true;
      if (!hasJsx) ts.forEachChild(n, look);
    };
    look(node.body);
    return hasJsx ? node.body : null;
  }
  return null;
}

export function transform(file: string): FileResult {
  const original = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const namespace = namespaceFor(file);
  const isClient = /^\s*["']use client["']/m.test(original);

  const messages: Record<string, string> = {};
  const edits: Edit[] = [];
  const skipped: FileResult["skipped"] = [];
  const bodies: ts.Block[] = [];
  const used = new Set<string>();

  const line = (pos: number) => source.getLineAndCharacterOfPosition(pos).line + 1;

  const register = (text: string): string => {
    const existing = Object.entries(messages).find(([, v]) => v === text);
    if (existing) return existing[0];
    let key = keyFor(text);
    let n = 2;
    while (used.has(key)) key = `${keyFor(text)}_${n++}`;
    used.add(key);
    messages[key] = text;
    return key;
  };

  /** Is this node inside a component body — i.e. can it reach `t`? */
  const inComponent = (node: ts.Node) => bodies.some((b) => node.getStart() > b.getStart() && node.getEnd() < b.getEnd());

  // First pass: find the component bodies, so scope is known before rewriting.
  const findBodies = (node: ts.Node) => {
    const body = componentBody(node);
    if (body) bodies.push(body);
    ts.forEachChild(node, findBodies);
  };
  findBodies(source);

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const value = node.text.trim();
      if (GREEK.test(value)) {
        if (!inComponent(node)) skipped.push({ line: line(node.getStart()), value, why: "εκτός component" });
        else {
          const key = register(value);
          // Keep the surrounding whitespace: JSX text carries the line breaks
          // and indentation that separate it from its siblings.
          const raw = node.getText();
          const lead = raw.slice(0, raw.indexOf(value));
          const tail = raw.slice(raw.indexOf(value) + value.length);
          edits.push({ start: node.getStart(), end: node.getEnd(), text: `${lead}{t("${key}")}${tail}` });
        }
      }
    }

    if (ts.isStringLiteral(node) && GREEK.test(node.text)) {
      const parent = node.parent;
      const isAttr =
        (ts.isJsxAttribute(parent) && VISIBLE_ATTRS.has(parent.name.getText())) ||
        (ts.isJsxExpression(parent) &&
          ts.isJsxAttribute(parent.parent) &&
          VISIBLE_ATTRS.has(parent.parent.name.getText()));

      const inJsxExpression = ts.isJsxExpression(parent);
      const inCall = ts.isCallExpression(parent);
      const inTernary = ts.isConditionalExpression(parent);

      if (isAttr || inJsxExpression || inCall || inTernary) {
        if (!inComponent(node)) {
          skipped.push({ line: line(node.getStart()), value: node.text, why: "εκτός component" });
        } else {
          const key = register(node.text);
          const call = `t("${key}")`;
          // A bare attribute needs braces; everything else is already an
          // expression position.
          edits.push({
            start: node.getStart(),
            end: node.getEnd(),
            text: ts.isJsxAttribute(parent) ? `{${call}}` : call,
          });
        }
      } else if (!inComponent(node)) {
        skipped.push({ line: line(node.getStart()), value: node.text, why: "εκτός component" });
      } else {
        skipped.push({ line: line(node.getStart()), value: node.text, why: ts.SyntaxKind[parent.kind] });
      }
    }

    if (
      (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      GREEK.test(node.getText())
    ) {
      skipped.push({ line: line(node.getStart()), value: node.getText().slice(0, 60), why: "template literal" });
    }

    ts.forEachChild(node, visit);
  };
  visit(source);

  if (edits.length === 0) return { file, namespace, messages, edits: 0, skipped };

  /* ── give every touched component a `t` ── */
  const touched = bodies.filter((body) =>
    edits.some((e) => e.start > body.getStart() && e.end < body.getEnd()),
  );

  for (const body of touched) {
    const fn = body.parent as ts.FunctionLikeDeclaration;
    const isAsync = fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    // A server component is async and gets the awaited helper; a client one
    // gets the hook. Getting this backwards is a runtime error, not a type one.
    const decl = isClient
      ? `\n  const t = useTranslations("${namespace}");`
      : isAsync
        ? `\n  const t = await getTranslations("${namespace}");`
        : `\n  const t = useTranslations("${namespace}");`;
    edits.push({ start: body.getStart() + 1, end: body.getStart() + 1, text: decl });
  }

  const needsHook = isClient || touched.some((b) => {
    const fn = b.parent as ts.FunctionLikeDeclaration;
    return !(fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false);
  });
  const needsServer = touched.some((b) => {
    const fn = b.parent as ts.FunctionLikeDeclaration;
    return !isClient && (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false);
  });

  const imports: string[] = [];
  if (needsHook && !original.includes("useTranslations")) imports.push(`import { useTranslations } from "next-intl";`);
  if (needsServer && !original.includes("getTranslations")) imports.push(`import { getTranslations } from "next-intl/server";`);

  let output = original;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  if (imports.length) {
    const directive = /^\s*["']use client["'];?\s*\n/.exec(output);
    const at = directive ? directive[0].length : 0;
    output = output.slice(0, at) + imports.join("\n") + "\n" + output.slice(at);
  }

  writeFileSync(file, output);
  return { file, namespace, messages, edits: edits.length, skipped };
}

/* ── run ── */

if (process.argv[1]?.endsWith("codemod.mts")) {
  const only = process.argv.slice(2);
  const files = globSync("src/{app/[locale],components}/**/*.tsx")
    .filter((f) => !f.includes("/admin/") && !f.includes("components/admin"))
    .filter((f) => only.length === 0 || only.some((o) => f.includes(o)));

  const bundle: Record<string, Record<string, string>> = {};
  let edited = 0, files_ = 0;
  const skipped: Array<{ file: string; line: number; value: string; why: string }> = [];

  for (const file of files) {
    const result = transform(file);
    if (result.edits > 0) {
      files_++;
      edited += result.edits;
      bundle[result.namespace] = { ...bundle[result.namespace], ...result.messages };
    }
    for (const s of result.skipped) skipped.push({ file: path.relative("src", file), ...s });
  }

  mkdirSync("scripts/i18n/out", { recursive: true });
  writeFileSync("scripts/i18n/out/extracted.json", JSON.stringify(bundle, null, 2) + "\n");
  writeFileSync("scripts/i18n/out/skipped.json", JSON.stringify(skipped, null, 2) + "\n");

  const keys = Object.values(bundle).reduce((n, m) => n + Object.keys(m).length, 0);
  console.log(`  ${keys} κλειδιά από ${files_} αρχεία (${edited} αλλαγές)`);
  console.log(`  παραλείφθηκαν: ${skipped.length}`);
  const why = new Map<string, number>();
  for (const s of skipped) why.set(s.why, (why.get(s.why) ?? 0) + 1);
  [...why].sort((a, b) => b[1] - a[1]).forEach(([w, n]) => console.log(`      ${String(n).padStart(4)}  ${w}`));
}
