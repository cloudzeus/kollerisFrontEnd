/**
 * Every `t("…")` in the storefront, checked against the message files.
 *
 * This should have existed before the extraction ran. A missing key is not a
 * type error and not a build error — it is a red overlay on a live product
 * page, which is exactly how the sixteen missing PriceBox keys were found.
 *
 * Keys are not always literals, so the checker resolves the three shapes the
 * code actually uses rather than shrugging at anything that is not a string:
 *
 *   t("διαθέσιμο")                     → checked exactly
 *   t(open ? "hide" : "show")          → both branches checked exactly
 *   t(`topic_${value}_label`)          → checked as a family: the pattern must
 *                                        match at least one key, which catches
 *                                        the real failure (nobody wrote any of
 *                                        them) without pretending to know what
 *                                        `value` holds
 *   t(item.label)                      → every `label: "…"` in the same file
 *
 * Anything it still cannot resolve is a failure, not a note. A checker that
 * prints "6 unverifiable" and exits 0 is how the gap survived the first time.
 */
import ts from "typescript";
import { readFileSync, globSync, existsSync } from "node:fs";
import path from "node:path";

type Tree = { [k: string]: string | Tree };

export type Problem = { file: string; detail: string };

const load = (locale: string) => JSON.parse(readFileSync(`src/messages/${locale}.json`, "utf8")) as Tree;

/** The keys of one namespace, flat. */
function namespaceKeys(messages: Tree, ns: string): string[] | null {
  let node: string | Tree = messages;
  for (const part of ns.split(".")) {
    if (typeof node === "string" || !(part in node)) return null;
    node = node[part];
  }
  if (typeof node === "string") return null;
  return Object.entries(node)
    .filter(([, v]) => typeof v === "string")
    .map(([k]) => k);
}

/** A template literal as a regex over key names: `topic_${x}_label` → /^topic_.+_label$/ */
function templatePattern(node: ts.TemplateExpression): RegExp {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = [escape(node.head.text)];
  for (const span of node.templateSpans) parts.push(".+", escape(span.literal.text));
  return new RegExp(`^${parts.join("")}$`);
}

