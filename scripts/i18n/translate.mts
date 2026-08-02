/**
 * Translate the Greek message file into the other two.
 *
 * Structure-preserving: the same tree comes back with the same keys, so a key
 * added later shows up as missing rather than silently absent. Only keys that
 * are absent or still identical to the Greek are sent — rerunning is cheap and
 * never re-pays for work already done.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { translateBatch } from "../../src/lib/ai/deepseek";

type Tree = { [k: string]: string | Tree };

const flatten = (tree: Tree, prefix = ""): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
};

const setPath = (tree: Tree, key: string, value: string) => {
  const parts = key.split(".");
  let node = tree;
  for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Tree;
  node[parts.at(-1)!] = value;
};

const el = JSON.parse(readFileSync("src/messages/el.json", "utf8")) as Tree;
const flatEl = flatten(el);
const locale = process.env.LOC as "en" | "it";

const target = JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as Tree;
const flatTarget = flatten(target);

const pending = Object.entries(flatEl).filter(([k, v]) => {
  const current = flatTarget[k];
  return v.trim() && (!current?.trim() || current.trim() === v.trim());
});

console.log(`  ${locale}: ${pending.length} προς μετάφραση από ${Object.keys(flatEl).length}`);

const BATCH = 40;
for (let i = 0; i < pending.length; i += BATCH) {
  const slice = pending.slice(i, i + BATCH);
  const result = await translateBatch({
    texts: slice.map(([, v]) => v),
    from: "el",
    to: locale,
    context: "κείμενα διεπαφής e-shop: κουμπιά, ετικέτες, μηνύματα. Σύντομα και ουδέτερα",
  });
  slice.forEach(([key], index) => setPath(target, key, result[index]));
  writeFileSync(`src/messages/${locale}.json`, JSON.stringify(target, null, 2) + "\n");
  console.log(`    ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
}
