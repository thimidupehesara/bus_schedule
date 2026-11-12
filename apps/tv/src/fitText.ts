import { TEXT_MIN_SCALE } from './config.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pure scaling helper (no DOM, no React — importable by unit tests).
// ─────────────────────────────────────────────────────────────────────────────

export interface FitResult {
  /** CSS font-size multiplier, clamped to [minScale, 1]. */
  scale: number;
  /** True when even at minimum scale the text is still wider than the box. */
  truncate: boolean;
}

/**
 * Given a scroll width and a client (box) width, compute how much to scale the
 * font down and whether to show an ellipsis.
 *
 * @param scrollWidth  – element.scrollWidth (natural text width at current font)
 * @param clientWidth  – element.clientWidth (available box width)
 * @param minScale     – floor scale factor, e.g. 0.65
 */
export function computeFit(
  scrollWidth: number,
  clientWidth: number,
  minScale: number,
): FitResult {
  if (scrollWidth <= clientWidth || clientWidth === 0) {
    return { scale: 1, truncate: false };
  }
  // Scale = how much we need to shrink to fit naturally.
  const ideal = (clientWidth - 1) / scrollWidth;
  const scale = Math.max(minScale, ideal);
  const truncate = ideal < minScale;
  return { scale, truncate };
}

export { TEXT_MIN_SCALE };
