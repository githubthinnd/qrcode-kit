import { describe, expect, it } from 'vitest';
import {
  generatorPolynomial,
  gfMultiply,
  gfPower,
  reedSolomonRemainder,
} from '../../../src/core/reed-solomon.js';
import { createRandom } from '../oracle-random.js';

describe('GF(256) arithmetic', () => {
  it('has α^0 = 1, α^1 = 2 and α^8 = 0x1D (reduction by 0x11D)', () => {
    expect(gfPower(0)).toBe(1);
    expect(gfPower(1)).toBe(2);
    expect(gfPower(8)).toBe(0x1d);
    expect(gfPower(255)).toBe(1);
  });

  it('multiplication is commutative, associative, distributive over XOR, and has identity 1', () => {
    const random = createRandom(7);
    for (let i = 0; i < 2000; i++) {
      const [a, b, c] = [0, 0, 0].map(() => Math.floor(random() * 256)) as [number, number, number];
      expect(gfMultiply(a, b)).toBe(gfMultiply(b, a));
      expect(gfMultiply(gfMultiply(a, b), c)).toBe(gfMultiply(a, gfMultiply(b, c)));
      expect(gfMultiply(a, b ^ c)).toBe(gfMultiply(a, b) ^ gfMultiply(a, c));
      expect(gfMultiply(a, 1)).toBe(a);
      expect(gfMultiply(a, 0)).toBe(0);
    }
  });

  it('every non-zero element has a multiplicative inverse', () => {
    for (let a = 1; a < 256; a++) {
      let found = false;
      for (let b = 1; b < 256 && !found; b++) found = gfMultiply(a, b) === 1;
      expect(found).toBe(true);
    }
  });
});

/** Evaluate a polynomial (highest power first) at x in GF(256). */
function evaluate(coefficients: number[], x: number): number {
  let result = 0;
  for (const c of coefficients) result = gfMultiply(result, x) ^ c;
  return result;
}

describe('Reed-Solomon', () => {
  it.each([7, 10, 13, 17, 22, 28, 30])(
    'generator polynomial of degree %i has the roots α^0 … α^(degree−1) and no others',
    (degree) => {
      const polynomial = [1, ...generatorPolynomial(degree)];
      for (let i = 0; i < degree; i++) expect(evaluate(polynomial, gfPower(i))).toBe(0);
      expect(evaluate(polynomial, gfPower(degree))).not.toBe(0);
    },
  );

  it.each([7, 10, 18, 30])(
    'message + EC codewords vanish at every generator root (degree %i)',
    (degree) => {
      const random = createRandom(degree);
      const divisor = generatorPolynomial(degree);
      for (let trial = 0; trial < 50; trial++) {
        const data = Array.from({ length: 1 + Math.floor(random() * 120) }, () =>
          Math.floor(random() * 256),
        );
        const codeword = [...data, ...reedSolomonRemainder(data, divisor)];
        for (let i = 0; i < degree; i++) expect(evaluate(codeword, gfPower(i))).toBe(0);
      }
    },
  );

  it('matches the published ISO 18004 example: "01234567" at version 1-M', () => {
    // Data codewords of the standard's worked example, and its 10 error correction codewords.
    const data = [
      0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec,
      0x11,
    ];
    const ec = reedSolomonRemainder(data, generatorPolynomial(10));
    expect([...ec]).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });
});
