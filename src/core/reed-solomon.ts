/**
 * Reed-Solomon error correction over GF(2^8) with the QR Code field polynomial
 * x^8 + x^4 + x^3 + x^2 + 1 (0x11D) and generator root α = 2.
 */

const FIELD_POLYNOMIAL = 0x11d;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let value = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= FIELD_POLYNOMIAL;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255] ?? 0;
}

/** Multiplication in GF(256). */
export function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0;
}

/** α^n in GF(256). */
export function gfPower(n: number): number {
  return EXP[((n % 255) + 255) % 255] ?? 0;
}

/**
 * Coefficients of the generator polynomial ∏(x − α^i), i = 0 … degree−1,
 * highest power first, without the leading 1.
 */
export function generatorPolynomial(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gfMultiply(result[j] ?? 0, root);
      if (j + 1 < degree) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0);
    }
    root = gfMultiply(root, 2);
  }
  return result;
}

/** Remainder of `data(x) · x^degree` divided by the generator polynomial, i.e. the EC codewords. */
export function reedSolomonRemainder(data: ArrayLike<number>, divisor: Uint8Array): Uint8Array {
  const degree = divisor.length;
  const result = new Uint8Array(degree);
  for (const byte of Array.from(data)) {
    const factor = (byte ^ result[0]) & 0xff;
    result.copyWithin(0, 1);
    result[degree - 1] = 0;
    for (let j = 0; j < degree; j++) {
      result[j] = (result[j] ?? 0) ^ gfMultiply(divisor[j] ?? 0, factor);
    }
  }
  return result;
}
