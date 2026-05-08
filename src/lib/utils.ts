/**
 * Inkly — small utilities. Kept dependency-free intentionally.
 */

/**
 * Compact, sortable, sufficient-for-our-needs id.
 *
 * Why not crypto.randomUUID()? It works, but produces 36-char strings
 * with hyphens. This produces ~14-char base36 strings that are easier
 * to log, debug, and inspect — and the timestamp prefix makes them
 * naturally sort by creation time.
 */
export function uid(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 6)
  );
}
