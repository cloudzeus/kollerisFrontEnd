import ts from "typescript";
import { readFileSync, globSync } from "node:fs";
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const files = globSync("src/{app/[locale],components}/**/*.tsx").filter(f => !f.includes("/admin/") && !f.includes("components/admin"));
let text=0, attr=0, other=0, template=0;
const buckets = new Map<string, number>();
for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f,"utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && GREEK.test(n.text.trim())) text++;
    else if (ts.isStringLiteral(n) && GREEK.test(n.text)) {
      const p = n.parent;
      if (ts.isJsxAttribute(p) || (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent))) attr++;
      else { other++; buckets.set(ts.SyntaxKind[p.kind], (buckets.get(ts.SyntaxKind[p.kind]) ?? 0) + 1); }
    }
    else if ((ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n)) && GREEK.test(n.getText())) template++;
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
console.log(`  JSX κείμενο:        ${text}`);
console.log(`  JSX attributes:     ${attr}`);
console.log(`  άλλα string literals: ${other}`);
console.log(`  template literals:  ${template}`);
console.log(`  ── σύνολο: ${text+attr+other+template}`);
console.log("  πού ζουν τα «άλλα»:");
[...buckets].sort((a,b)=>b[1]-a[1]).slice(0,8).forEach(([k,v])=>console.log(`      ${String(v).padStart(4)}  ${k}`));
