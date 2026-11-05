import type { Diagnostic, Rgba } from '../contracts/common.js';
import type { GradientSpec, LogoSpec, ModuleShape } from '../contracts/renderer.js';
import type { EncodeInput, EncodeRequest, StructuredAppendRequest } from '../contracts/encoder.js';
import { InvalidConfigurationError, InvalidInputError } from '../domain/errors.js';
import {
  ERROR_CORRECTION_LEVELS,
  MASK_PATTERNS,
  MAX_VERSION,
  MIN_VERSION,
  type ErrorCorrectionLevel,
  type MaskPattern,
} from '../domain/model.js';
import type { Segment } from '../domain/segment.js';
import { contrastRatio, luminanceOf, parseColor } from './colors.js';
import {
  APPEARANCE_OPTION_KEYS,
  OUTPUT_OPTION_KEYS,
  SYMBOL_OPTION_KEYS,
  type AppearanceOptions,
  type GenerateRequest,
  type OutputOptions,
  type StructuredAppendGenerateRequest,
  type SymbolOptions,
} from './request.js';

export interface KitLimits {
  /** Largest accepted input: characters of text, bytes, or total segment size. */
  readonly maxInputLength: number;
  /** Largest raster area (width × height, in pixels) a renderer may allocate. */
  readonly maxPixels: number;
}

export const DEFAULT_LIMITS: KitLimits = { maxInputLength: 65_536, maxPixels: 16_777_216 };

/** What a request needs from the providers; checked before anything runs. */
export interface Requirements {
  readonly encoder: readonly (
    'eci' | 'kanji' | 'fnc1' | 'maskControl' | 'boostEcc' | 'iso-8859-1' | 'structuredAppend'
  )[];
  readonly transparency: boolean;
  readonly colors: boolean;
  readonly quality: boolean;
  readonly path: boolean;
  /** Styling a renderer must support: a non-square shape, a gradient, a logo. */
  readonly shape: ModuleShape;
  readonly gradient: boolean;
  readonly logo: boolean;
}

export interface ResolvedAppearance {
  readonly quietZone: number;
  readonly scale: number | undefined;
  readonly size: number | undefined;
  readonly dark: Rgba;
  readonly light: Rgba;
  readonly invert: boolean;
  readonly moduleShape: ModuleShape;
  readonly gradient: GradientSpec | undefined;
  readonly logo: LogoSpec | undefined;
}

export interface ResolvedOutput {
  readonly format: string;
  readonly quality: number | undefined;
  readonly path: string | undefined;
  readonly providers: { encoder?: string; renderer?: string; exporter?: string };
}

export interface Prepared<R> {
  readonly encode: R;
  readonly appearance: ResolvedAppearance;
  readonly output: ResolvedOutput;
  readonly requirements: Requirements;
  readonly warnings: readonly Diagnostic[];
}

function assertKnownKeys(request: object, allowed: readonly string[]): void {
  const unknown = Object.keys(request).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new InvalidConfigurationError(
      `Unknown option${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Options are never ignored silently.`,
      { details: { options: unknown.join(', ') } },
    );
  }
}

function integerOption(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new InvalidInputError(
      `Option "${name}" must be an integer from ${String(min)} to ${String(max)}.`,
      {
        details: { option: name },
      },
    );
  }
  return value;
}

function resolveEcc(value: unknown): ErrorCorrectionLevel {
  if (value === undefined) return 'M';
  if (typeof value === 'string' && (ERROR_CORRECTION_LEVELS as readonly string[]).includes(value)) {
    return value as ErrorCorrectionLevel;
  }
  throw new InvalidInputError('Option "ecc" must be one of "L", "M", "Q", "H".', {
    details: { option: 'ecc' },
  });
}

function resolveVersions(value: SymbolOptions['version']): { min: number; max: number } {
  if (value === undefined) return { min: MIN_VERSION, max: MAX_VERSION };
  if (typeof value === 'number') {
    const exact = integerOption(value, 'version', MIN_VERSION, MAX_VERSION);
    return { min: exact, max: exact };
  }
  const min =
    value.min === undefined
      ? MIN_VERSION
      : integerOption(value.min, 'version.min', MIN_VERSION, MAX_VERSION);
  const max =
    value.max === undefined
      ? MAX_VERSION
      : integerOption(value.max, 'version.max', MIN_VERSION, MAX_VERSION);
  if (min > max) throw new InvalidInputError('Option "version": min must not exceed max.');
  return { min, max };
}

