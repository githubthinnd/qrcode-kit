import type {
  EncodeRequest,
  EncoderProvider,
  StructuredAppendRequest,
} from '../../../contracts/encoder.js';
import { PROVIDER_API_VERSION } from '../../../contracts/common.js';
import type { KanjiMapper } from '../../../core/kanji.js';
import { encodeCompactSymbol } from '../../../core/compact-symbol.js';
import {
  encodeBytesSymbol,
  encodeSegmentsSymbol,
  encodeStructuredAppendSequence,
  encodeTextSymbol,
} from '../../../core/symbol.js';
import type { QRMatrix } from '../../../domain/matrix.js';
import { createShiftJisKanjiMapper } from './shift-jis-mapper.js';

export interface DefaultEncoderOptions {
  /**
   * Unicode → Shift JIS mapping for Kanji mode. Default: derived from the
   * platform's `TextDecoder('shift_jis')` on first use.
   */
  readonly kanji?: KanjiMapper;
}

export const DEFAULT_ENCODER_ID = 'qrcode-toolkit/encoder';

/**
 * The built-in encoder: QR Code Model 2 (versions 1–40, all four modes, ECI, FNC1, structured
 * append), Micro QR Code (M1–M4) and rMQR (R7x43 … R17x139).
 */
export function createDefaultEncoder(options: DefaultEncoderOptions = {}): EncoderProvider {
  const kanji = options.kanji ?? createShiftJisKanjiMapper();

  return {
    id: DEFAULT_ENCODER_ID,
    apiVersion: PROVIDER_API_VERSION,
    capabilities: {
      modes: ['numeric', 'alphanumeric', 'byte', 'kanji'],
      charsets: ['utf-8', 'iso-8859-1'],
      eci: true,
      fnc1: true,
      structuredAppend: true,
      symbols: ['qr', 'micro', 'rmqr'],
      maskControl: true,
      maskScoring: ['standard', 'fast'],
      boostEcc: true,
      sync: true,
    },

    encode(request: EncodeRequest): QRMatrix {
      const core = {
        ecc: request.ecc,
        minVersion: request.minVersion,
        maxVersion: request.maxVersion,
        mask: request.mask,
        maskScoring: request.maskScoring,
        boostEcc: request.boostEcc,
      };
      const { input } = request;
      if (request.symbol !== 'qr') {
        const compact = {
          ecc: request.ecc,
          minVersion: request.minVersion,
          maxVersion: request.maxVersion,
          mask: request.mask,
          boostEcc: request.boostEcc,
          fnc1: request.fnc1,
        };
        switch (input.kind) {
          case 'text':
            return encodeCompactSymbol(
              request.symbol,
              {
                kind: 'text',
                text: input.text,
                charset: input.charset,
                eci: input.eci,
                kanji: input.kanji ? kanji : undefined,
              },
              compact,
            );
          case 'bytes':
            return encodeCompactSymbol(
              request.symbol,
              { kind: 'bytes', bytes: input.bytes, eci: input.eci },
              compact,
            );
          case 'segments':
            return encodeCompactSymbol(
              request.symbol,
              { kind: 'segments', segments: input.segments, kanji },
              compact,
            );
        }
      }
      switch (input.kind) {
        case 'text':
          return encodeTextSymbol(input.text, {
            ...core,
            charset: input.charset,
            eci: input.eci,
            fnc1: request.fnc1,
            kanji: input.kanji ? kanji : undefined,
          });
        case 'bytes':
          return encodeBytesSymbol(input.bytes, { ...core, eci: input.eci, fnc1: request.fnc1 });
        case 'segments':
          return encodeSegmentsSymbol(
            [
              ...(request.fnc1 === undefined
                ? []
                : [
                    request.fnc1.position === 'first'
                      ? ({ mode: 'fnc1-first' } as const)
                      : ({
                          mode: 'fnc1-second',
                          applicationIndicator: request.fnc1.applicationIndicator,
                        } as const),
                  ]),
              ...input.segments,
            ],
            { ...core, kanji },
          );
      }
    },

    encodeStructuredAppend(request: StructuredAppendRequest): readonly QRMatrix[] {
      return encodeStructuredAppendSequence(request.data, {
        ecc: request.ecc,
        minVersion: request.minVersion,
        maxVersion: request.maxVersion,
        mask: request.mask,
        maskScoring: request.maskScoring,
        boostEcc: request.boostEcc,
        charset: request.charset,
        symbols: request.symbols,
      });
    },
  };
}
