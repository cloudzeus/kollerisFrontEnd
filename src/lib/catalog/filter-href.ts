/**
 * URL builders for the filter controls.
 *
 * Pure functions over `searchParams`, so every filter can be a plain `<a>`
 * rendered on the server. That is what lets the sidebar and toolbar carry no
 * client JavaScript at all — the browser's own navigation does the work that
 * would otherwise need `router.push` and a hydrated component.
 */

export type RawParams = Record<string, string | string[] | undefined>;

function toSearchParams(raw: RawParams): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value == null) continue;
    next.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  return next;
}

function finish(basePath: string, next: URLSearchParams): string {
  // Any filter change returns to page 1 — staying on page 7 of a result set
  // that just shrank to 2 pages is how people land on an empty grid.
  next.delete("page");
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** Toggles one value inside a comma-separated multi-select param. */
export function toggleMultiHref(
  basePath: string,
  raw: RawParams,
  key: "sub" | "brand",
  slug: string,
): string {
  const next = toSearchParams(raw);
  const current = new Set((next.get(key) ?? "").split(",").filter(Boolean));
  if (current.has(slug)) current.delete(slug);
  else current.add(slug);

  if (current.size) next.set(key, [...current].join(","));
  else next.delete(key);
  return finish(basePath, next);
}

/** Sets or clears a price band. Passing the currently active band clears it. */
export function priceHref(
  basePath: string,
  raw: RawParams,
  band: { min: number | null; max: number | null },
  active: boolean,
): string {
  const next = toSearchParams(raw);
  if (active) {
    next.delete("min");
    next.delete("max");
  } else {
    if (band.min != null) next.set("min", String(band.min));
    else next.delete("min");
    if (band.max != null) next.set("max", String(band.max));
    else next.delete("max");
  }
  return finish(basePath, next);
}

export function isPriceBandActive(
  raw: RawParams,
  band: { min: number | null; max: number | null },
): boolean {
  const min = Array.isArray(raw.min) ? raw.min[0] : raw.min;
  const max = Array.isArray(raw.max) ? raw.max[0] : raw.max;
  return (band.min == null ? !min : min === String(band.min)) &&
    (band.max == null ? !max : max === String(band.max));
}

/** Sets a single-value param, or removes it when `value` is null. */
export function setParamHref(
  basePath: string,
  raw: RawParams,
  key: string,
  value: string | null,
): string {
  const next = toSearchParams(raw);
  if (value == null) next.delete(key);
  else next.set(key, value);
  return finish(basePath, next);
}

/** Same as `setParamHref` but keeps the current page — used by density controls. */
export function setParamKeepingPage(
  basePath: string,
  raw: RawParams,
  key: string,
  value: string,
): string {
  const next = toSearchParams(raw);
  next.set(key, value);
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function clearAllHref(basePath: string): string {
  return basePath;
}
