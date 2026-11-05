/**
 * rMQR error correction structure and alignment pattern columns (ISO/IEC 23941 Tables 8 and D.1)
 * and the widths of the character count fields (Table 3). The numbers were checked against the
 * reference symbols of the test suite (tests/fixtures/micro-rmqr) and by decoding generated symbols
 * with an independent decoder.
 */

/** Error correction of one level: `eccPerBlock` codewords per block; `blocks` are `[count, data codewords]` groups. */
export interface RmqrEcc {
  readonly eccPerBlock: number;
  readonly blocks: readonly (readonly [count: number, data: number])[];
}

export interface RmqrVersionData {
  /** Columns of the alignment patterns' centres; the vertical timing patterns run through them. */
  readonly centers: readonly number[];
  readonly M: RmqrEcc;
  readonly H: RmqrEcc;
}

/** Version 1 … 32, in the order of `RMQR_SIZES`. */
export const RMQR_VERSIONS: readonly RmqrVersionData[] = [
  // R7x43
  {
    centers: [21],
    M: { eccPerBlock: 7, blocks: [[1, 6]] },
    H: { eccPerBlock: 10, blocks: [[1, 3]] },
  },
  // R7x59
  {
    centers: [19, 39],
    M: { eccPerBlock: 9, blocks: [[1, 12]] },
    H: { eccPerBlock: 14, blocks: [[1, 7]] },
  },
  // R7x77
  {
    centers: [25, 51],
    M: { eccPerBlock: 12, blocks: [[1, 20]] },
    H: { eccPerBlock: 22, blocks: [[1, 10]] },
  },
  // R7x99
  {
    centers: [23, 49, 75],
    M: { eccPerBlock: 16, blocks: [[1, 28]] },
    H: { eccPerBlock: 30, blocks: [[1, 14]] },
  },
  // R7x139
  {
    centers: [27, 55, 83, 111],
    M: { eccPerBlock: 24, blocks: [[1, 44]] },
    H: { eccPerBlock: 22, blocks: [[2, 12]] },
  },
  // R9x43
  {
    centers: [21],
    M: { eccPerBlock: 9, blocks: [[1, 12]] },
    H: { eccPerBlock: 14, blocks: [[1, 7]] },
  },
  // R9x59
  {
    centers: [19, 39],
    M: { eccPerBlock: 12, blocks: [[1, 21]] },
    H: { eccPerBlock: 22, blocks: [[1, 11]] },
  },
  // R9x77
  {
    centers: [25, 51],
    M: { eccPerBlock: 18, blocks: [[1, 31]] },
    H: {
      eccPerBlock: 16,
      blocks: [
        [1, 8],
        [1, 9],
      ],
    },
  },
  // R9x99
  {
    centers: [23, 49, 75],
    M: { eccPerBlock: 24, blocks: [[1, 42]] },
    H: { eccPerBlock: 22, blocks: [[2, 11]] },
  },
  // R9x139
  {
    centers: [27, 55, 83, 111],
    M: {
      eccPerBlock: 18,
      blocks: [
        [1, 31],
        [1, 32],
      ],
    },
    H: { eccPerBlock: 22, blocks: [[3, 11]] },
  },
  // R11x27
  {
    centers: [],
    M: { eccPerBlock: 8, blocks: [[1, 7]] },
    H: { eccPerBlock: 10, blocks: [[1, 5]] },
  },
  // R11x43
  {
    centers: [21],
    M: { eccPerBlock: 12, blocks: [[1, 19]] },
    H: { eccPerBlock: 20, blocks: [[1, 11]] },
  },
  // R11x59
  {
    centers: [19, 39],
    M: { eccPerBlock: 16, blocks: [[1, 31]] },
    H: {
      eccPerBlock: 16,
      blocks: [
        [1, 7],
        [1, 8],
      ],
    },
  },
  // R11x77
  {
    centers: [25, 51],
    M: { eccPerBlock: 24, blocks: [[1, 43]] },
    H: {
      eccPerBlock: 22,
      blocks: [
        [1, 11],
        [1, 12],
      ],
    },
  },
  // R11x99
  {
    centers: [23, 49, 75],
    M: {
      eccPerBlock: 16,
      blocks: [
        [1, 28],
        [1, 29],
      ],
    },
    H: {
      eccPerBlock: 30,
      blocks: [
        [1, 14],
        [1, 15],
      ],
    },
  },
  // R11x139
  {
    centers: [27, 55, 83, 111],
    M: { eccPerBlock: 24, blocks: [[2, 42]] },
    H: { eccPerBlock: 30, blocks: [[3, 14]] },
  },
  // R13x27
  {
    centers: [],
    M: { eccPerBlock: 9, blocks: [[1, 12]] },
    H: { eccPerBlock: 14, blocks: [[1, 7]] },
  },
  // R13x43
  {
    centers: [21],
    M: { eccPerBlock: 14, blocks: [[1, 27]] },
    H: { eccPerBlock: 28, blocks: [[1, 13]] },
  },
  // R13x59
  {
    centers: [19, 39],
    M: { eccPerBlock: 22, blocks: [[1, 38]] },
    H: { eccPerBlock: 20, blocks: [[2, 10]] },
  },
  // R13x77
  {
    centers: [25, 51],
    M: {
      eccPerBlock: 16,
      blocks: [
        [1, 26],
        [1, 27],
      ],
    },
    H: {
      eccPerBlock: 28,
      blocks: [
        [1, 14],
        [1, 15],
      ],
    },
  },
  // R13x99
  {
    centers: [23, 49, 75],
    M: {
      eccPerBlock: 20,
      blocks: [
        [1, 36],
        [1, 37],
      ],
    },
    H: {
      eccPerBlock: 26,
      blocks: [
        [1, 11],
        [2, 12],
      ],
    },
  },
  // R13x139
  {
    centers: [27, 55, 83, 111],
    M: {
      eccPerBlock: 20,
      blocks: [
        [2, 35],
        [1, 36],
      ],
    },
    H: {
      eccPerBlock: 28,
      blocks: [
        [2, 13],
        [2, 14],
      ],
    },
  },
  // R15x43
  {
    centers: [21],
    M: { eccPerBlock: 18, blocks: [[1, 33]] },
    H: {
      eccPerBlock: 18,
      blocks: [
        [1, 7],
        [1, 8],
      ],
    },
  },
  // R15x59
  {
    centers: [19, 39],
    M: { eccPerBlock: 26, blocks: [[1, 48]] },
    H: { eccPerBlock: 24, blocks: [[2, 13]] },
  },
  // R15x77
  {
    centers: [25, 51],
    M: {
      eccPerBlock: 18,
      blocks: [
        [1, 33],
        [1, 34],
      ],
    },
    H: {
      eccPerBlock: 24,
      blocks: [
        [2, 10],
        [1, 11],
      ],
    },
  },
  // R15x99
  {
    centers: [23, 49, 75],
    M: { eccPerBlock: 24, blocks: [[2, 44]] },
    H: { eccPerBlock: 22, blocks: [[4, 12]] },
  },
  // R15x139
  {
    centers: [27, 55, 83, 111],
    M: {
      eccPerBlock: 24,
      blocks: [
        [2, 42],
        [1, 43],
      ],
    },
    H: {
      eccPerBlock: 26,
      blocks: [
        [1, 13],
        [4, 14],
      ],
    },
  },
  // R17x43
  {
    centers: [21],
    M: { eccPerBlock: 22, blocks: [[1, 39]] },
    H: {
      eccPerBlock: 20,
      blocks: [
        [1, 10],
        [1, 11],
      ],
    },
  },
  // R17x59
  {
    centers: [19, 39],
    M: { eccPerBlock: 16, blocks: [[2, 28]] },
    H: { eccPerBlock: 30, blocks: [[2, 14]] },
  },
  // R17x77
  {
    centers: [25, 51],
    M: { eccPerBlock: 22, blocks: [[2, 39]] },
    H: {
      eccPerBlock: 28,
      blocks: [
        [1, 12],
        [2, 13],
      ],
    },
  },
  // R17x99
  {
    centers: [23, 49, 75],
    M: {
      eccPerBlock: 20,
      blocks: [
        [2, 33],
        [1, 34],
      ],
    },
    H: { eccPerBlock: 26, blocks: [[4, 14]] },
  },
  // R17x139
  {
    centers: [27, 55, 83, 111],
    M: { eccPerBlock: 20, blocks: [[4, 38]] },
    H: {
      eccPerBlock: 26,
      blocks: [
        [2, 12],
        [4, 13],
      ],
    },
  },
];

/** Width of the character count field per version (index 0 = R7x43). */
export const RMQR_COUNT_BITS = {
  numeric: [
    4, 5, 6, 7, 7, 5, 6, 7, 7, 8, 4, 6, 7, 7, 8, 8, 5, 6, 7, 7, 8, 8, 7, 7, 8, 8, 9, 7, 8, 8, 8, 9,
  ],
  alphanumeric: [
    3, 5, 5, 6, 6, 5, 5, 6, 6, 7, 4, 5, 6, 6, 7, 7, 5, 6, 6, 7, 7, 8, 6, 7, 7, 7, 8, 6, 7, 7, 8, 8,
  ],
  byte: [
    3, 4, 5, 5, 6, 4, 5, 5, 6, 6, 3, 5, 5, 6, 6, 7, 4, 5, 6, 6, 7, 7, 6, 6, 7, 7, 7, 6, 6, 7, 7, 8,
  ],
  kanji: [
    2, 3, 4, 5, 5, 3, 4, 5, 5, 6, 2, 4, 5, 5, 6, 6, 3, 5, 5, 6, 6, 7, 5, 5, 6, 6, 7, 5, 6, 6, 6, 7,
  ],
} as const;
