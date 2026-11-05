import { InvalidInputError, UnsupportedDataError } from '../domain/errors.js';
import type { ErrorCorrectionLevel, SegmentInfo } from '../domain/model.js';
import type { Segment } from '../domain/segment.js';
import { BitBuffer } from './bit-buffer.js';
import type { Framing } from './framing.js';
import type { KanjiMapper } from './kanji.js';
import { generatorPolynomial, reedSolomonRemainder } from './reed-solomon.js';
import { prepareSegment, segmentBitsIn, writeSegmentIn, type PreparedSegment } from './segments.js';

/**
 * One version and level of Micro QR Code or rMQR. Both families share the way data is turned into
 * codewords (framing, terminator, padding, Reed-Solomon blocks); they differ in layout.
 */
export interface CompactSpec {
  readonly version: number;
  readonly ecc: ErrorCorrectionLevel;
  readonly framing: Framing;
  /** Zero bits written after the data when there is room. */
  readonly terminatorBits: number;
  /** Capacity for data in bits. Micro QR M1 and M3 end in a 4-bit codeword, so it is not a multiple of 8. */
  readonly dataBits: number;
  /** `[count, data codewords]` groups of Reed-Solomon blocks. */
  readonly blocks: readonly (readonly [count: number, data: number])[];
  readonly eccPerBlock: number;
}

/** What to encode; the body may depend on the framing (the cheapest segmentation does). */
export interface CompactSource {
  /** Segments that always come first (ECI, FNC1). */
  readonly lead: readonly Segment[];
  readonly body: (framing: Framing) => readonly Segment[];
}

export interface CompactPlan {
  readonly spec: CompactSpec;
  /** The data bits, exactly `spec.dataBits` of them. */
  readonly data: BitBuffer;
  readonly segments: readonly SegmentInfo[];
}

/** Count of data codewords of a spec, counting a 4-bit final codeword as one. */
export const dataCodewordsOf = (spec: CompactSpec): number =>
  spec.blocks.reduce((sum, [count, data]) => sum + count * data, 0);

/**
 * Pick the first candidate (in the order given) that holds the data; with `boost`, raise the level
 * within that version while the data still fits. `siblings` lists the other levels of a version.
 */
export function planCompact(
  source: CompactSource,
  candidates: readonly CompactSpec[],
  siblings: (spec: CompactSpec) => readonly CompactSpec[],
  kanji: KanjiMapper | undefined,
  boost: boolean,
): CompactPlan {
  const lead = source.lead.map((s) => prepareSegment(s, kanji));
  const prepared = (spec: CompactSpec): { all: PreparedSegment[]; bits: number } => {
    const all = [...lead, ...source.body(spec.framing).map((s) => prepareSegment(s, kanji))];
    let bits = 0;
    for (const segment of all) bits += segmentBitsIn(segment, spec.framing);
    return { all, bits };
  };

  let chosen: { spec: CompactSpec; all: PreparedSegment[]; bits: number } | undefined;
  let closest = Infinity;
  for (const spec of candidates) {
    let attempt: { all: PreparedSegment[]; bits: number };
    try {
      attempt = prepared(spec);
    } catch (error) {
      // A segmentation that has no valid mode in this version (e.g. text in M1) just does not fit here.
      if (error instanceof UnsupportedDataError) continue;
      throw error;
    }
    if (attempt.bits <= spec.dataBits) {
      chosen = { spec, ...attempt };
      break;
    }
    if (Number.isFinite(attempt.bits)) closest = Math.min(closest, attempt.bits - spec.dataBits);
  }
  if (chosen === undefined) {
    throw new UnsupportedDataError(
      'The data does not fit in this symbol type with the requested error correction level and version range.',
      {
        details: {
          candidates: candidates.length,
          ...(Number.isFinite(closest) ? { missingBits: closest } : {}),
        },
      },
    );
  }

  if (boost) {
    const order = ['L', 'M', 'Q', 'H'] as const;
    for (const other of siblings(chosen.spec)) {
      if (order.indexOf(other.ecc) <= order.indexOf(chosen.spec.ecc)) continue;
      let attempt: { all: PreparedSegment[]; bits: number } | undefined;
      try {
        attempt = prepared(other);
      } catch (error) {
        if (error instanceof UnsupportedDataError) continue;
        throw error;
      }
      if (attempt.bits <= other.dataBits) chosen = { spec: other, ...attempt };
    }
  }

  const { spec, all } = chosen;
  const buffer = new BitBuffer();
  const infos: SegmentInfo[] = [];
  for (const segment of all) {
    writeSegmentIn(segment, spec.framing, buffer);
    infos.push({
      mode: segment.mode,
      count: segment.count,
      bits: segmentBitsIn(segment, spec.framing),
    });
  }
  const capacity = spec.dataBits;
  buffer.append(0, Math.min(spec.terminatorBits, capacity - buffer.length));
  buffer.append(0, Math.min((8 - (buffer.length % 8)) % 8, capacity - buffer.length));
  for (let pad = 0xec; buffer.length + 8 <= capacity; pad ^= 0xec ^ 0x11) buffer.append(pad, 8);
  buffer.append(0, capacity - buffer.length); // the 4-bit final codeword of M1 and M3
  return { spec, data: buffer, segments: infos };
}

/** The bits of a buffer as 0/1 values. */
export function bitsOf(bytes: Uint8Array, count: number): Uint8Array {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = ((bytes[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1;
  return out;
}

/**
 * Reed-Solomon over every block and the interleaved result (data columns, then error correction
 * columns), as QR Code does. A final 4-bit codeword counts as a full codeword whose low bits are 0.
 */
export function blocksWithErrorCorrection(data: Uint8Array, spec: CompactSpec): Uint8Array {
  const divisor = generatorPolynomial(spec.eccPerBlock);
  const blocks: { data: Uint8Array; ecc: Uint8Array }[] = [];
  let offset = 0;
  for (const [count, size] of spec.blocks) {
    for (let i = 0; i < count; i++) {
      const slice = data.subarray(offset, offset + size);
      offset += size;
      blocks.push({ data: slice, ecc: reedSolomonRemainder(slice, divisor) });
    }
  }
  if (offset !== data.length) {
    throw new InvalidInputError('The data does not match the block structure of the symbol.');
  }
  const longest = Math.max(...blocks.map((b) => b.data.length));
  const out: number[] = [];
  for (let i = 0; i < longest; i++) {
    for (const block of blocks) if (i < block.data.length) out.push(block.data[i] ?? 0);
  }
  for (let i = 0; i < spec.eccPerBlock; i++) {
    for (const block of blocks) out.push(block.ecc[i] ?? 0);
  }
  return Uint8Array.from(out);
}

/** BCH remainder of `value << degree` modulo `generator`, a polynomial of `degree + 1` bits. */
export function bchRemainder(value: number, degree: number, generator: number): number {
  let remainder = value << degree;
  for (let bit = 31 - Math.clz32(remainder | 1); bit >= degree; bit--) {
    if (((remainder >>> bit) & 1) !== 0) remainder ^= generator << (bit - degree);
  }
  return remainder;
}
