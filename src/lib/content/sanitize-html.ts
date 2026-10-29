/**
 * Rich text from HDCtool (terms, privacy, FAQ answers), cut down to what a
 * content page needs — and nothing that can run.
 *
 * The text is written by staff in HDCtool's editor, but it is still HTML from
 * another system, printed into our pages with `dangerouslySetInnerHTML`. One
 * `onerror` or `javascript:` in there would run on the shop's origin, next to
 * the cart and the account. So this is an allowlist, not a blocklist:
 *
 *   - only the tags below survive, with NO attributes except a checked `href`;
 *   - every other tag is dropped and its text kept, except script-like tags,
 *     whose content goes too;
 *   - the output is balanced: a stray `</ul>` cannot close the page's own
 *     markup, and anything left open is closed at the end.
 *
 * Plain text (no tags at all) is turned into paragraphs, so a policy typed
 * without an editor still reads as paragraphs rather than one block.
 *
 * Pure and dependency-free, so it runs in tests and on the server alike.
 */

/** Allowed tag → the tag it is written as. Headings start at h2: the page owns h1. */
const TAGS: Record<string, string> = {
  p: "p",
  br: "br",
  hr: "hr",
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  u: "u",
  s: "s",
  sub: "sub",
  sup: "sup",
  a: "a",
  ul: "ul",
  ol: "ol",
  li: "li",
  h1: "h2",
  h2: "h2",
  h3: "h3",
  h4: "h4",
  h5: "h4",
  h6: "h4",
  blockquote: "blockquote",
  table: "table",
  thead: "thead",
  tbody: "tbody",
  tr: "tr",
  th: "th",
  td: "td",
};

const VOID = new Set(["br", "hr"]);

/** Dropped together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "template",
  "noscript",
  "svg",
  "math",
  "textarea",
  "select",
  "title",
  "head",
]);

/** `&amp;`, `&#39;`, `&#x27;` pass through; a bare `&` is escaped. */
const ENTITY = /^&(?:[a-zA-Z][a-zA-Z0-9]{1,31}|#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6});/;

function escapeText(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i]!;
    if (c === "&") {
      const m = ENTITY.exec(s.slice(i, i + 40));
      if (m) {
        out += m[0];
        i += m[0].length - 1;
      } else out += "&amp;";
    } else if (c === "<") out += "&lt;";
    else if (c === ">") out += "&gt;";
    else if (c === '"') out += "&quot;";
    else out += c;
  }
  return out;
}

function decodeAttr(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#([0-9]+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;/gi, "\t")
    .replace(/&newline;/gi, "\n")
    .replace(/&amp;/gi, "&");
}

/**
 * The link target, if it is one we are willing to print: http(s), mailto,
 * tel, a site path or an anchor. Entities and whitespace are resolved first —
 * `jav&#x61;script:` is the oldest trick there is.
 */
export function safeHref(raw: string): string | null {
  const value = decodeAttr(raw).replace(/[\u0000- \u007f]/g, "");
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (/^\/(?!\/)/.test(value) || value.startsWith("#")) return value;
  return null;
}

function hrefOf(rawTag: string): string | null {
  const m = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(` ${rawTag}`);
  const value = m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
  return value ? safeHref(value) : null;
}

/** Whole paragraphs from text that has no markup at all. */
function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeText(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function sanitizeHtml(input: string | null | undefined): string {
  const html = (input ?? "").trim();
  if (!html) return "";
  if (!/<\/?[a-zA-Z][^>]*>/.test(html)) return textToHtml(html);

  let out = "";
  const open: string[] = [];
  let dropping: string | null = null;
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      if (!dropping) out += escapeText(html.slice(i));
      break;
    }
    if (!dropping) out += escapeText(html.slice(i, lt));

    // Comments and <!DOCTYPE>/<![CDATA[ — gone, content and all.
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? html.length : end + 3;
      continue;
    }
    if (html.startsWith("<!", lt) || html.startsWith("<?", lt)) {
      const end = html.indexOf(">", lt);
      i = end === -1 ? html.length : end + 1;
      continue;
    }

    // "<" that does not open a tag is the less-than sign ("μύτες < 5mm").
    if (!/^<\/?[a-zA-Z]/.test(html.slice(lt, lt + 3))) {
      if (!dropping) out += "&lt;";
      i = lt + 1;
      continue;
    }

    const gt = html.indexOf(">", lt);
    if (gt === -1) {
      if (!dropping) out += escapeText(html.slice(lt));
      break;
    }

    const raw = html.slice(lt + 1, gt).trim();
    const closing = raw.startsWith("/");
    const name = (closing ? raw.slice(1) : raw).split(/[\s/]/)[0]!.toLowerCase();
    i = gt + 1;

    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && !raw.endsWith("/")) dropping = name;
      continue;
    }

    const tag = TAGS[name];
    if (!tag) continue; // unknown tag: dropped, its text stays

    if (VOID.has(tag)) {
      if (!closing) out += `<${tag}>`;
      continue;
    }

    if (closing) {
      // Close only what we opened; close anything opened inside it too.
      const at = open.lastIndexOf(tag);
      if (at === -1) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }

    if (tag === "a") {
      const href = hrefOf(raw);
      if (href) {
        const external = /^https?:/i.test(href);
        out += `<a href="${escapeText(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>`;
      } else out += "<a>";
    } else {
      out += `<${tag}>`;
    }
    open.push(tag);
  }

  while (open.length) out += `</${open.pop()}>`;
  return out.trim();
}

/** The visible text of sanitized HTML, whitespace collapsed — for JSON-LD and descriptions. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|h[1-6]|tr|blockquote)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the field has something to read once the markup is gone. */
export function hasText(html: string | null | undefined): boolean {
  return htmlToText(sanitizeHtml(html)).length > 0;
}
