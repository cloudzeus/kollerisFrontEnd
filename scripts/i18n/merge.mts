/**
 * Fold the extracted keys into the Greek message file.
 *
 * The namespaces are dotted — `pdp.PriceBox` — because that is what
 * `useTranslations` was handed; next-intl reads them as nested objects, so they
 * are nested here rather than left as literal dotted keys.
 *
 * Existing entries win. The file already held a handful of hand-written keys
 * and an extractor should never overwrite a human.
 */
import { readFileSync, writeFileSync } from "node:fs";

const extracted: Record<string, Record<string, string>> = JSON.parse(
  readFileSync("scripts/i18n/out/extracted.json", "utf8"),
);
const el = JSON.parse(readFileSync("src/messages/el.json", "utf8"));

let added = 0;
for (const [namespace, messages] of Object.entries(extracted)) {
  let node = el;
  for (const part of namespace.split(".")) node = node[part] ??= {};
  for (const [key, value] of Object.entries(messages)) {
    if (node[key] === undefined) { node[key] = value; added++; }
  }
}

writeFileSync("src/messages/el.json", JSON.stringify(el, null, 2) + "\n");
const count = (o: unknown): number =>
  typeof o === "object" && o ? Object.values(o as object).reduce((n: number, v) => n + count(v), 0) : 1;
console.log(`  +${added} κλειδιά · σύνολο ${count(el)}`);