function resolveMask(value: unknown): MaskPattern | undefined {
  if (value === undefined || value === 'auto') return undefined;
  if (typeof value === 'number' && (MASK_PATTERNS as readonly number[]).includes(value))
    return value as MaskPattern;
  throw new InvalidInputError('Option "mask" must be "auto" or an integer from 0 to 7.', {
    details: { option: 'mask' },
  });
}

function booleanOption(value: unknown, name: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean')
    throw new InvalidInputError(`Option "${name}" must be a boolean.`, {
      details: { option: name },
    });
  return value;
}

const MODULE_SHAPES: readonly ModuleShape[] = ['square', 'rounded', 'dots'];

function resolveModuleShape(value: unknown): ModuleShape {
  if (value === undefined) return 'square';
  if (typeof value === 'string' && (MODULE_SHAPES as readonly string[]).includes(value)) {
    return value as ModuleShape;
  }
  throw new InvalidInputError('Option "moduleShape" must be "square", "rounded" or "dots".', {
    details: { option: 'moduleShape' },
  });
}

function knownKeys(value: object, allowed: readonly string[], option: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new InvalidConfigurationError(
      `Unknown "${option}" option${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Options are never ignored silently.`,
      { details: { options: unknown.join(', ') } },
    );
  }
}

function resolveGradient(
  request: AppearanceOptions,
  warnings: Diagnostic[],
  light: Rgba,
): GradientSpec | undefined {
  const value: unknown = request.gradient;
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) {
    throw new InvalidInputError(
      'Option "gradient" must be an object { from, to, type?, angle? }.',
      {
        details: { option: 'gradient' },
      },
    );
  }
  knownKeys(value, ['from', 'to', 'type', 'angle'], 'gradient');
  if (request.dark !== undefined) {
    throw new InvalidConfigurationError(
      'Options "gradient" and "dark" are mutually exclusive: the gradient replaces the dark colour.',
    );
  }
  if (request.invert === true) {
    throw new InvalidConfigurationError('A "gradient" cannot be combined with "invert".');
  }
  const g = value as { from?: unknown; to?: unknown; type?: unknown; angle?: unknown };
  if (typeof g.from !== 'string' || typeof g.to !== 'string') {
    throw new InvalidInputError('"gradient.from" and "gradient.to" must be colour strings.', {
      details: { option: 'gradient' },
    });
  }
  const type = g.type === undefined ? 'linear' : g.type;
  if (type !== 'linear' && type !== 'radial') {
    throw new InvalidInputError('"gradient.type" must be "linear" or "radial".', {
      details: { option: 'gradient.type' },
    });
  }
  const angle = g.angle === undefined ? 45 : integerOption(g.angle, 'gradient.angle', 0, 360);
  const from = parseColor(g.from, 'gradient.from');
  const to = parseColor(g.to, 'gradient.to');
  if (from.a === 0 || to.a === 0) {
    throw new InvalidInputError('Gradient colours cannot be fully transparent.', {
      details: { option: 'gradient' },
    });
  }
  if (light.a === 255 && from.a === 255 && to.a === 255) {
    const weakest = Math.min(contrastRatio(from, light), contrastRatio(to, light));
    if (weakest < 3) {
      warnings.push({
        code: 'LOW_CONTRAST',
        message:
          'A gradient stop has less than 3:1 contrast against the light colour; the code may not scan reliably.',
      });
    }
  }
  return { type, from, to, angle };
}

const LOGO_HREF = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_LOGO_HREF = 262_144;

