import type { Segment } from '../domain/segment.js';
import { kanjiValue, type KanjiMapper } from './kanji.js';
import { qrFraming, type Framing } from './framing.js';
import { UnsupportedDataError } from '../domain/errors.js';
import {
  alphanumericValue,
  encodeText,
  isDigit,
  toCodePoints,
  utf8Length,
  type Charset,
} from './text.js';

export interface SegmentationOptions {
  readonly charset: Charset;
  /** When given, characters representable in Kanji mode may use it. */
  readonly kanji?: KanjiMapper | undefined;
}

/** Version ranges that share character-count indicator widths: 1–9, 10–26, 27–40. */
export type VersionRange = 0 | 1 | 2;

export const versionRangeOf = (version: number): VersionRange =>
  version <= 9 ? 0 : version <= 26 ? 1 : 2;

const REPRESENTATIVE_VERSION: readonly [number, number, number] = [1, 10, 27];

const INF = Number.POSITIVE_INFINITY;
// Modes in the dynamic program: 0 = byte, 1 = alphanumeric, 2 = numeric, 3 = kanji.
type ModeIndex = 0 | 1 | 2 | 3;
const MODE_NAMES = ['byte', 'alphanumeric', 'numeric', 'kanji'] as const;

const ceilToBits = (sixths: number): number => Math.ceil(sixths / 6) * 6;

/**
 * Split text into the segments that minimise the symbol size for a version
 * range. Costs are tracked in sixths of a bit so numeric (10/3 bits per digit)
 * and alphanumeric (11/2) groups are accounted exactly.
 */
export function segmentText(
  text: string,
  range: VersionRange,
  options: SegmentationOptions,
): Segment[] {
  return segmentTextWith(text, qrFraming(REPRESENTATIVE_VERSION[range]), options);
}

/**
 * The same optimisation for any symbol: `framing` says which modes exist and what their headers
 * cost (Micro QR and rMQR have fewer modes and different count fields than QR Code).
 */
export function segmentTextWith(
  text: string,
  framing: Framing,
  options: SegmentationOptions,
): Segment[] {
  const chars = toCodePoints(text);
  const n = chars.length;
  if (n === 0) return [];

  const headerOf = (name: (typeof MODE_NAMES)[number]): number => {
    const indicator = framing.mode(name);
    const width = framing.count(name);
    return indicator === undefined || width === undefined ? INF : (indicator.bits + width) * 6;
  };
  const header: readonly number[] = [
    headerOf('byte'),
    headerOf('alphanumeric'),
    headerOf('numeric'),
    headerOf('kanji'),
  ];

  const kanjiMapper = options.kanji;
  const charCost = (index: number, mode: ModeIndex): number => {
    const cp = chars[index] ?? 0;
    switch (mode) {
      case 0:
        return options.charset === 'utf-8' ? utf8Length(cp) * 48 : 48;
      case 1:
        return alphanumericValue(cp) >= 0 ? 33 : INF;
      case 2:
        return isDigit(cp) ? 20 : INF;
      case 3: {
        if (kanjiMapper === undefined) return INF;
        const code = kanjiMapper.shiftJisCode(cp);
        return code !== undefined && kanjiValue(code) !== undefined ? 78 : INF;
      }
    }
  };

  const costs: number[][] = [];
  const back: ModeIndex[][] = [];
  const modes: readonly ModeIndex[] = [0, 1, 2, 3];
  for (let i = 0; i < n; i++) {
    const row: number[] = [INF, INF, INF, INF];
    const from: ModeIndex[] = [0, 0, 0, 0];
    const prev = i > 0 ? costs[i - 1] : undefined;
    for (const m of modes) {
      const cost = charCost(i, m);
      if (cost === INF) continue;
      if (prev === undefined) {
        row[m] = (header[m] ?? 0) + cost;
        continue;
      }
      let best = INF;
      let bestFrom: ModeIndex = 0;
      for (const p of modes) {
        const prevCost = prev[p] ?? INF;
        if (prevCost === INF) continue;
        const candidate =
          p === m ? prevCost + cost : ceilToBits(prevCost) + (header[m] ?? 0) + cost;
        if (candidate < best) {
          best = candidate;
          bestFrom = p;
        }
      }
      row[m] = best;
      from[m] = bestFrom;
    }
    costs.push(row);
    back.push(from);
  }

  // Pick the cheapest final mode (ties prefer the more compact modes: numeric, alphanumeric, kanji, byte).
  const last = costs[n - 1] ?? [];
  let mode: ModeIndex = 0;
  let best = INF;
  for (const m of [2, 1, 3, 0] as const) {
    const c = last[m] ?? INF;
    if (c < best) {
      best = c;
      mode = m;
    }
  }

  if (best === INF) {
    throw new UnsupportedDataError('The text cannot be written in any mode this symbol offers.');
  }
  const assigned: ModeIndex[] = new Array<ModeIndex>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    assigned[i] = mode;
    mode = back[i]?.[mode] ?? 0;
  }

  const segments: Segment[] = [];
  let start = 0;
  while (start < n) {
    const runMode = assigned[start] ?? 0;
    let end = start + 1;
    while (end < n && assigned[end] === runMode) end++;
    const slice = chars.slice(start, end);
    const text = String.fromCodePoint(...slice);
    const name = MODE_NAMES[runMode];
    if (name === 'byte') segments.push({ mode: 'byte', bytes: encodeText(text, options.charset) });
    else segments.push({ mode: name, text });
    start = end;
  }
  return segments;
}
