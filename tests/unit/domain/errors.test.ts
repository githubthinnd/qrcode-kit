import { describe, expect, it } from 'vitest';
import {
  EncodingError,
  ExportError,
  InvalidConfigurationError,
  InvalidInputError,
  PluginError,
  ProviderConflictError,
  ProviderNotFoundError,
  QRCodeKitError,
  RenderingError,
  RuntimeUnavailableError,
  UnsupportedCapabilityError,
  UnsupportedDataError,
  isQRCodeKitError,
  type ErrorCode,
} from '../../../src/index.js';

const cases: readonly [new (message: string) => QRCodeKitError, ErrorCode][] = [
  [InvalidInputError, 'INVALID_INPUT'],
  [UnsupportedDataError, 'UNSUPPORTED_DATA'],
  [InvalidConfigurationError, 'INVALID_CONFIGURATION'],
  [ProviderNotFoundError, 'PROVIDER_NOT_FOUND'],
  [ProviderConflictError, 'PROVIDER_CONFLICT'],
  [UnsupportedCapabilityError, 'UNSUPPORTED_CAPABILITY'],
  [EncodingError, 'ENCODING_FAILED'],
  [RenderingError, 'RENDERING_FAILED'],
  [ExportError, 'EXPORT_FAILED'],
  [RuntimeUnavailableError, 'RUNTIME_UNAVAILABLE'],
  [PluginError, 'PLUGIN_FAILED'],
];

describe('error model', () => {
  it.each(cases)('%o carries the code %s and is a QRCodeKitError', (Ctor, code) => {
    const error = new Ctor('boom');
    expect(error).toBeInstanceOf(Ctor);
    expect(error).toBeInstanceOf(QRCodeKitError);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(code);
    expect(error.name).toBe(Ctor.name);
    expect(error.message).toBe('boom');
  });

  it('uses a distinct code for every error class', () => {
    const codes = cases.map(([, code]) => code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('preserves the underlying cause', () => {
    const cause = new RangeError('low level');
    const error = new EncodingError('encode failed', { cause });
    expect(error.cause).toBe(cause);
  });

  it('has no cause property value when none is given', () => {
    expect(new EncodingError('x').cause).toBeUndefined();
  });

  it('freezes a defensive copy of details', () => {
    const details = { length: 12, kind: 'url' };
    const error = new InvalidInputError('bad', { details });
    expect(error.details).toEqual({ length: 12, kind: 'url' });
    expect(Object.isFrozen(error.details)).toBe(true);
    details.length = 99;
    expect(error.details['length']).toBe(12);
  });

  it('defaults details to an empty frozen object', () => {
    const error = new InvalidInputError('bad');
    expect(error.details).toEqual({});
    expect(Object.isFrozen(error.details)).toBe(true);
  });

  describe('isQRCodeKitError', () => {
    it('recognises library errors', () => {
      expect(isQRCodeKitError(new PluginError('x'))).toBe(true);
    });

    it('recognises errors from another copy of the package via the brand', () => {
      const foreign = Object.assign(new Error('x'), { [Symbol.for('qrcode-toolkit.error')]: true });
      expect(isQRCodeKitError(foreign)).toBe(true);
    });

    it.each([[new Error('plain')], [null], [undefined], ['string'], [42], [{}]])(
      'rejects %o',
      (value) => {
        expect(isQRCodeKitError(value)).toBe(false);
      },
    );
  });
});
