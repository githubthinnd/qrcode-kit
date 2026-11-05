import { InvalidInputError } from './errors.js';
import {
  MAX_MICRO_VERSION,
  MAX_RMQR_VERSION,
  MODULE_KINDS,
  RMQR_SIZES,
  designationOf,
  type ErrorCorrectionLevel,
  type MaskPattern,
  type ModuleKind,
  type SegmentInfo,
  type StructuredAppendInfo,
  type SymbolType,
} from './model.js';

export interface QRMatrixInit {
  /** QR: 1–40. Micro QR: 1–4 (M1–M4). rMQR: 1–32 (R7x43 … R17x139). */
  readonly version: number;
  /** Micro QR M1 detects errors only and is reported as `L`; rMQR uses `M` and `H`. */
  readonly ecc: ErrorCorrectionLevel;
  /** Micro QR: 0–3. rMQR has one fixed pattern (reported as 4). */
  readonly mask: MaskPattern;
  /** `width * height` entries, row-major, 1 = dark. Copied. */
  readonly modules: Uint8Array;
  /** `width * height` entries, indices into {@link MODULE_KINDS}. Copied. */
  readonly kinds: Uint8Array;
  readonly segments: readonly SegmentInfo[];
  readonly structuredAppend?: StructuredAppendInfo;
  /** Default `'qr'`. */
  readonly symbol?: SymbolType;
}

/**
 * Immutable symbol, independent of encoder and renderer. The name is historical: it holds QR Code,
 * Micro QR Code and rMQR symbols. Coordinates are (x = column, y = row) with the origin at the
 * top-left module, *without* quiet zone.
 */
export class QRMatrix {
  /** Modules per row. For square symbols (QR, Micro QR) this is also the height. */
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly symbol: SymbolType;
  readonly version: number;
  /** `M3`, `R9x59`, or the QR version number as text. */
  readonly designation: string;
  readonly ecc: ErrorCorrectionLevel;
  readonly mask: MaskPattern;
  readonly segments: readonly SegmentInfo[];
  readonly structuredAppend: StructuredAppendInfo | undefined;
  readonly #modules: Uint8Array;
  readonly #kinds: Uint8Array;

  constructor(init: QRMatrixInit) {
    const symbol = init.symbol ?? 'qr';
    let width: number;
    let height: number;
    if (symbol === 'micro') {
      if (!Number.isInteger(init.version) || init.version < 1 || init.version > MAX_MICRO_VERSION) {
        throw new InvalidInputError('A Micro QR version must be an integer from 1 to 4.');
      }
      width = height = init.version * 2 + 9;
    } else if (symbol === 'rmqr') {
      const dims = RMQR_SIZES.at(init.version - 1);
      if (
        !Number.isInteger(init.version) ||
        init.version < 1 ||
        init.version > MAX_RMQR_VERSION ||
        dims === undefined
      ) {
        throw new InvalidInputError('An rMQR version must be an integer from 1 to 32.');
      }
      [width, height] = dims;
    } else {
      if (!Number.isInteger(init.version) || init.version < 1 || init.version > 40) {
        throw new InvalidInputError('QRMatrix version must be an integer from 1 to 40.');
      }
      width = height = init.version * 4 + 17;
    }
    if (init.modules.length !== width * height || init.kinds.length !== width * height) {
      throw new InvalidInputError(`QRMatrix buffers must hold ${String(width * height)} modules.`);
    }
    this.symbol = symbol;
    this.width = width;
    this.height = height;
    this.size = width;
    this.version = init.version;
    this.designation = designationOf(symbol, init.version);
    this.ecc = init.ecc;
    this.mask = init.mask;
    this.segments = Object.freeze(init.segments.map((s) => Object.freeze({ ...s })));
    this.structuredAppend =
      init.structuredAppend === undefined ? undefined : Object.freeze({ ...init.structuredAppend });
    this.#modules = init.modules.slice();
    this.#kinds = init.kinds.slice();
  }

  /** True when the module at (x, y) is dark. Out-of-range coordinates are light. */
  get(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    return this.#modules[y * this.width + x] === 1;
  }

  /** Role of the module at (x, y). Throws for out-of-range coordinates. */
  kind(x: number, y: number): ModuleKind {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new InvalidInputError('Module coordinates are out of range.');
    }
    return MODULE_KINDS[this.#kinds[y * this.width + x] ?? 0] ?? 'data';
  }

  /** True for every module that is part of a function pattern (anything but data). */
  isFunction(x: number, y: number): boolean {
    return this.kind(x, y) !== 'data';
  }

  /** A copy of the matrix as rows of booleans (row-major). */
  toRows(): boolean[][] {
    const rows: boolean[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.width; x++) row.push(this.#modules[y * this.width + x] === 1);
      rows.push(row);
    }
    return rows;
  }
}
