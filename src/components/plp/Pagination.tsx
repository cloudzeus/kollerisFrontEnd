import { Link } from "@/i18n/navigation";
import { upGreek } from "@/lib/greek";

/**
 * Server-rendered pagination: real `<a>` elements, so pages are crawlable and
 * work without JavaScript. Client-side page state would cost both.
 */
export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
}) {
  if (totalPages <= 1) return null;

  const href = (target: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (key === "page" || value == null) continue;
      next.set(key, Array.isArray(value) ? value.join(",") : value);
    }
    if (target > 1) next.set("page", String(target));
    const query = next.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  // Window of pages around the current one, with ellipses — 200 numbered links
  // is not navigation.
  const window = new Set<number>([1, totalPages, page]);
  for (let offset = 1; offset <= 2; offset++) {
    if (page - offset > 1) window.add(page - offset);
    if (page + offset < totalPages) window.add(page + offset);
  }
  const pages = [...window].sort((a, b) => a - b);

  return (
    <nav aria-label="Σελιδοποίηση" className="mt-8 flex items-center justify-center gap-1.5">
      {page > 1 && (
        <Link
          href={href(page - 1)}
          rel="prev"
          className="t-card-cta flex h-10 items-center border border-k-line-2 px-3 text-k-ink transition-colors hover:border-k-ink"
        >
          ‹ {upGreek("Προηγούμενη")}
        </Link>
      )}

      {pages.map((target, i) => (
        <span key={target} className="flex items-center gap-1.5">
          {i > 0 && pages[i - 1] !== target - 1 && (
            <span className="px-1 text-k-text-5">…</span>
          )}
          <Link
            href={href(target)}
            aria-current={target === page ? "page" : undefined}
            className={`t-card-cta flex h-10 min-w-10 items-center justify-center border px-2 transition-colors ${
              target === page
                ? "border-k-ink bg-k-ink text-white"
                : "border-k-line-2 text-k-ink hover:border-k-ink"
            }`}
          >
            {target}
          </Link>
        </span>
      ))}

      {page < totalPages && (
        <Link
          href={href(page + 1)}
          rel="next"
          className="t-card-cta flex h-10 items-center border border-k-line-2 px-3 text-k-ink transition-colors hover:border-k-ink"
        >
          {upGreek("Επόμενη")} ›
        </Link>
      )}
    </nav>
  );
}
