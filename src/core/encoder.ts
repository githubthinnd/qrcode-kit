import { InvalidInputError, UnsupportedDataError } from '../domain/errors.js';
import { QRMatrix } from '../domain/matrix.js';
import {
  ERROR_CORRECTION_LEVELS,
  MAX_VERSION,
  MIN_VERSION,
  type ErrorCorrectionLevel,
  type MaskPattern,
  type SegmentInfo,
  type StructuredAppendInfo,
} from '../domain/model.js';
import type { Segment } from '../domain/segment.js';
import { BitBuffer } from './bit-buffer.js';
import type { KanjiMapper } from './kanji.js';
import { buildLayout } from './layout.js';
import { generatorPolynomial, reedSolomonRemainder } from './reed-solomon.js';
import {
  describeSegment,
  prepareSegment,
  segmentBits,
  writeSegment,
  type PreparedSegment,
} from './segments.js';
import { versionRangeOf, type VersionRange } from './segmentation.js';
import {
  MODE_BITS,
  eccCodewordsPerBlock,
  numDataCodewords,
  numErrorCorrectionBlocks,
  numRawDataModules,
} from './tables.js';

export interface EncodeOptions {
  readonly ecc: ErrorCorrectionLevel;
  readonly minVersion: number;
  readonly maxVersion: number;
  /** `undefined` picks the mask with the lowest penalty. */
  readonly mask: MaskPattern | undefined;
  /** Raise the error correction level while the data still fits in the chosen version. */
  readonly boostEcc: boolean;
  readonly kanji?: KanjiMapper | undefined;
}

/** What to encode; the body may depend on the version range (automatic segmentation does). */
export interface SymbolSource {
  /** Segments that always come first (ECI, FNC1). */
  readonly lead: readonly Segment[];
  readonly body: (range: VersionRange) => readonly Segment[];
  readonly structuredAppend?: StructuredAppendInfo | undefined;
}

const STRUCTURED_APPEND_BITS = 20;

export function validateEncodeOptions(options: EncodeOptions): void {
  if (!ERROR_CORRECTION_LEVELS.includes(options.ecc)) {
    throw new InvalidInputError('Error correction level must be one of L, M, Q, H.');
  }
  if (
    !Number.isInteger(options.minVersion) ||
    !Number.isInteger(options.maxVersion) ||
    options.minVersion < MIN_VERSION ||
    options.maxVersion > MAX_VERSION ||
    options.minVersion > options.maxVersion
  ) {
    throw new InvalidInputError('Version range must satisfy 1 ≤ min ≤ max ≤ 40.', {
      details: { minVersion: options.minVersion, maxVersion: options.maxVersion },
    });
  }
}

/** The bit stream of a symbol before error correction, with the parameters chosen for it. */
export interface DataPlan {
  readonly version: number;
  readonly ecc: ErrorCorrectionLevel;
  /** Data codewords: segments, terminator and pad codewords (no error correction). */
  readonly dataCodewords: Uint8Array;
  readonly segments: readonly SegmentInfo[];
}

