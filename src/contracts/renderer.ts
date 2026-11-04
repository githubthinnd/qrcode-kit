import type { QRMatrix } from '../domain/matrix.js';
import type { MaybePromise, ProviderBase, Rgba } from './common.js';

/** Resolved, validated render options. */
export interface RenderOptions {
  /** Quiet zone width in modules. */
  readonly quietZone: number;
  /** Pixels per module. `undefined` = renderer default (SVG: omit fixed size). */
  readonly scale: number | undefined;
  /** Total output edge in pixels, when requested. Mutually exclusive with `scale`. */
  readonly size: number | undefined;
  readonly dark: Rgba;
  readonly light: Rgba;
  /** Swap dark and light. */
  readonly invert: boolean;
  /** Upper bound on raster area (width × height) the kit allows. */
  readonly maxPixels: number;
}

export interface SvgOutput {
  readonly kind: 'svg';
  readonly markup: string;
  /** Edge length in modules including the quiet zone. */
  readonly modules: number;
  readonly width: number | undefined;
  readonly height: number | undefined;
}

/** Two-tone raster: one byte per pixel, 0 = light, 1 = dark. */
export interface BitmapOutput {
  readonly kind: 'bitmap';
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly dark: Rgba;
  readonly light: Rgba;
}

export interface TextOutput {
  readonly kind: 'text';
  readonly text: string;
  readonly columns: number;
  readonly rows: number;
}

/** A drawing surface supplied by a browser renderer (structurally typed: no DOM dependency). */
export interface CanvasOutput {
  readonly kind: 'canvas';
  readonly canvas: unknown;
  readonly width: number;
  readonly height: number;
}

/** Open for extension: provider packages may add kinds through declaration merging. */
export interface RenderedOutputMap {
  svg: SvgOutput;
  bitmap: BitmapOutput;
  text: TextOutput;
  canvas: CanvasOutput;
}

export type RenderedKind = keyof RenderedOutputMap;
export type RenderedOutput = RenderedOutputMap[RenderedKind];

export interface RendererCapabilities {
  readonly produces: RenderedKind;
  /** Can render colours with alpha < 255. */
  readonly transparency: boolean;
  /** Honours `dark` / `light` colours (false: monochrome medium such as text). */
  readonly colors: boolean;
  readonly gradients: boolean;
  readonly moduleShapes: readonly 'square'[];
  readonly logo: boolean;
  /** Largest output edge in pixels this renderer supports, if limited. */
  readonly maxPixels: number | undefined;
  readonly sync: boolean;
}

/** Converts a matrix into a drawable representation. Must not depend on how the matrix was encoded. */
export interface RendererProvider extends ProviderBase<RendererCapabilities> {
  render(matrix: QRMatrix, options: RenderOptions): MaybePromise<RenderedOutput>;
}
