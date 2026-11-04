import { describe, expect, it } from 'vitest';
import { buildLayout, penaltyScore } from '../../../src/core/layout.js';
import { addErrorCorrectionAndInterleave, planDataCodewords } from '../../../src/core/encoder.js';
import { segmentText } from '../../../src/core/segmentation.js';
import { MASK_PATTERNS, type ErrorCorrectionLevel } from '../../../src/domain/model.js';

/**
 * A deliberately naive, independently written mask evaluation following the
 * wording of the standard (§7.8.3), used to check the optimised scorer.
 */
export function naivePenalty(modules: Uint8Array, size: number): number {
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= size || y >= size ? 0 : (modules[y * size + x] ?? 0);
  let score = 0;

  // N1: five or more consecutive modules of one colour in a row or column
  for (const horizontal of [true, false]) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        const cur = b < size ? (horizontal ? at(b, a) : at(a, b)) : -1;
        const prev = horizontal ? at(b - 1, a) : at(a, b - 1);
        if (cur === prev) run++;
        else {
          if (run >= 5) score += 3 + (run - 5);
          run = 1;
        }
      }
    }
  }
  // N2: 2×2 blocks of one colour
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = at(x, y);
      if (at(x + 1, y) === c && at(x, y + 1) === c && at(x + 1, y + 1) === c) score += 3;
    }
  }
  // N3: dark n, light n, dark 3n, light n, dark n (any n ≥ 1) with at least 4n light modules on one
  // side and at least n on the other; the border of the symbol counts as unbounded light.
  for (const horizontal of [true, false]) {
    for (let a = 0; a < size; a++) {
      const runs: { color: number; length: number }[] = [];
      for (let b = 0; b < size; b++) {
        const color = horizontal ? at(b, a) : at(a, b);
        const last = runs.at(-1);
        if (last?.color === color) last.length++;
        else runs.push({ color, length: 1 });
      }
      const length = (index: number): number => {
        if (index < 0 || index >= runs.length) return Infinity; // beyond the border: light
        const run = runs[index] ?? { color: 1, length: 0 };
        // A light run touching the border continues into the (light) border.
        if (run.color === 0 && (index === 0 || index === runs.length - 1)) return Infinity;
        return run.length;
      };
      for (let j = 0; j + 4 < runs.length; j++) {
        if (runs[j]?.color !== 1) continue;
        const n = runs[j]?.length ?? 0;
        if (
          length(j + 1) !== n ||
          length(j + 2) !== 3 * n ||
          length(j + 3) !== n ||
          length(j + 4) !== n
        )
          continue;
        const before = length(j - 1);
        const after = length(j + 5);
        if (before >= 4 * n && after >= n) score += 40;
        if (after >= 4 * n && before >= n) score += 40;
      }
    }
  }
  // N4: smallest k such that the dark share lies within [45 − 5k, 55 + 5k] percent
  let dark = 0;
  for (let i = 0; i < size * size; i++) dark += modules[i] ?? 0;
  let k = 0;
  while (dark * 100 < (45 - 5 * k) * size * size || dark * 100 > (55 + 5 * k) * size * size) k++;
  score += k * 10;
  return score;
}

describe('mask selection', () => {
  it('the chosen mask has the lowest penalty according to an independent naive scorer', () => {
    const texts = [
      'hello',
      'https://example.com/x?y=1',
      '0123456789'.repeat(8),
      'Tiếng Việt có dấu '.repeat(5),
      'QR'.repeat(100),
    ];
    let checked = 0;
    for (const text of texts) {
      for (const ecc of ['L', 'M', 'Q', 'H'] as ErrorCorrectionLevel[]) {
        const plan = planDataCodewords(
          { lead: [], body: (range) => segmentText(text, range, { charset: 'utf-8' }) },
          { ecc, minVersion: 1, maxVersion: 40, mask: undefined, boostEcc: false },
        );
        const codewords = addErrorCorrectionAndInterleave(
          plan.dataCodewords,
          plan.version,
          plan.ecc,
        );
        const size = plan.version * 4 + 17;
        const penalties = MASK_PATTERNS.map((mask) =>
          naivePenalty(buildLayout(plan.version, plan.ecc, codewords, mask).modules, size),
        );
        const chosen = buildLayout(plan.version, plan.ecc, codewords, undefined).mask;
        expect(
          penalties[chosen],
          `${text.slice(0, 12)} ${ecc}: penalties ${penalties.join(',')}`,
        ).toBe(Math.min(...penalties));
        checked++;
      }
    }
    expect(checked).toBe(20);
  });

  it('the optimised score equals the naive score for every mask of many symbols', () => {
    for (const text of [
      'hello',
      'https://example.com/x?y=1',
      '0123456789'.repeat(8),
      'QR'.repeat(100),
      'abc'.repeat(30),
    ]) {
      for (const ecc of ['L', 'M', 'Q', 'H'] as ErrorCorrectionLevel[]) {
        const plan = planDataCodewords(
          { lead: [], body: (range) => segmentText(text, range, { charset: 'utf-8' }) },
          { ecc, minVersion: 1, maxVersion: 40, mask: undefined, boostEcc: false },
        );
        const codewords = addErrorCorrectionAndInterleave(
          plan.dataCodewords,
          plan.version,
          plan.ecc,
        );
        const size = plan.version * 4 + 17;
        for (const mask of MASK_PATTERNS) {
          const modules = buildLayout(plan.version, plan.ecc, codewords, mask).modules;
          expect(
            penaltyScore(modules, size),
            `${text.slice(0, 8)} ${ecc} mask ${String(mask)}`,
          ).toBe(naivePenalty(modules, size));
        }
      }
    }
  });
});