function resolveLogo(value: unknown): LogoSpec | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) {
    throw new InvalidInputError('Option "logo" must be an object { href, size?, margin? }.', {
      details: { option: 'logo' },
    });
  }
  knownKeys(value, ['href', 'size', 'margin'], 'logo');
  const l = value as { href?: unknown; size?: unknown; margin?: unknown };
  if (typeof l.href !== 'string' || l.href.length > MAX_LOGO_HREF || !LOGO_HREF.test(l.href)) {
    throw new InvalidInputError(
      `"logo.href" must be a base64 data URL of a png, jpeg, webp, gif or svg image (at most ${String(MAX_LOGO_HREF)} characters).`,
      { details: { option: 'logo.href' } },
    );
  }
  const size = l.size === undefined ? 0.2 : l.size;
  if (typeof size !== 'number' || !(size >= 0.05 && size <= 0.3)) {
    throw new InvalidInputError('"logo.size" must be a number from 0.05 to 0.3.', {
      details: { option: 'logo.size' },
    });
  }
  const margin = l.margin === undefined ? 1 : integerOption(l.margin, 'logo.margin', 0, 4);
  return { href: l.href, size, margin };
}

function resolveAppearance(
  request: AppearanceOptions,
  warnings: Diagnostic[],
): { appearance: ResolvedAppearance; explicitColors: boolean } {
  const quietZone =
    request.quietZone === undefined ? 4 : integerOption(request.quietZone, 'quietZone', 0, 64);
  if (quietZone < 4) {
    warnings.push({
      code: 'QUIET_ZONE_SMALL',
      message: `A quiet zone of ${String(quietZone)} modules is below the 4 modules the standard requires; some scanners may fail.`,
    });
  }
  if (request.scale !== undefined && request.size !== undefined) {
    throw new InvalidConfigurationError('Options "scale" and "size" are mutually exclusive.');
  }
  const scale =
    request.scale === undefined ? undefined : integerOption(request.scale, 'scale', 1, 4096);
  const size =
    request.size === undefined ? undefined : integerOption(request.size, 'size', 1, 1_000_000);
  const dark = parseColor(request.dark ?? '#000000', 'dark');
  const light = parseColor(request.light ?? '#ffffff', 'light');
  const invert = booleanOption(request.invert, 'invert');

  const moduleShape = resolveModuleShape(request.moduleShape);
  if (moduleShape === 'dots') {
    warnings.push({
      code: 'DOT_MODULES',
      message:
        'Dot modules are read by fewer scanners than square or rounded modules (jsQR cannot read them). Test with the scanners your audience uses, or choose "rounded".',
    });
  }
  const gradient = resolveGradient(request, warnings, light);
  const logo = resolveLogo(request.logo);

  const shownDark = invert ? light : dark;
  const shownLight = invert ? dark : light;
  if (shownDark.a === 255 && shownLight.a === 255) {
    if (contrastRatio(shownDark, shownLight) < 3) {
      warnings.push({
        code: 'LOW_CONTRAST',
        message:
          'The contrast between dark and light colours is below 3:1; the code may not scan reliably.',
      });
    }
    if (luminanceOf(shownDark) > luminanceOf(shownLight)) {
      warnings.push({
        code: 'INVERTED_POLARITY',
        message:
          'Modules are lighter than the background. The standard specifies dark modules on a light background; many scanners cannot read inverted codes.',
      });
    }
  }
  return {
    appearance: { quietZone, scale, size, dark, light, invert, moduleShape, gradient, logo },
    explicitColors: request.dark !== undefined || request.light !== undefined,
  };
}

function resolveOutput(request: OutputOptions): ResolvedOutput {
  const format = request.format ?? 'svg';
  if (typeof format !== 'string' || format.length === 0) {
    throw new InvalidInputError('Option "format" must be a non-empty string.');
  }
  if (
    request.quality !== undefined &&
    (typeof request.quality !== 'number' || !(request.quality >= 0 && request.quality <= 1))
  ) {
    throw new InvalidInputError('Option "quality" must be a number from 0 to 1.');
  }
  if (
    request.path !== undefined &&
    (typeof request.path !== 'string' || request.path.length === 0 || request.path.includes('\0'))
  ) {
    throw new InvalidInputError('Option "path" must be a non-empty string without NUL characters.');
  }
  const providers: { encoder?: string; renderer?: string; exporter?: string } = {};
  for (const key of ['encoder', 'renderer', 'exporter'] as const) {
    const id = request.providers?.[key];
    if (id !== undefined) {
      if (typeof id !== 'string')
        throw new InvalidInputError(`Option "providers.${key}" must be a provider id string.`);
      providers[key] = id;
    }
  }
  return { format, quality: request.quality, path: request.path, providers };
}