/** Choose version and level and produce the data codewords of a symbol. */
export function planDataCodewords(source: SymbolSource, options: EncodeOptions): DataPlan {
  validateEncodeOptions(options);
  const kanji = options.kanji;
  const lead = source.lead.map((s) => prepareSegment(s, kanji));
  const preparedBodies = new Map<VersionRange, PreparedSegment[]>();
  const bodyFor = (version: number): PreparedSegment[] => {
    const range = versionRangeOf(version);
    let prepared = preparedBodies.get(range);
    if (prepared === undefined) {
      prepared = source.body(range).map((s) => prepareSegment(s, kanji));
      preparedBodies.set(range, prepared);
    }
    return prepared;
  };
  const totalBits = (version: number): number => {
    let bits = source.structuredAppend === undefined ? 0 : STRUCTURED_APPEND_BITS;
    for (const s of lead) bits += segmentBits(s, version);
    for (const s of bodyFor(version)) bits += segmentBits(s, version);
    return bits;
  };

  let version = options.minVersion;
  let usedBits = totalBits(version);
  while (usedBits > numDataCodewords(version, options.ecc) * 8) {
    if (version >= options.maxVersion) {
      throw new UnsupportedDataError(
        'The data does not fit in a QR Code with the requested error correction level and version range.',
        {
          details: {
            ecc: options.ecc,
            maxVersion: options.maxVersion,
            bitsRequired: Number.isFinite(usedBits) ? usedBits : -1,
            bitsAvailable: numDataCodewords(version, options.ecc) * 8,
          },
        },
      );
    }
    version++;
    usedBits = totalBits(version);
  }

  let ecc = options.ecc;
  if (options.boostEcc) {
    for (const candidate of ERROR_CORRECTION_LEVELS) {
      if (
        ERROR_CORRECTION_LEVELS.indexOf(candidate) > ERROR_CORRECTION_LEVELS.indexOf(ecc) &&
        usedBits <= numDataCodewords(version, candidate) * 8
      ) {
        ecc = candidate;
      }
    }
  }

  const buffer = new BitBuffer();
  const sa = source.structuredAppend;
  if (sa !== undefined) {
    buffer.append(MODE_BITS.structuredAppend, 4);
    buffer.append(sa.index, 4);
    buffer.append(sa.total - 1, 4);
    buffer.append(sa.parity, 8);
  }
  const infos: SegmentInfo[] = [];
  for (const s of [...lead, ...bodyFor(version)]) {
    writeSegment(s, version, buffer);
    infos.push(describeSegment(s, version));
  }

  const capacityBits = numDataCodewords(version, ecc) * 8;
  buffer.append(0, Math.min(4, capacityBits - buffer.length));
  buffer.append(0, (8 - (buffer.length % 8)) % 8);
  for (let pad = 0xec; buffer.length < capacityBits; pad ^= 0xec ^ 0x11) buffer.append(pad, 8);

  return { version, ecc, dataCodewords: buffer.toBytes(), segments: infos };
}

/** Encode one QR Code symbol. */
export function encodeSymbol(source: SymbolSource, options: EncodeOptions): QRMatrix {
  const plan = planDataCodewords(source, options);
  const codewords = addErrorCorrectionAndInterleave(plan.dataCodewords, plan.version, plan.ecc);
  const layout = buildLayout(plan.version, plan.ecc, codewords, options.mask);
  const sa = source.structuredAppend;
  return new QRMatrix({
    version: plan.version,
    ecc: plan.ecc,
    mask: layout.mask,
    modules: layout.modules,
    kinds: layout.kinds,
    segments: plan.segments,
    ...(sa === undefined ? {} : { structuredAppend: sa }),
  });
}

/** Split data codewords into blocks, append Reed-Solomon codewords and interleave. */
export function addErrorCorrectionAndInterleave(
  data: Uint8Array,
  version: number,
  ecc: ErrorCorrectionLevel,
): Uint8Array {
  const numBlocks = numErrorCorrectionBlocks(version, ecc);
  const blockEccLen = eccCodewordsPerBlock(version, ecc);
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const divisor = generatorPolynomial(blockEccLen);
  const blocks: Uint8Array[] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dataLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const blockData = data.subarray(k, k + dataLen);
    k += dataLen;
    const eccBytes = reedSolomonRemainder(blockData, divisor);
    const block = new Uint8Array(shortBlockLen + 1);
    block.set(blockData, 0);
    // Short blocks leave one data slot empty; ECC always follows at the same offset.
    block.set(eccBytes, dataLen + (i < numShortBlocks ? 1 : 0));
    blocks.push(block);
  }

  const result = new Uint8Array(rawCodewords);
  let out = 0;
  for (let i = 0; i < shortBlockLen + 1; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) {
        result[out++] = blocks[j]?.[i] ?? 0;
      }
    }
  }
  return result;
}
