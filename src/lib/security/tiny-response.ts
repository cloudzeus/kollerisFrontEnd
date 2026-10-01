import { NextResponse } from "next/server";

/**
 * A response the proxy can afford to send to anyone, any number of times.
 *
 * A few hundred bytes of static HTML: no database, no React, no layout, no
 * fonts. Used for the answers given to traffic the site refuses to render —
 * unsupported filter combinations and rate-limited clients — so that saying
 * "no" costs less than the cheapest real page.
 *
 * Always `noindex` (header AND meta: a crawler that reads only one of them
 * still gets the message) and never cached by a shared cache.
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

export function tinyPage(
  status: number,
  input: {
    title: string;
    message: string;
    link?: { href: string; label: string };
    headers?: Record<string, string>;
  },
): NextResponse {
  const link = input.link
    ? `<p><a href="${escapeHtml(input.link.href)}">${escapeHtml(input.link.label)}</a></p>`
    : "";
  const body =
    `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(input.title)}</title></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem">` +
    `<h1 style="font-size:1.25rem">${escapeHtml(input.title)}</h1>` +
    `<p>${escapeHtml(input.message)}</p>${link}</body></html>`;

  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...input.headers,
    },
  });
}