function checkSize(length: number, limits: KitLimits): void {
  if (length > limits.maxInputLength) {
    throw new InvalidInputError(
      `Input is too large (${String(length)} > ${String(limits.maxInputLength)}). Raise the "maxInputLength" limit of the kit if this is intended.`,
      { details: { length, limit: limits.maxInputLength } },
    );
  }
}

function segmentLength(segment: Segment): number {
  switch (segment.mode) {
    case 'numeric':
    case 'alphanumeric':
    case 'kanji':
      return segment.text.length;
    case 'byte':
      return segment.bytes.length;
    default:
      return 1;
  }
}

const DATA_MODES: readonly string[] = ['numeric', 'alphanumeric', 'byte', 'kanji'];

/** Shape of every segment, and the FNC1 rules of ISO/IEC 18004 §7.4.8 that do not depend on the encoder. */
function assertSegmentShapes(segments: readonly Segment[]): void {
  let fnc1 = 0;
  let sawData = false;
  (segments as readonly unknown[]).forEach((raw, index) => {
    const at = `Segment ${String(index)}`;
    if (typeof raw !== 'object' || raw === null) {
      throw new InvalidInputError(`${at} must be an object such as segment.numeric("123").`, {
        details: { segment: index },
      });
    }
    const item = raw as Record<string, unknown>;
    const mode = item['mode'];
    const need = (ok: boolean, what: string): void => {
      if (!ok) {
        throw new InvalidInputError(`${at} (${String(mode)}) needs ${what}.`, {
          details: { segment: index },
        });
      }
    };
    switch (mode) {
      case 'numeric':
      case 'alphanumeric':
      case 'kanji':
        need(typeof item['text'] === 'string', 'a "text" string');
        break;
      case 'byte':
        need(item['bytes'] instanceof Uint8Array, 'a "bytes" Uint8Array');
        break;
      case 'eci':
        need(typeof item['assignment'] === 'number', 'an "assignment" number');
        break;
      case 'fnc1-first':
        break;
      case 'fnc1-second':
        need(typeof item['applicationIndicator'] === 'number', 'an "applicationIndicator" number');
        break;
      default:
        throw new InvalidInputError(
          `${at} has an unknown mode. Use numeric, alphanumeric, byte, kanji, eci, fnc1-first or fnc1-second.`,
          { details: { segment: index } },
        );
    }
    if (typeof mode === 'string' && DATA_MODES.includes(mode)) sawData = true;
    if (mode === 'fnc1-first' || mode === 'fnc1-second') {
      fnc1++;
      if (fnc1 > 1) {
        throw new InvalidInputError(
          `${at}: a symbol can carry only one FNC1 marker (first or second position, not both).`,
          { details: { segment: index } },
        );
      }
      if (sawData) {
        throw new InvalidInputError(`${at}: an FNC1 marker must come before any data segment.`, {
          details: { segment: index },
        });
      }
    }
  });
}

function assertSegmentsNotEmpty(segments: readonly Segment[]): void {
  segments.forEach((segment, index) => {
    if (segmentLength(segment) === 0) {
      throw new InvalidInputError(`Segment ${String(index)} (${segment.mode}) must not be empty.`, {
        details: { segment: index },
      });
    }
  });
}

/**
 * FNC1 second-position application indicator (ISO/IEC 18004 §7.4.8.3): two digits "00"–"99" are
 * their numeric value 0–99; one Latin letter is its ASCII code plus 100 (A–Z 165–190, a–z 197–222).
 * A number is taken as the raw 8-bit value (0–255).
 */
function resolveApplicationIndicator(value: unknown): number {
  if (typeof value === 'string') {
    if (/^\d\d$/.test(value)) return Number(value);
    if (/^[A-Za-z]$/.test(value)) return value.charCodeAt(0) + 100;
    throw new InvalidInputError(
      'Option "fnc1.applicationIndicator" as text must be two digits ("00"–"99") or one Latin letter.',
      { details: { option: 'fnc1.applicationIndicator' } },
    );
  }
  return integerOption(value, 'fnc1.applicationIndicator', 0, 255);
}

