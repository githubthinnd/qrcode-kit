import { InvalidInputError } from './errors.js';
import {
  MODULE_KINDS,
  type ErrorCorrectionLevel,
  type MaskPattern,
  type ModuleKind,
  type SegmentInfo,
  type StructuredAppendInfo,
} from './model.js';

export interface QRMatrixInit {
  readonly version: number;
  readonly ecc: ErrorCorrectionLevel;
  readonly mask: MaskPattern;
  /** `size * size` entries, row-major, 1 = dark. Copied. */
  readonly modules: Uint8Array;
  /** `size * size` entries, indices into {@link MODULE_KINDS}. Copied. */
  readonly kinds: Uint8Array;
  readonly segments: readonly SegmentInfo[];
  readonly structuredAppend?: StructuredAppendInfo;
}

/**
 * Immutable QR Code symbol, independent of encoder and renderer.
 * Coordinates are (x = column, y = row) with the origin at the top-left module,
 * *without* quiet zone.
 */
export class QRMatrix {
  readonly size: number;
  readonly version: number;
  readonly ecc: ErrorCorrectionLevel;
  readonly mask: MaskPattern;
  readonly segments: readonly SegmentInfo[];
  readonly structuredAppend: StructuredAppendInfo | undefined;
  readonly #modules: Uint8Array;
  readonly #kinds: Uint8Array;

  constructor(init: QRMatrixInit) {
    const size = init.version * 4 + 17;
    if (!Number.isInteger(init.version) || init.version < 1 || init.version > 40) {
      throw new InvalidInputError('QRMatrix version must be an integer from 1 to 40.');
    }
    if (init.modules.length !== size * size || init.kinds.length !== size * size) {
      throw new InvalidInputError(`QRMatrix buffers must hold ${String(size * size)} modules.`);
    }
    this.size = size;
    this.version = init.version;
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
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
    return this.#modules[y * this.size + x] === 1;
  }

  /** Role of the module at (x, y). Throws for out-of-range coordinates. */
  kind(x: number, y: number): ModuleKind {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) {
      throw new InvalidInputError('Module coordinates are out of range.');
    }
    return MODULE_KINDS[this.#kinds[y * this.size + x] ?? 0] ?? 'data';
  }

  /** True for every module that is part of a function pattern (anything but data). */
  isFunction(x: number, y: number): boolean {
    return this.kind(x, y) !== 'data';
  }

  /** A copy of the matrix as rows of booleans (row-major). */
  toRows(): boolean[][] {
    const rows: boolean[][] = [];
    for (let y = 0; y < this.size; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.size; x++) row.push(this.#modules[y * this.size + x] === 1);
      rows.push(row);
    }
    return rows;
  }
}
