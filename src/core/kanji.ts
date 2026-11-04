/**
 * Kanji mode packs each double-byte Shift JIS character into 13 bits. The
 * mapping from Unicode to Shift JIS is supplied by a {@link KanjiMapper} so
 * `core` stays free of runtime APIs and large tables.
 */
export interface KanjiMapper {
  /**
   * Shift JIS double-byte code (e.g. `0x93fa` for 日) of a Unicode code point
   * that Kanji mode can represent, otherwise `undefined`.
   */
  shiftJisCode(codePoint: number): number | undefined;
}

/**
 * The 13-bit value of a Shift JIS code in Kanji mode, or `undefined` when the
 * code lies outside the two ranges Kanji mode defines (0x8140–0x9FFC and
 * 0xE040–0xEBBF) or has an invalid trail byte.
 */
export function kanjiValue(code: number): number | undefined {
  const trail = code & 0xff;
  if (trail < 0x40 || trail === 0x7f || trail > 0xfc) return undefined;
  let subtracted: number;
  if (code >= 0x8140 && code <= 0x9ffc) subtracted = code - 0x8140;
  else if (code >= 0xe040 && code <= 0xebbf) subtracted = code - 0xc140;
  else return undefined;
  return (subtracted >> 8) * 0xc0 + (subtracted & 0xff);
}