export interface PreparedSymbol {
  readonly request: EncodeRequest;
  readonly needs: Requirements['encoder'];
}

/** Validate the symbol part of a request (data and encoding options). */
export function normalizeSymbol(
  request: SymbolOptions & { readonly data: GenerateRequest['data'] },
  limits: KitLimits,
): PreparedSymbol {
  const need: Requirements['encoder'][number][] = [];
  const { data } = request;

  const charset = request.charset ?? 'utf-8';
  if (charset !== 'utf-8' && charset !== 'iso-8859-1') {
    throw new InvalidInputError('Option "charset" must be "utf-8" or "iso-8859-1".');
  }
  if (charset === 'iso-8859-1') need.push('iso-8859-1');
  const kanji = booleanOption(request.kanji, 'kanji');
  if (kanji) need.push('kanji');

  let input: EncodeInput;
  if (typeof data === 'string') {
    if (data.length === 0) throw new InvalidInputError('"data" must not be empty.');
    checkSize(data.length, limits);
    if (typeof request.eci === 'number') {
      throw new InvalidInputError(
        'A numeric ECI assignment can only be used with byte data; use eci: true for text.',
      );
    }
    const eci = booleanOption(request.eci, 'eci');
    if (eci) need.push('eci');
    input = { kind: 'text', text: data, charset, eci, kanji };
  } else if (data instanceof Uint8Array) {
    if (data.length === 0) throw new InvalidInputError('"data" must not be empty.');
    checkSize(data.length, limits);
    if (request.kanji !== undefined || request.charset !== undefined) {
      throw new InvalidInputError('Options "kanji" and "charset" only apply to text data.');
    }
    if (request.eci === true) {
      throw new InvalidInputError(
        'For byte data, "eci" must be an ECI assignment number (0–999999), not true.',
      );
    }
    const eci =
      request.eci === undefined || request.eci === false
        ? undefined
        : integerOption(request.eci, 'eci', 0, 999_999);
    if (eci !== undefined) need.push('eci');
    input = { kind: 'bytes', bytes: data, eci };
  } else if (Array.isArray(data)) {
    const segments = data as readonly Segment[];
    if (segments.length === 0)
      throw new InvalidInputError('"data" must not be an empty segment list.');
    assertSegmentShapes(segments);
    assertSegmentsNotEmpty(segments);
    checkSize(
      segments.reduce((n, s) => n + segmentLength(s), 0),
      limits,
    );
    if (
      request.kanji !== undefined ||
      request.charset !== undefined ||
      (request.eci !== undefined && request.eci !== false)
    ) {
      throw new InvalidInputError(
        'With explicit segments, use ECI segments instead of the "eci", "charset" and "kanji" options.',
      );
    }
    input = { kind: 'segments', segments };
    if (segments.some((s) => s.mode === 'eci')) need.push('eci');
    if (segments.some((s) => s.mode === 'kanji')) need.push('kanji');
  } else {
    throw new InvalidInputError('"data" must be a string, a Uint8Array or an array of segments.');
  }

  const versions = resolveVersions(request.version);
  const mask = resolveMask(request.mask);
  if (mask !== undefined) need.push('maskControl');
  const boostEcc = booleanOption(request.boostEcc, 'boostEcc');
  if (boostEcc) need.push('boostEcc');

  let fnc1: EncodeRequest['fnc1'];
  if (request.fnc1 === 'first') fnc1 = { position: 'first' };
  else if (typeof request.fnc1 === 'object') {
    fnc1 = {
      position: 'second',
      applicationIndicator: resolveApplicationIndicator(request.fnc1.applicationIndicator),
    };
  } else if (request.fnc1 !== undefined) {
    throw new InvalidInputError('Option "fnc1" must be "first" or { applicationIndicator }.');
  }
  if (fnc1 !== undefined) need.push('fnc1');

  return {
    request: {
      input,
      ecc: resolveEcc(request.ecc),
      minVersion: versions.min,
      maxVersion: versions.max,
      mask,
      boostEcc,
      fnc1,
    },
    needs: need,
  };
}

