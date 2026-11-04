import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  alignmentPatternPositions,
  eccCodewordsPerBlock,
  numDataCodewords,
  numErrorCorrectionBlocks,
  numRawDataModules,
  symbolSize,
} from '../../../src/core/tables.js';
import { encodeSegmentsSymbol } from '../../../src/core/symbol.js';
import { UnsupportedDataError } from '../../../src/index.js';
import { ERROR_CORRECTION_LEVELS, type ErrorCorrectionLevel } from '../../../src/domain/model.js';

const require = createRequire(import.meta.url);
const ecTables = require('qrcode/lib/core/error-correction-code') as {
  getBlocksCount: (v: number, l: unknown) => number;
  getTotalCodewordsCount: (v: number, l: unknown) => number;
};
const ecLevels = require('qrcode/lib/core/error-correction-level') as Record<string, unknown>;
const qrUtils = require('qrcode/lib/core/utils') as {
  getSymbolTotalCodewords: (v: number) => number;
};
const alignment = require('qrcode/lib/core/alignment-pattern') as {
  getRowColCoords: (v: number) => number[];
};

const versions = Array.from({ length: 40 }, (_, i) => i + 1);

describe('tables agree with an independent implementation', () => {
  it.each(versions)('version %i: blocks, EC codewords, raw codewords, alignment', (version) => {
    expect(symbolSize(version)).toBe(version * 4 + 17);
    expect(Math.floor(numRawDataModules(version) / 8)).toBe(
      qrUtils.getSymbolTotalCodewords(version),
    );
    for (const level of ERROR_CORRECTION_LEVELS) {
      const reference = ecLevels[level];
      expect(numErrorCorrectionBlocks(version, level)).toBe(
        ecTables.getBlocksCount(version, reference),
      );
      expect(numErrorCorrectionBlocks(version, level) * eccCodewordsPerBlock(version, level)).toBe(
        ecTables.getTotalCodewordsCount(version, reference),
      );
    }
    expect(alignmentPatternPositions(version)).toEqual(
      version === 1 ? [] : alignment.getRowColCoords(version),
    );
  });
});

/** Maximum content of a version-40 / version-1 symbol (ISO 18004 Table 7; values are widely published). */
const capacities: readonly [
  number,
  ErrorCorrectionLevel,
  'numeric' | 'alphanumeric' | 'byte',
  number,
][] = [
  [40, 'L', 'numeric', 7089],
  [40, 'L', 'alphanumeric', 4296],
  [40, 'L', 'byte', 2953],
  [40, 'M', 'numeric', 5596],
  [40, 'M', 'byte', 2331],
  [40, 'Q', 'byte', 1663],
  [40, 'H', 'numeric', 3057],
  [40, 'H', 'alphanumeric', 1852],
  [40, 'H', 'byte', 1273],
  [1, 'L', 'numeric', 41],
  [1, 'L', 'alphanumeric', 25],
  [1, 'L', 'byte', 17],
  [1, 'H', 'numeric', 17],
  [1, 'H', 'alphanumeric', 10],
  [1, 'H', 'byte', 7],
];

describe('published data capacities are reached exactly, and exceeded by one character', () => {
  const make = (mode: 'numeric' | 'alphanumeric' | 'byte', n: number) =>
    mode === 'numeric'
      ? ({ mode, text: '7'.repeat(n) } as const)
      : mode === 'alphanumeric'
        ? ({ mode, text: 'A'.repeat(n) } as const)
        : ({ mode, bytes: new Uint8Array(n).fill(0x61) } as const);

  it.each(capacities)('version %i-%s %s: %i fits', (version, ecc, mode, max) => {
    const options = {
      ecc,
      minVersion: version,
      maxVersion: version,
      mask: undefined,
      boostEcc: false,
    } as const;
    expect(encodeSegmentsSymbol([make(mode, max)], options).version).toBe(version);
    expect(() => encodeSegmentsSymbol([make(mode, max + 1)], options)).toThrow(
      UnsupportedDataError,
    );
  });

  it('data codewords are total minus error correction', () => {
    expect(numDataCodewords(1, 'M')).toBe(16);
    expect(numDataCodewords(40, 'L')).toBe(2956);
  });
});
