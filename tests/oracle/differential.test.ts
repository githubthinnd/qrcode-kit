import { describe, expect, it } from 'vitest';
import { encodeTextSymbol } from '../../src/core/symbol.js';
import { ERROR_CORRECTION_LEVELS, MASK_PATTERNS } from '../../src/domain/model.js';
import { charCountBits, numDataCodewords } from '../../src/core/tables.js';
import { createRandom, referenceEngines, sameMatrix } from './helpers.js';

const versions = Array.from({ length: 40 }, (_, i) => i + 1);

function sampleText(version: number, ecc: (typeof ERROR_CORRECTION_LEVELS)[number]): string {
  const capacityBytes = Math.floor(
    (numDataCodewords(version, ecc) * 8 - 4 - charCountBits('byte', version)) / 8,
  );
  const length = Math.max(1, Math.floor(capacityBytes * 0.7));
  const random = createRandom(version * 31 + ecc.charCodeAt(0));
  const alphabet = 'abcdefghijklmnopqrstuvwxyz ';
  let text = 'q'; // guarantees a lowercase letter so every engine selects byte mode
  while (text.length < length) text += alphabet[Math.floor(random() * alphabet.length)];
  return text;
}

describe('bit-exact agreement with independent implementations (fixed version, level and mask)', () => {
  it.each(versions)(
    'version %i: all levels × all masks match every reference engine',
    (version) => {
      const mismatches: string[] = [];
      for (const ecc of ERROR_CORRECTION_LEVELS) {
        const text = sampleText(version, ecc);
        for (const mask of MASK_PATTERNS) {
          const ours = encodeTextSymbol(text, {
            ecc,
            minVersion: version,
            maxVersion: version,
            mask,
            boostEcc: false,
            charset: 'utf-8',
          });
          expect(ours.version).toBe(version);
          expect(ours.mask).toBe(mask);
          for (const [name, engine] of Object.entries(referenceEngines)) {
            if (!sameMatrix(ours, engine({ text, version, ecc, mask }))) {
              mismatches.push(`${name} v${String(version)}-${ecc}-mask${String(mask)}`);
            }
          }
        }
      }
      expect(mismatches).toEqual([]);
    },
  );
});

describe('automatic mask selection', () => {
  it('agrees with the Nayuki-derived reference (uqr) on the large majority of inputs', () => {
    const random = createRandom(2026);
    let same = 0;
    const total = 120;
    for (let i = 0; i < total; i++) {
      const version = 1 + Math.floor(random() * 40);
      const ecc = ERROR_CORRECTION_LEVELS[Math.floor(random() * 4)] ?? 'M';
      const text = sampleText(version, ecc);
      const ours = encodeTextSymbol(text, {
        ecc,
        minVersion: version,
        maxVersion: version,
        mask: undefined,
        boostEcc: false,
        charset: 'utf-8',
      });
      const rows = referenceEngines['uqr']({ text, version, ecc, mask: ours.mask });
      // Using our chosen mask on the reference must reproduce our matrix (mask choice is the only freedom).
      expect(sameMatrix(ours, rows)).toBe(true);
      const auto = referenceAutoMask(text, version, ecc);
      if (auto === ours.mask) same++;
    }
    expect(same / total).toBeGreaterThan(0.9);
  });
});

import { encode as uqrEncode } from 'uqr';
function referenceAutoMask(text: string, version: number, ecc: string): number {
  return uqrEncode(Array.from(Buffer.from(text, 'latin1')), {
    ecc: ecc as 'L' | 'M' | 'Q' | 'H',
    minVersion: version,
    maxVersion: version,
    border: 0,
  }).maskPattern;
}
