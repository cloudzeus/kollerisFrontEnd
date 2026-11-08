// Prints the --fs-* tokens for every small font size used by the storefront.
// Rerun and paste into globals.css (:root) when a new size appears.
// Sizes up to 15px are +1px on a 360px phone, identical from 1280px up.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const sizes = new Set();
for (const file of walk("src")) {
  if (!/\.(tsx|css)$/.test(file) || /admin/.test(file)) continue;
  for (const [, size] of readFileSync(file, "utf8").matchAll(/var\(--fs-([\d-]+)\)/g))
    sizes.add(Number(size.replace("-", ".")));
}

const rem = (px) => `${+(px / 16).toFixed(4)}rem`;
for (const d of [...sizes].sort((a, b) => a - b)) {
  const m = d + 1;
  const slope = (d - m) / 920;
  const intercept = m - slope * 360;
  console.log(
    `  --fs-${String(d).replace(".", "-")}: clamp(${rem(d)}, ${rem(intercept)} - ${+(-slope * 100).toFixed(4)}vw, ${rem(m)});`,
  );
}
