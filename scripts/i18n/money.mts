/**
 * Pass the reader's locale to every price formatter.
 *
 * `formatMoney` and friends now take a required `locale`, so this inserts it at
 * the right argument position and — where nothing is in scope — gives the
 * enclosing component its own (`useLocale` in a client component, `getLocale`
 * in a server one).
 *
 * The position matters: `formatPrice(net, locale, ctx)` keeps the optional
 * price context last, so an existing `{ vatRate }` argument slides right rather
 * than being read as a locale.
 */
import ts from "typescript";
import { readFileSync, writeFileSync, globSync } from "node:fs";
import path from "node:path";

/** Which argument index the locale goes in, per function. */
const AT: Record<string, number> = {
  formatMoney: 1,
  formatPrice: 1,
  formatNet: 1,
  savingsOf: 2,
};

function localeInScope(node: ts.Node): boolean {
  const binds = (name: ts.BindingName): boolean =>
    ts.isIdentifier(name)
      ? name.text === "locale"
      : name.elements.some((el) => ts.isBindingElement(el) && binds(el.name));

  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (!ts.isFunctionDeclaration(current) && !ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) continue;
    if (current.parameters.some((p) => binds(p.name))) return true;
    if (current.body && ts.isBlock(current.body)) {
      const declared = current.body.statements.some(
        (s) => ts.isVariableStatement(s) && s.declarationList.declarations.some((d) => binds(d.name)),
      );
      if (declared) return true;
    }
  }
  return false;
}

/** The component that owns this call — never a callback passed to another. */
function owningComponent(node: ts.Node): ts.FunctionLikeDeclaration | null {
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const isCallback = current.parent && ts.isCallExpression(current.parent);
      if (!isCallback && current.body && ts.isBlock(current.body)) return current as ts.FunctionLikeDeclaration;
    }
  }
  return null;
}

const files = globSync("src/**/*.{ts,tsx}").filter(
  (f) => !f.endsWith("src/lib/format.ts") && !f.endsWith(".d.ts"),
);

let inserted = 0;
const unreachable: string[] = [];

for (const file of files) {
  const original = readFileSync(file, "utf8");
  if (!/\b(formatMoney|formatPrice|formatNet|savingsOf)\s*\(/.test(original)) continue;

  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const isClient = /^\s*["']use client["']/m.test(original);
  const splices: Array<{ start: number; end: number; text: string }> = [];
  const injections = new Set<number>();

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text in AT) {
      const index = AT[node.expression.text];
      const at = `${path.relative("src", file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

      // Already passed — a hand-edited call, or a second run.
      const existing = node.arguments[index];
      const done = existing && existing.getText() === "locale";

      if (!done) {
        if (!localeInScope(node)) {
          const fn = owningComponent(node);
          const isAsync = fn?.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
          if (!fn || !fn.body || !ts.isBlock(fn.body) || (!isClient && !isAsync)) {
            unreachable.push(at);
            ts.forEachChild(node, visit);
            return;
          }
          injections.add(fn.body.getStart() + 1);
        }

        if (node.arguments.length > index) {
          // Push the existing argument right.
          splices.push({ start: node.arguments[index].getStart(), end: node.arguments[index].getStart(), text: "locale, " });
        } else {
          // Append after the last argument.
          const last = node.arguments[node.arguments.length - 1];
          splices.push({ start: last.getEnd(), end: last.getEnd(), text: ", locale" });
        }
        inserted++;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (splices.length === 0 && injections.size === 0) continue;

  for (const offset of injections)
    splices.push({
      start: offset,
      end: offset,
      text: isClient ? "\n  const locale = useLocale();" : "\n  const locale = await getLocale();",
    });

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
  console.log(`  ${path.relative("src", file)} → ${splices.length - injections.size}`);
}

console.log(`\n  ${inserted} κλήσεις`);
if (unreachable.length) {
  console.log(`  ${unreachable.length} χωρίς locale:`);
  for (const u of unreachable) console.log(`    ${u}`);
}
