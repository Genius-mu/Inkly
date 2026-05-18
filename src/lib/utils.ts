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

const PRESENCE_COLORS = [
  "#c75a3a",
  "#3a7a5e",
  "#7a5ec7",
  "#c79a3a",
  "#3a7ac7",
  "#c73a7a",
  "#5e7a3a",
  "#c73a3a",
];

export function pickPresenceColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return PRESENCE_COLORS[Math.abs(hash) % PRESENCE_COLORS.length];
}