export function findProblems(): Problem[] {
  const el = load("el");
  const problems: Problem[] = [];

  const files = globSync("src/**/*.tsx").filter((f: string) => f.startsWith("src/app/") || f.startsWith("src/components/")).filter(
    (f) => !f.includes("/admin/") && !f.includes("components/admin"),
  );

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const where = path.relative("src", file);

    // The namespace this file's `t` is bound to.
    const ns = /(?:useTranslations|getTranslations)\("([^"]+)"\)/.exec(text)?.[1];
    if (!ns) continue;

    const keys = namespaceKeys(el, ns);
    if (keys === null) {
      problems.push({ file: where, detail: `το namespace «${ns}» δεν υπάρχει στο el.json` });
      continue;
    }
    const known = new Set(keys);

    /** The string elements of `const NAME = [...]` in this file. */
    const arrayElements = (name: string): string[] | null => {
      let found: string[] | null = null;
      const walk = (node: ts.Node) => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === name &&
          node.initializer
        ) {
          // `as const` wraps the array in an assertion.
          const init = ts.isAsExpression(node.initializer) ? node.initializer.expression : node.initializer;
          if (ts.isArrayLiteralExpression(init))
            found = init.elements.filter(ts.isStringLiteral).map((e) => e.text);
        }
        ts.forEachChild(node, walk);
      };
      walk(source);
      return found;
    };

    /** Every `name: "value"` in this file — how a nav list holds its keys. */
    const propertyValues = (name: string): string[] => {
      const found: string[] = [];
      const walk = (node: ts.Node) => {
        if (
          ts.isPropertyAssignment(node) &&
          ts.isIdentifier(node.name) &&
          node.name.text === name &&
          ts.isStringLiteral(node.initializer)
        ) {
          found.push(node.initializer.text);
        }
        ts.forEachChild(node, walk);
      };
      walk(source);
      return found;
    };

    const check = (key: string, via: string) => {
      if (!known.has(key)) problems.push({ file: where, detail: `${ns}.${key}${via}` });
    };

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "t" &&
        node.arguments.length > 0
      ) {
        const arg = node.arguments[0];

        if (ts.isStringLiteral(arg)) {
          check(arg.text, "");
        } else if (ts.isConditionalExpression(arg) && ts.isStringLiteral(arg.whenTrue) && ts.isStringLiteral(arg.whenFalse)) {
          check(arg.whenTrue.text, "");
          check(arg.whenFalse.text, "");
        } else if (ts.isTemplateExpression(arg)) {
          const pattern = templatePattern(arg);
          if (!keys.some((k) => pattern.test(k)))
            problems.push({ file: where, detail: `${ns}.${arg.getText()} — κανένα κλειδί δεν ταιριάζει` });
        } else if (ts.isElementAccessExpression(arg) && ts.isIdentifier(arg.expression)) {
          // `UNITS[i]` — the index is unknown, so every element must exist.
          const elements = arrayElements(arg.expression.text);
          if (elements === null || elements.length === 0)
            problems.push({ file: where, detail: `${arg.getText()} — δεν βρέθηκε ο πίνακας για έλεγχο` });
          else for (const element of elements) check(element, ` (μέσω ${arg.expression.text})`);
        } else if (ts.isPropertyAccessExpression(arg) || ts.isIdentifier(arg)) {
          // `item.label`, and the same thing destructured to a bare `label`:
          // both are answered by the `label: "…"` entries in this file.
          const name = ts.isIdentifier(arg) ? arg.text : (arg.name as ts.Identifier).text;
          const candidates = propertyValues(name);
          if (candidates.length === 0)
            problems.push({ file: where, detail: `${arg.getText()} — δεν βρέθηκαν τιμές για έλεγχο` });
          for (const candidate of candidates) check(candidate, ` (μέσω ${arg.getText()})`);
        } else {
          problems.push({ file: where, detail: `${arg.getText().slice(0, 60)} — μη επιλύσιμο κλειδί` });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  // One line per problem, not per call site: the same nav key read in two
  // places is one thing to fix.
  const seen = new Set<string>();
  return problems.filter((p) => {
    const id = `${p.file}|${p.detail}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * next-intl hooks called inside an async server component.
 *
 * `useTranslations` and `useLocale` are the synchronous API; an async component
 * must await `getTranslations` / `getLocale`. Mixing them throws "Invalid hook
 * call" at render time and is invisible to `tsc` — both are ordinary function
 * calls with the right signature. Eight of these shipped the moment six
 * components were made async to reach the request locale.
 */
export function findHookMisuse(): Problem[] {
  const problems: Problem[] = [];
  const files = globSync("src/**/*.tsx").filter((f) => !f.endsWith(".d.ts"));

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // Client components are where these hooks belong.
    if (/^\s*["']use client["']/m.test(text)) continue;
    if (!/\buse(Translations|Locale|Formatter)\b/.test(text)) continue;

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const where = path.relative("src", file);

    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^use(Translations|Locale|Formatter)$/.test(node.expression.text)
      ) {
        /*
         * Climb past callbacks to the component that owns this call.
         *
         * A `.map` callback is not a component: it runs inside its parent's
         * render, so if that parent is async the dispatcher is already null and
         * the hook throws — even though the callback itself is not async.
         * Stopping at the first enclosing function missed exactly this.
         */
        for (let current: ts.Node | undefined = node; current; current = current.parent) {
          if (
            !ts.isFunctionDeclaration(current) &&
            !ts.isArrowFunction(current) &&
            !ts.isFunctionExpression(current)
          )
            continue;
          const fn = current as ts.FunctionLikeDeclaration;
          const isCallback = fn.parent && ts.isCallExpression(fn.parent);
          if (isCallback) continue;
          if (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
            const name = ts.isFunctionDeclaration(fn) && fn.name ? fn.name.text : "(ανώνυμη)";
            const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            problems.push({
              file: where,
              detail: `${node.expression.text} σε async ${name} — χρειάζεται await get${node.expression.text.slice(3)} (γρ. ${line})`,
            });
          }
          break;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  return problems;
}

/** `@/x` to a real file on disk, or null for anything not ours. */
function resolveImport(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = path.join("src", spec.slice(2));
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

const isAdminPath = (file: string) =>
  file.includes("/admin/") || file.includes("components/admin");

/**
 * Everything `/admin` can reach, not just everything inside it.
 *
 * The path-only version of this check missed the case that keeps happening: a
 * storefront component that translates itself, imported into an admin screen
 * for a preview. `OfferWizard` renders the real `OfferWidget`, which renders
 * `OfferCountdown`, and both call `useTranslations` — two levels below any file
 * with "admin" in its name. React then reports the crash at the leaf, which is
 * the last place anyone looks for an import problem.
 *
 * So the walk starts at every admin file and follows `@/` imports.
 */
function adminReachableFiles(): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: Array<[string, string[]]> = globSync("src/**/*.{ts,tsx}")
    .filter((f) => isAdminPath(f) && !f.endsWith(".d.ts"))
    .map((f) => [f, [f]]);

  while (queue.length > 0) {
    const [file, trail] = queue.shift()!;
    if (seen.has(file)) continue;
    seen.set(file, trail);

    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/from\s+["'](@\/[^"']+)["']/g)) {
      const next = resolveImport(match[1]);
      if (next && !seen.has(next)) queue.push([next, [...trail, next]]);
    }
  }
  return seen;
}

/**
 * next-intl reachable from `/admin`.
 *
 * The back office sits outside the `[locale]` segment, so the provider is not
 * mounted and every next-intl entry point throws "the context from
 * NextIntlClientProvider was not found" at render time. It has broken four
 * features that way — banner button links, the orders table once prices took a
 * locale, and twice the offer widget preview — always because storefront code
 * was reused or a codemod treated `/admin` like the rest of the app.
 *
 * Two different faults, two different fixes:
 *
 *   admin file imports next-intl        use ADMIN_LOCALE
 *   storefront file, reached from admin wrap the preview in StorefrontPreview
 *     and add its namespace there
 */
export function findAdminIntlUse(): Problem[] {
  const problems: Problem[] = [];
  const reachable = adminReachableFiles();

  /*
   * Namespaces the preview provider already carries. A storefront component
   * reached from admin is fine as long as its namespace is mounted there, so
   * this reads the list rather than restating it — one place to add to.
   */
  const providerSource = existsSync("src/components/admin/StorefrontPreview.tsx")
    ? readFileSync("src/components/admin/StorefrontPreview.tsx", "utf8")
    : "";
  const provided = new Set(
    [...providerSource.matchAll(/PREVIEW_NAMESPACES\s*=\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/["']([^"']+)["']/g)].map((n) => n[1])),
  );

  for (const [file, trail] of reachable) {
    if (file.endsWith(".d.ts")) continue;
    // The provider is the fix, not the fault.
    if (file.endsWith("components/admin/StorefrontPreview.tsx")) continue;

    /*
     * A storefront component reached from admin is only a problem if the
     * provider does not carry what it asks for. `useTranslations("offers.X")`
     * is answered by the `offers` namespace being mounted.
     */
    if (!isAdminPath(file)) {
      const text = readFileSync(file, "utf8");
      if (!/from\s+["']next-intl/.test(text)) continue;

      /*
       * Only a call to a hook can throw. `i18n/routing.ts` and
       * `i18n/navigation.ts` import next-intl to build configuration and
       * navigation helpers; they render nothing and read no context. Flagging
       * every import instead of every call is what made the first version of
       * this check name the fix as the fault.
       */
      const namespaces = [
        ...text.matchAll(/useTranslations\s*\(\s*["']([^."']+)/g),
      ].map((m) => m[1]);
      const bare = /use(?:Translations|Locale|Formatter|Now|TimeZone)\s*\(\s*\)/.test(text);
      if (namespaces.length === 0 && !bare) continue;

      const missing = namespaces.filter((n) => !provided.has(n));
      if (missing.length === 0 && !bare) continue;
      if (bare && missing.length === 0) {
        // A hook with no namespace reads whatever the provider holds, so a
        // mounted provider is enough — it cannot be checked more precisely.
        if (provided.size > 0) continue;
      }

      problems.push({
        file: path.relative("src", file),
        detail:
          `συστατικό βιτρίνας προσβάσιμο από το /admin ζητά ${[...new Set(missing)].join(", ")} — ` +
          `μέσω ${trail.slice(0, 3).map((t) => path.relative("src", t)).join(" → ")}· ` +
          `προσθέστε το namespace στο StorefrontPreview`,
      });
      continue;
    }

    const text = readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const where = path.relative("src", file);

    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement)) continue;
      const from = (statement.moduleSpecifier as ts.StringLiteral).text;
      if (!/^next-intl/.test(from)) continue;

      const named = statement.importClause?.namedBindings;
      const names =
        named && ts.isNamedImports(named) ? named.elements.map((e) => e.name.text) : ["*"];
      // The navigation helpers are a separate, equally fatal case: a localised
      // `Link` needs the same provider.
      const line = source.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
      problems.push({
        file: where,
        detail: `εισάγει ${names.join(", ")} από «${from}» (γρ. ${line}) — το /admin δεν έχει provider· χρησιμοποιήστε ADMIN_LOCALE`,
      });
    }
  }

  return problems;
}

/**
 * Keys present in Greek but absent from another locale.
 *
 * next-intl falls back to the default locale, so this never throws — it just
 * shows an English visitor a Greek sentence, which is the failure the whole
 * translation effort was about.
 */
export function findUntranslated(locale: "en" | "it"): string[] {
  const flat = (tree: Tree, prefix = ""): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(tree)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === "string") out[key] = v;
      else Object.assign(out, flat(v, key));
    }
    return out;
  };
  const el = flat(load("el"));
  const other = flat(load(locale));
  return Object.keys(el).filter((k) => !other[k]);
}

// Run directly: `npx tsx scripts/i18n/verify.mts`
if (process.argv[1]?.endsWith("verify.ts")) {
  const problems = findProblems();
  console.log(problems.length === 0 ? "  κλειδιά: όλα βρέθηκαν" : `  προβλήματα: ${problems.length}`);
  for (const p of problems) console.log(`    ${p.detail}   (${p.file})`);

  const hooks = findHookMisuse();
  console.log(hooks.length === 0 ? "  hooks: σωστά" : `  hooks σε async components: ${hooks.length}`);
  for (const h of hooks) console.log(`    ${h.detail}   (${h.file})`);

  const admin = findAdminIntlUse();
  console.log(admin.length === 0 ? "  /admin: χωρίς next-intl" : `  next-intl στο /admin: ${admin.length}`);
  for (const a of admin) console.log(`    ${a.detail}   (${a.file})`);

  for (const locale of ["en", "it"] as const) {
    const gaps = findUntranslated(locale);
    console.log(`  ${locale}: ${gaps.length === 0 ? "πλήρες" : `${gaps.length} χωρίς μετάφραση`}`);
    for (const g of gaps.slice(0, 10)) console.log(`    ${g}`);
  }

  process.exitCode = problems.length + hooks.length + admin.length ? 1 : 0;
}
