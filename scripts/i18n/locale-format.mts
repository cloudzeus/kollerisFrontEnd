/**
 * Replace the hardcoded `"el-GR"` in number and date formatting with the
 * locale the page is actually being rendered in.
 *
 * `(1234).toLocaleString("el-GR")` is "1.234", and an English reader parses
 * that as one point two three four. Dates are worse: `toLocaleDateString`
 * returns ΜΑΪΟΣ on an Italian page. Neither is caught by any message-key check,
 * because no message is involved.
 *
 * Only rewrites where `locale` is genuinely in scope — a parameter or a
 * declaration in the enclosing function or one of its ancestors. Everything
 * else is reported rather than guessed at, since a sub-component that never
 * received the locale needs a prop, which is a change to its signature and its
 * call sites.
 */
import ts from "typescript";
import { readFileSync, writeFileSync, globSync } from "node:fs";
import path from "node:path";

type Edit = { start: number; end: number };

/** Does some enclosing function bind `locale`? */
function localeInScope(node: ts.Node): boolean {
  const binds = (name: ts.BindingName): boolean => {
    if (ts.isIdentifier(name)) return name.text === "locale";
    return name.elements.some(
      (el) => ts.isBindingElement(el) && (binds(el.name) || (!!el.propertyName && ts.isIdentifier(el.propertyName) && el.propertyName.text === "locale" && ts.isIdentifier(el.name) && el.name.text === "locale")),
    );
  };

  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (!ts.isFunctionDeclaration(current) && !ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) continue;
    if (current.parameters.some((p) => binds(p.name))) return true;
    const body = current.body;
    if (body && ts.isBlock(body)) {
      const declared = body.statements.some(
        (s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => binds(d.name)),
      );
      if (declared) return true;
    }
  }
  return false;
}

/** The innermost enclosing function that could hold a `locale` declaration. */
function enclosingFunction(node: ts.Node): ts.FunctionLikeDeclaration | null {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      // A `.map` callback is not where a hook belongs; keep climbing to the
      // component that owns it.
      const isCallback = current.parent && ts.isCallExpression(current.parent);
      if (!isCallback && current.body && ts.isBlock(current.body)) return current as ts.FunctionLikeDeclaration;
    }
  }
  return null;
}

const files = globSync("src/**/*.{ts,tsx}").filter(
  (f) => !f.includes("/admin/") && !f.includes("__tests__") && !f.endsWith(".d.ts") && !f.startsWith("scripts/"),
);

let rewritten = 0;
const unreachable: string[] = [];

for (const file of files) {
  const original = readFileSync(file, "utf8");
  if (!original.includes('"el-GR"')) continue;

  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isClient = /^\s*["']use client["']/m.test(original);
  const edits: Edit[] = [];
  /** Offsets where a `locale` declaration must be inserted. */
  const injections = new Set<number>();

  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) && node.text === "el-GR") {
      const call = node.parent;
      const isFormatting =
        ts.isCallExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        /^toLocale(String|DateString|TimeString)$/.test(call.expression.name.text) &&
        call.arguments[0] === node;
      // `new Intl.NumberFormat("el-GR", …)` counts too.
      const isIntl =
        ts.isNewExpression(call) &&
        ts.isPropertyAccessExpression(call.expression) &&
        ts.isIdentifier(call.expression.expression) &&
        call.expression.expression.text === "Intl";

      if (isFormatting || isIntl) {
        const at = `${path.relative("src", file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
        if (localeInScope(node)) {
          edits.push({ start: node.getStart(), end: node.getEnd() });
          return;
        }

        // Nothing in scope: give the enclosing component its own locale.
        // `useLocale` in a client component, `getLocale` in a server one —
        // both read the request's locale, so neither needs a new prop threaded
        // through every call site.
        const fn = enclosingFunction(node);
        if (!fn || !fn.body || !ts.isBlock(fn.body)) {
          unreachable.push(`${at} — καμία περιβάλλουσα συνάρτηση`);
          return;
        }
        const isAsync = fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
        if (!isClient && !isAsync) {
          // A sync server function cannot await; making it async is a decision
          // about that component, not a substitution.
          unreachable.push(`${at} — σύγχρονη server συνάρτηση`);
          return;
        }
        edits.push({ start: node.getStart(), end: node.getEnd() });
        injections.add(fn.body.getStart() + 1);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (edits.length === 0) continue;

  // Substitutions and insertions together, back to front, so every offset the
  // parser reported stays valid.
  type Splice = { start: number; end: number; text: string };
  const splices: Splice[] = [
    ...edits.map((e) => ({ ...e, text: "locale" })),
    ...[...injections].map((at) => ({
      start: at,
      end: at,
      text: isClient ? "\n  const locale = useLocale();" : "\n  const locale = await getLocale();",
    })),
  ];

  let output = original;
  for (const splice of splices.sort((a, b) => b.start - a.start))
    output = output.slice(0, splice.start) + splice.text + output.slice(splice.end);

  if (injections.size > 0) {
    if (isClient && !/\buseLocale\b/.test(original))
      output = output.replace(/^(import .*\n)/m, `$1import { useLocale } from "next-intl";\n`);
    if (!isClient && !/\bgetLocale\b/.test(original))
      output = output.replace(/^(import .*\n)/m, `$1import { getLocale } from "next-intl/server";\n`);
  }

  writeFileSync(file, output);
  rewritten += edits.length;
  console.log(`  ${path.relative("src", file)} → ${edits.length}`);
}

console.log(`\n  ${rewritten} αντικαταστάθηκαν`);
if (unreachable.length) {
  console.log(`  ${unreachable.length} χωρίς locale στην εμβέλεια:`);
  for (const u of unreachable) console.log(`    ${u}`);
}
