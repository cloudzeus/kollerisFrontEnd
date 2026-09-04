#!/usr/bin/env node
/**
 * Kolleris Email System — build
 *
 *  src/layout.html            σκελετός (head, stripe, header, content, footer)
 *  src/partials/*.html        build-time partials  →  {{> name param="value"}}
 *  src/styles.json            style macros          →  style="$h1$"
 *  src/templates/**\/*.html   περιεχόμενο κάθε email (runtime Handlebars: {{var}}, {{#each}}, {{#if}})
 *  src/samples/<id>.json      δείγμα δεδομένων για preview
 *  src/manifest.json          μεταδεδομένα (subject, preheader, footer mode, μεταβλητές)
 *
 *  dist/mailgun/<id>.html     flattened Handlebars template  → upload στο Mailgun (Templates API)
 *  dist/preview/<id>.html     rendered με sample data          → άνοιγμα στον browser / Litmus / screenshots
 *  dist/preview/index.html    gallery
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

/*
 * Πού διαβάζει η ΕΦΑΡΜΟΓΗ τα έτοιμα templates.
 * ─────────────────────────────────────────────────────────────────────────────
 * Το `src/lib/mail/templates.ts` φορτώνει από το `src/emails/templates/`. Μέχρι
 * τώρα το build έγραφε στο `dist/` και κάποιος αντέγραφε με το χέρι — και τα
 * δύο απέκλιναν σιωπηλά: τρία αρχεία στο κατάστημα είχαν αλλαγές που δεν
 * υπήρχαν στην πηγή, και θα χάνονταν στο πρώτο build.
 *
 * Το build γράφει και στα δύο. Το `dist/` μένει για τη γκαλερί προεπισκόπησης
 * και για το ανέβασμα στο Mailgun· το `src/emails/` είναι αυτό που φεύγει στην
 * παραγωγή και γι' αυτό μπαίνει στο git.
 */
const APP_TEMPLATES = path.join(ROOT, "..", "src", "emails", "templates");
const APP_MANIFEST = path.join(ROOT, "..", "src", "emails", "manifest.json");
const ASSETS_MAILGUN = process.env.ASSETS_URL || "https://web.kolleris.com/email-assets";
const ASSETS_PREVIEW = "../../assets";