/** Reject unknown options of a symbol-only request (plain JavaScript callers). */
export function assertKnownSymbolKeys(request: object): void {
  assertKnownKeys(request, [...SYMBOL_OPTION_KEYS, 'providers']);
}

/** Validate a `generate` request and resolve every default. Throws before any provider runs. */
export function normalizeGenerate(
  request: GenerateRequest,
  limits: KitLimits,
): Prepared<EncodeRequest> {
  if (typeof request !== 'object' || request === null)
    throw new InvalidInputError('The request must be an object with a "data" property.');
  assertKnownKeys(request, [
    ...SYMBOL_OPTION_KEYS,
    ...APPEARANCE_OPTION_KEYS,
    ...OUTPUT_OPTION_KEYS,
  ]);
  const warnings: Diagnostic[] = [];
  const symbol = normalizeSymbol(request, limits);
  const { appearance, explicitColors } = resolveAppearance(request, warnings);
  const output = resolveOutput(request);
  return {
    encode:
      request.ecc === undefined && request.logo !== undefined
        ? { ...symbol.request, ecc: 'H' }
        : symbol.request,
    appearance,
    output,
    requirements: {
      encoder: symbol.needs,
      transparency: appearance.dark.a < 255 || appearance.light.a < 255,
      colors: explicitColors,
      quality: output.quality !== undefined,
      path: output.path !== undefined,
      shape: appearance.moduleShape,
      gradient: appearance.gradient !== undefined,
      logo: appearance.logo !== undefined,
    },
    warnings,
  };
}

/** Validate a structured-append request. */
export function normalizeStructuredAppend(
  request: StructuredAppendGenerateRequest,
  limits: KitLimits,
): Prepared<StructuredAppendRequest> {
  if (typeof request !== 'object' || request === null)
    throw new InvalidInputError('The request must be an object with a "data" property.');
  assertKnownKeys(request, [
    ...SYMBOL_OPTION_KEYS.filter((k) => !['eci', 'kanji', 'fnc1'].includes(k)),
    'symbols',
    ...APPEARANCE_OPTION_KEYS,
    ...OUTPUT_OPTION_KEYS,
  ]);
  const warnings: Diagnostic[] = [];
  const { data } = request;
  if (typeof data !== 'string' && !(data instanceof Uint8Array)) {
    throw new InvalidInputError('"data" must be a string or a Uint8Array.');
  }
  if (data.length === 0) throw new InvalidInputError('"data" must not be empty.');
  checkSize(data.length, limits);
  const charset = request.charset ?? 'utf-8';
  if (charset !== 'utf-8' && charset !== 'iso-8859-1') {
    throw new InvalidInputError('Option "charset" must be "utf-8" or "iso-8859-1".');
  }
  const symbols =
    request.symbols === undefined ? undefined : integerOption(request.symbols, 'symbols', 2, 16);
  const versions = resolveVersions(request.version);
  const mask = resolveMask(request.mask);
  const boostEcc = booleanOption(request.boostEcc, 'boostEcc');
  const need: Requirements['encoder'][number][] = ['structuredAppend'];
  if (mask !== undefined) need.push('maskControl');
  if (boostEcc) need.push('boostEcc');
  if (charset === 'iso-8859-1') need.push('iso-8859-1');
  const { appearance, explicitColors } = resolveAppearance(request, warnings);
  const output = resolveOutput(request);
  return {
    encode: {
      data,
      charset,
      symbols,
      ecc: request.ecc === undefined && request.logo !== undefined ? 'H' : resolveEcc(request.ecc),
      minVersion: versions.min,
      maxVersion: versions.max,
      mask,
      boostEcc,
    },
    appearance,
    output,
    requirements: {
      encoder: need,
      transparency: appearance.dark.a < 255 || appearance.light.a < 255,
      colors: explicitColors,
      quality: output.quality !== undefined,
      path: output.path !== undefined,
      shape: appearance.moduleShape,
      gradient: appearance.gradient !== undefined,
      logo: appearance.logo !== undefined,
    },
    warnings,
  };
}
