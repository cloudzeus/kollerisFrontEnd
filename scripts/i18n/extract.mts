/**
 * Find every Greek string a visitor can actually read.
 *
 * The earlier 3,375 came from a regex over raw file text, which counted
 * comments, class names and code. This walks the syntax tree instead and keeps
 * only what renders: JSX text, and the handful of attributes that reach the
 * screen or a screen reader.
 */
import ts from "typescript";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";

const GREEK = /[Ͱ-Ͽἀ-῿]/;
const VISIBLE_ATTRS = new Set(["placeholder", "aria-label", "title", "alt", "label", "aria-description"]);

export type Found = {
  file: string;
  kind: "text" | "attr" | "const";
  attr?: string;
  value: string;
  start: number;
  end: number;
};

export function scan(file: string): Found[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: Found[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const value = node.text.trim();
      if (GREEK.test(value)) {
        found.push({ file, kind: "text", value, start: node.getStart(), end: node.getEnd() });
      }
    }

    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText();
      if (VISIBLE_ATTRS.has(name)) {
        const init = node.initializer;
        const literal = ts.isStringLiteral(init)
          ? init
          : ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)
            ? init.expression
            : null;
        if (literal && GREEK.test(literal.text)) {
          found.push({ file, kind: "attr", attr: name, value: literal.text, start: literal.getStart(), end: literal.getEnd() });
        }
      }
    }

    // String literals inside a JSX expression container: {"…"} and ternaries.
    if (ts.isStringLiteral(node) && GREEK.test(node.text)) {
      const parent = node.parent;
      const inJsx =
        ts.isJsxExpression(parent) ||
        (ts.isConditionalExpression(parent) && ts.isJsxExpression(parent.parent));
      if (inJsx) {
        found.push({ file, kind: "text", value: node.text, start: node.getStart(), end: node.getEnd() });
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

if (process.argv[1]?.endsWith("extract.mts")) {
  const files = globSync("src/**/*.tsx").filter((f: string) => f.startsWith("src/app/") || f.startsWith("src/components/")).filter(
    (f) => !f.includes("/admin/") && !f.includes("components/admin"),
  );
  let total = 0;
  const perFile: Array<[number, string]> = [];
  for (const f of files) {
    const hits = scan(f);
    if (hits.length) { total += hits.length; perFile.push([hits.length, f]); }
  }
  perFile.sort((a, b) => b[0] - a[0]);
  console.log(`  ${total} ορατά κείμενα σε ${perFile.length} αρχεία`);
  for (const [n, f] of perFile.slice(0, 12)) console.log(`    ${String(n).padStart(4)}  ${path.relative("src", f)}`);
}