const styles = JSON.parse(fs.readFileSync(path.join(SRC, "styles.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, "manifest.json"), "utf8"));
const layout = fs.readFileSync(path.join(SRC, "layout.html"), "utf8");
const partials = Object.fromEntries(
  fs.readdirSync(path.join(SRC, "partials")).filter(f => f.endsWith(".html"))
    .map(f => [f.replace(/\.html$/, ""), fs.readFileSync(path.join(SRC, "partials", f), "utf8").trim()])
);

const STATE_COLORS = { "@done@": "#1F1F1F", "@active@": "#EA3E39", "@todo@": "#BDBDBE" };

/* ---------- build-time partial resolver ---------- */
const PARTIAL_RE = /\{\{>\s*([\w-]+)((?:\s+[\w-]+="(?:[^"\\]|\\.)*")*)\s*\}\}/g;
const PARAM_RE = /([\w-]+)="((?:[^"\\]|\\.)*)"/g;

function resolvePartials(html, depth = 0) {
  if (depth > 12) throw new Error("Partial recursion too deep");
  return html.replace(PARTIAL_RE, (m, name, paramStr) => {
    const src = partials[name];
    if (src === undefined) throw new Error(`Unknown partial: ${name}`);
    const params = {};
    for (const [, k, v] of paramStr.matchAll(PARAM_RE)) params[k] = v.replace(/\\"/g, '"');
    let out = src.replace(/\$([\w-]+)\$/g, (mm, key) => (key in params ? params[key] : mm));
    return resolvePartials(out, depth + 1);
  });
}

function applyStyles(html, id) {
  html = html.replace(/\$([\w-]+)\$/g, (m, key) => {
    if (key in styles) return styles[key];
    return ""; // unresolved partial params (e.g. optional $align$) → empty
  });
  for (const [k, v] of Object.entries(STATE_COLORS)) html = html.split(k).join(v);
  return html;
}

function assemble(id, meta) {
  const bodyFile = path.join(SRC, "templates", meta.category, `${id}.html`);
  const body = fs.readFileSync(bodyFile, "utf8");
  let html = layout
    .replace("$header$", partials.header)
    .replace("$footer$", meta.footer === "marketing" ? partials["footer-marketing"] : partials["footer-transactional"])
    .replace("$body_content$", body)
    .replace("$title$", meta.title || meta.subject)
    .replace("$preheader$", "{{preheader}}");
  html = resolvePartials(html);
  html = applyStyles(html, id);
  return html;
}

/* ---------- output ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, "mailgun"), { recursive: true });
fs.mkdirSync(path.join(DIST, "preview"), { recursive: true });
fs.mkdirSync(APP_TEMPLATES, { recursive: true });
/* Το manifest το διαβάζει ο επεξεργαστής καμπανιών — μία πηγή, δύο αντίγραφα. */
fs.copyFileSync(path.join(SRC, "manifest.json"), APP_MANIFEST);

const common = JSON.parse(fs.readFileSync(path.join(SRC, "samples", "_common.json"), "utf8"));
const gallery = [];

for (const [id, meta] of Object.entries(manifest.templates)) {
  const flat = assemble(id, meta);

  // 1) Mailgun template (raw handlebars, absolute asset URLs)
  const mg = flat.split("@@ASSETS@@").join(ASSETS_MAILGUN);
  fs.writeFileSync(path.join(DIST, "mailgun", `${id}.html`), mg);
  fs.writeFileSync(path.join(APP_TEMPLATES, `${id}.html`), mg);

  // 2) Preview (rendered with sample data)
  const samplePath = path.join(SRC, "samples", `${id}.json`);
  const sample = fs.existsSync(samplePath) ? JSON.parse(fs.readFileSync(samplePath, "utf8")) : {};
  const data = { ...common, ...sample, preheader: meta.preheader };
  let previewSrc = flat.split("@@ASSETS@@").join(ASSETS_PREVIEW)
    .replace(/%unsubscribe_url%/g, "#unsubscribe")
    .replace(/%recipient\.(\w+)%/g, (m, k) => data.recipient?.[k] ?? m);
  // Mailgun recipient-variables in subject/preheader are left as-is in the template; preview uses sample.
  const tpl = Handlebars.compile(previewSrc, { noEscape: false, strict: false });
  const rendered = tpl(data);
  fs.writeFileSync(path.join(DIST, "preview", `${id}.html`), rendered);

  // 3) Variables file for Mailgun (what the backend must send as h:X-Mailgun-Variables)
  fs.writeFileSync(path.join(DIST, "mailgun", `${id}.variables.json`), JSON.stringify(data, null, 2));

  gallery.push({ id, ...meta, size: Buffer.byteLength(mg, "utf8") });
  const warn = (mg.match(/\{\{>\s/g) || []).length;
  if (warn) console.warn(`  ! ${id}: unresolved partial syntax remains`);
  console.log(`✓ ${id.padEnd(28)} ${(Buffer.byteLength(mg) / 1024).toFixed(1).padStart(6)} KB`);
}

/* ---------- gallery ---------- */
const cats = manifest.categories;
const galleryHtml = `<!DOCTYPE html><html lang="el"><head><meta charset="utf-8"><title>Kolleris Email System — Gallery</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#EFEFEF;font-family:Inter,Arial,sans-serif;color:#1F1F1F}
header{background:#fff;border-bottom:1px solid #D8D8D8;padding:24px 40px;display:flex;align-items:center;gap:24px;border-top:4px solid #EA3E39}
header h1{font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0}
header .mono{font-family:'JetBrains Mono',monospace;font-size:11px;color:#5F6061;letter-spacing:.08em;text-transform:uppercase}
main{padding:32px 40px 80px;max-width:1500px;margin:0 auto}
h2{font-size:24px;font-weight:900;text-transform:uppercase;letter-spacing:-.02em;margin:40px 0 4px}
h2 small{font-family:'JetBrains Mono',monospace;font-size:10px;font-weight:600;color:#C42A26;letter-spacing:.08em;display:block;margin-bottom:6px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;margin-top:20px}
.card{background:#fff;border:1px solid #D8D8D8;display:flex;flex-direction:column}
.card:hover{border-color:#1F1F1F}
.card iframe{width:100%;height:360px;border:0;pointer-events:none;background:#EFEFEF}
.card .frame{overflow:hidden;height:360px;border-bottom:1px solid #D8D8D8}
.card .frame iframe{width:600px;height:1200px;transform:scale(.5);transform-origin:0 0}
.card .meta{padding:16px 20px}
.card .id{font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#5F6061}
.card .name{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:6px 0}
.card .subj{font-size:13px;color:#5F6061;line-height:18px}
.card a.btn{display:inline-block;margin-top:12px;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#C42A26;text-decoration:none}
</style></head><body>
<header><img src="../../assets/logo-horizontal@2x.png" width="160" alt="Kolleris"><h1>Email System v1.0</h1><span class="mono">${gallery.length} templates · Mailgun · Design System 1.0</span></header>
<main>
${Object.entries(cats).map(([cid, c]) => `
<h2><small>${c.eyebrow}</small>${c.title}</h2>
<p style="color:#5F6061;font-size:14px;max-width:70ch;margin:0">${c.description}</p>
<div class="grid">
${gallery.filter(g => g.category === cid).map(g => `
<div class="card"><div class="frame"><iframe src="${g.id}.html" loading="lazy" title="${g.id}"></iframe></div>
<div class="meta"><div class="id">${g.id} · ${(g.size / 1024).toFixed(0)} KB</div><div class="name">${g.name}</div><div class="subj">${g.subject}</div>
<a class="btn" href="${g.id}.html" target="_blank">Άνοιγμα →</a></div></div>`).join("")}
</div>`).join("")}
</main></body></html>`;
fs.writeFileSync(path.join(DIST, "preview", "index.html"), galleryHtml);
console.log(`\n${gallery.length} templates → dist/mailgun, dist/preview`);
