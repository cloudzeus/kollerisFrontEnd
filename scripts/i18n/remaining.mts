import ts from "typescript";
import { readFileSync, globSync, writeFileSync } from "node:fs";
import path from "node:path";
const GREEK = /[Ͱ-Ͽἀ-῿]/;
const files = globSync("src/{app/[locale],components}/**/*.tsx").filter(f => !f.includes("/admin/") && !f.includes("components/admin"));
const out: Array<{file:string;line:number;value:string;why:string}> = [];
for (const f of files) {
  const sf = ts.createSourceFile(f, readFileSync(f,"utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const line = (p:number) => sf.getLineAndCharacterOfPosition(p).line + 1;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && GREEK.test(n.text.trim())) out.push({file:path.relative("src",f),line:line(n.getStart()),value:n.text.trim(),why:"JsxText"});
    else if (ts.isStringLiteral(n) && GREEK.test(n.text)) out.push({file:path.relative("src",f),line:line(n.getStart()),value:n.text,why:ts.SyntaxKind[n.parent.kind]});
    else if ((ts.isTemplateExpression(n)||ts.isNoSubstitutionTemplateLiteral(n)) && GREEK.test(n.getText())) out.push({file:path.relative("src",f),line:line(n.getStart()),value:n.getText().slice(0,70),why:"template"});
    ts.forEachChild(n, visit);
  };
  visit(sf);
}
writeFileSync("scripts/i18n/out/remaining.json", JSON.stringify(out,null,2));
const byFile = new Map<string,number>();
for (const o of out) byFile.set(o.file,(byFile.get(o.file)??0)+1);
console.log(`  ${out.length} απομένουν σε ${byFile.size} αρχεία`);
[...byFile].sort((a,b)=>b[1]-a[1]).slice(0,14).forEach(([f,n])=>console.log(`    ${String(n).padStart(3)}  ${f}`));
