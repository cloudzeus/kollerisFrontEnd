#!/usr/bin/env node
/**
 * Upload / update όλων των templates στο Mailgun (Templates API, engine handlebars).
 *
 *   MAILGUN_API_KEY=key-xxx MAILGUN_DOMAIN=mail.kolleris.com node mailgun/upload-templates.mjs [--only order-confirmation,nl-offers] [--tag v1.0] [--eu]
 *
 * - Αν το template δεν υπάρχει → POST /v3/{domain}/templates (δημιουργία + πρώτη version)
 * - Αν υπάρχει → POST /v3/{domain}/templates/{name}/versions (νέα version, active=yes)
 * - Τα marketing templates ανεβαίνουν στο MAILGUN_DOMAIN_MARKETING αν οριστεί (π.χ. news.kolleris.com)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "src/manifest.json"), "utf8"));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const KEY = process.env.MAILGUN_API_KEY, DOMAIN = process.env.MAILGUN_DOMAIN, DOMAIN_MK = process.env.MAILGUN_DOMAIN_MARKETING || DOMAIN;
if (!KEY || !DOMAIN) { console.error("MAILGUN_API_KEY και MAILGUN_DOMAIN απαιτούνται"); process.exit(1); }
const BASE = args.includes("--eu") ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
const TAG = opt("--tag", "v" + Date.now());
const only = opt("--only", "")?.split(",").filter(Boolean);
const auth = "Basic " + Buffer.from("api:" + KEY).toString("base64");

async function api(method, url, form) {
  const res = await fetch(BASE + url, { method, headers: { Authorization: auth }, body: form });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

for (const [id, meta] of Object.entries(manifest.templates)) {
  if (only.length && !only.includes(id)) continue;
  const domain = meta.footer === "marketing" ? DOMAIN_MK : DOMAIN;
  const html = fs.readFileSync(path.join(ROOT, "dist/mailgun", `${id}.html`), "utf8");
  const exists = (await api("GET", `/v3/${domain}/templates/${id}`)).ok;
  const form = new FormData();
  form.set("template", html);
  form.set("engine", "handlebars");
  form.set("tag", TAG);
  form.set("active", "yes");
  form.set("comment", `${meta.name} — ${meta.subject}`);
  let r;
  if (exists) r = await api("POST", `/v3/${domain}/templates/${id}/versions`, form);
  else { form.set("name", id); form.set("description", meta.name); r = await api("POST", `/v3/${domain}/templates`, form); }
  console.log(`${r.ok ? "✓" : "✗"} ${id.padEnd(26)} ${domain}  ${exists ? "new version" : "created"} ${TAG}${r.ok ? "" : "  " + JSON.stringify(r.json)}`);
}
