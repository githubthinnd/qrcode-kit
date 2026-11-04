import type { Rgba } from '../contracts/common.js';
import { InvalidInputError } from '../domain/errors.js';

const NAMED: Readonly<Record<string, Rgba>> = {
  black: { r: 0, g: 0, b: 0, a: 255 },
  white: { r: 255, g: 255, b: 255, a: 255 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

/**
 * Parse a colour. Accepts `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `black`,
 * `white` and `transparent`. Deliberately narrow: every accepted value is a
 * closed set of characters that is safe to place in SVG attributes.
 */
export function parseColor(value: string, optionName: string): Rgba {
  const named = Object.hasOwn(NAMED, value.toLowerCase()) ? NAMED[value.toLowerCase()] : undefined;
  if (named !== undefined) return named;
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value)?.[1];
  if (hex === undefined) {
    throw new InvalidInputError(
      `Option "${optionName}" must be a hex colour (#rgb, #rgba, #rrggbb, #rrggbbaa) or one of black, white, transparent.`,
      { details: { option: optionName } },
    );
  }
  const full = hex.length <= 4 ? Array.from(hex, (c) => c + c).join('') : hex;
  const channel = (i: number): number => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16);
  return { r: channel(0), g: channel(1), b: channel(2), a: full.length === 8 ? channel(3) : 255 };
}

/** WCAG relative luminance of an opaque colour. */
function luminance({ r, g, b }: Rgba): number {
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio (1–21), ignoring alpha. */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export const luminanceOf: (color: Rgba) => number = luminance;
