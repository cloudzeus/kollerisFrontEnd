import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_NAMESPACES, pickClientMessages } from "@/i18n/client-namespaces";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== "__tests__" && name !== "generated") walk(path, out);
    } else if (/\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function resolve(spec: string, from: string): string | null {
  const base = spec.startsWith("@/") ? join("src", spec.slice(2)) : spec.startsWith(".") ? normalize(join(dirname(from), spec)) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext) && statSync(base + ext).isFile()) return base + ext;
  }
  return null;
}

const IMPORT = /(?:import|export)\s+(?!type\b)[^;'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
const USE_CLIENT = /^\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*['"]use client['"]/;

describe("client translations", () => {
  it("every namespace reachable from a client component is sent to the browser", () => {
    const files = walk("src");
    const seen = new Set(files.filter((f) => USE_CLIENT.test(readFileSync(f, "utf8"))));
    const queue = [...seen];
    while (queue.length) {
      const file = queue.pop()!;
      for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
        const dep = resolve(m[1] ?? m[2] ?? m[3], file);
        if (dep && !seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
      }
    }
    const used = new Set<string>();
    for (const file of seen) {
      if (file.includes("src/app/admin") || file === normalize("src/lib/admin/locale.ts")) continue;
      for (const m of readFileSync(file, "utf8").matchAll(/useTranslations\(\s*(?:["']([^"']+)["'])?\s*\)/g)) {
        expect(m[1], `${file} calls useTranslations without a namespace`).toBeTruthy();
        used.add(m[1]);
      }
    }
    expect([...used].filter((ns) => !CLIENT_NAMESPACES.includes(ns))).toEqual([]);
  });

  it("picks nested namespaces and nothing else", () => {
    const [dotted] = CLIENT_NAMESPACES.filter((ns) => ns.includes("."));
    const [top, leaf] = dotted.split(".");
    const picked = pickClientMessages({ [top]: { [leaf]: { a: "1" }, other: { b: "2" } }, serverOnly: { d: "4" } });
    expect(picked).toEqual({ [top]: { [leaf]: { a: "1" } } });
  });
});
