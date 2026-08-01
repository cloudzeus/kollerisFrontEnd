/**
 * What a resolved cell hands to the renderer.
 *
 * Split from `resolve.ts` because that module is `server-only` and the editor
 * canvas — a client component — renders the very same composition component.
 * Types and pure string work live here; the queries stay on the server.
 */

export type ResolvedCell = {
  /** `{title}` → "ΚΛΕΙΔΙ ΡΑΤΣΕΤΑΣ…", `{image}` → the bound picture's URL. */
  tokens: Record<string, string>;
  /** Where the cell links. Derived for bound cells, typed for unbound ones. */
  href: string;
  /** The bound entity's own picture, for seeding a background or a layer. */
  image: string;
  /** The products of a set binding, in the order they were chosen. */
  items?: Array<{ slug: string; name: string; image: string; price: string }>;
};

/**
 * Substitute `{token}`s in a piece of authored text.
 *
 * Unknown tokens are left alone rather than blanked: `{title}` in a cell nobody
 * has bound yet should look like a mistake in the editor, not like text that
 * silently vanished on the live page. A token that resolves to nothing — a
 * product with no compare price — does blank, because that is a real answer.
 */
export function applyTokens(text: string, tokens: Record<string, string>): string {
  if (!text.includes("{")) return text;
  return text.replace(/\{[a-z]+\}/gi, (match) => tokens[match] ?? match);
}
