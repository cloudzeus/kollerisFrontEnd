/**
 * Calls `refresh` once after `delayMs`; the returned function cancels it.
 * Kept apart from the component so it can be tested without a DOM.
 */
export function scheduleRefresh(refresh: () => void, delayMs: number): () => void {
  const timer = setTimeout(refresh, delayMs);
  return () => clearTimeout(timer);
}
