/**
 * Pixels per module for a raster of `modules` × `modules`.
 * - `scale` given: used as is.
 * - `size` given: the largest whole scale that fits (`undefined` when even 1 px per module does not fit).
 * - neither: `defaultScale`.
 */
export function rasterScale(
  modules: number,
  scale: number | undefined,
  size: number | undefined,
  defaultScale: number,
): number | undefined {
  if (scale !== undefined) return scale;
  if (size !== undefined) return size < modules ? undefined : Math.floor(size / modules);
  return defaultScale;
}
