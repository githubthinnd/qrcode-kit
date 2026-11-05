import {
  computed,
  defineComponent,
  h,
  toValue,
  type ComputedRef,
  type MaybeRefOrGetter,
  type PropType,
  type VNode,
} from 'vue';
import {
  createQRCodeKit,
  isQRCodeKitError,
  type AppearanceOptions,
  type Diagnostic,
  type QRCodeKit,
  type QRCodeKitError,
  type QRMatrix,
  type SymbolOptions,
} from 'qrcode-toolkit';

/** Every symbol and appearance option of `qrcode-toolkit` (`ecc`, `version`, `dark`, `moduleShape`, `logo`, …). */
export type QRCodeOptions = SymbolOptions & AppearanceOptions;

/** How the image is encoded: a vector SVG (default) or a PNG data URL. */
export type QRCodeImageFormat = 'svg' | 'png';

/** The outcome of generating one QR Code. Exactly one of `src` and `error` is set. */
export interface QRCodeResult {
  /** A data URL, ready for `<img :src>`. */
  readonly src: string | undefined;
  readonly matrix: QRMatrix | undefined;
  readonly warnings: readonly Diagnostic[];
  /** Why nothing was generated (empty or oversized value, invalid option, …). */
  readonly error: QRCodeKitError | undefined;
}

const sharedKit: QRCodeKit = createQRCodeKit();

/**
 * Errors caused by the content or its size: they become `result.error`. Everything else (a
 * misspelt option, an option the renderer cannot honour, a broken provider) is a programming
 * mistake and is thrown, so it is seen during development instead of rendering nothing.
 */
const RECOVERABLE: ReadonlySet<string> = new Set([
  'INVALID_INPUT',
  'UNSUPPORTED_DATA',
  'ENCODING_FAILED',
  'RENDERING_FAILED',
]);

/**
 * Generate a QR Code synchronously. Content that cannot be encoded (empty, too long, a logo that
 * hides too much) is returned as `error` so a component can render a fallback; programming mistakes
 * (unknown options, unsupported combinations) are thrown.
 */
export function generateQRCode(
  value: string | Uint8Array,
  options: QRCodeOptions & { readonly format?: QRCodeImageFormat } = {},
  kit: QRCodeKit = sharedKit,
): QRCodeResult {
  const { format = 'svg', ...rest } = options;
  try {
    const result = kit.generateSync({
      ...rest,
      data: value,
      format: format === 'png' ? 'png-data-url' : 'svg-data-url',
    });
    return {
      src: result.value,
      matrix: result.matrix,
      warnings: result.warnings,
      error: undefined,
    };
  } catch (error) {
    if (!isQRCodeKitError(error) || !RECOVERABLE.has(error.code)) throw error;
    return { src: undefined, matrix: undefined, warnings: [], error };
  }
}

/** Reactive {@link generateQRCode}: refs and getters are tracked, so the code follows its inputs. */
export function useQRCode(
  value: MaybeRefOrGetter<string | Uint8Array>,
  options: MaybeRefOrGetter<QRCodeOptions & { readonly format?: QRCodeImageFormat }> = {},
  kit?: MaybeRefOrGetter<QRCodeKit | undefined>,
): ComputedRef<QRCodeResult> {
  return computed(() => generateQRCode(toValue(value), toValue(options), toValue(kit)));
}

/** Props of the component itself; every other prop is a `qrcode-toolkit` option. */
const OWN_PROPS: ReadonlySet<string> = new Set(['value', 'size', 'label', 'format', 'kit']);

/** Copy only the props that were really passed: Vue gives absent Boolean props the value `false`. */
function defined<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/**
 * A QR Code as an `<img>` with a data URL. It renders on the server and in the browser with
 * identical output (no hydration mismatch). Use the `fallback` slot for values that cannot be encoded.
 */
export const QRCode = defineComponent({
  name: 'QRCode',
  props: {
    /** The text or bytes to encode. */
    value: { type: [String, Uint8Array] as PropType<string | Uint8Array>, required: true },
    /** Rendered width and height in CSS pixels. */
    size: { type: Number, default: 192 },
    /** Accessible text for the image. Describe what the code does. */
    label: { type: String, default: 'QR code' },
    format: { type: String as PropType<QRCodeImageFormat>, default: 'svg' },
    /** Use your own kit (custom providers, limits). */
    kit: { type: Object as PropType<QRCodeKit>, default: undefined },
    ecc: { type: String as PropType<NonNullable<QRCodeOptions['ecc']>>, default: undefined },
    version: { type: [Number, Object] as PropType<QRCodeOptions['version']>, default: undefined },
    mask: { type: [Number, String] as PropType<QRCodeOptions['mask']>, default: undefined },
    boostEcc: { type: Boolean, default: undefined },
    charset: { type: String as PropType<QRCodeOptions['charset']>, default: undefined },
    eci: { type: [Boolean, Number] as PropType<QRCodeOptions['eci']>, default: undefined },
    kanji: { type: Boolean, default: undefined },
    fnc1: { type: [String, Object] as PropType<QRCodeOptions['fnc1']>, default: undefined },
    quietZone: { type: Number, default: undefined },
    scale: { type: Number, default: undefined },
    dark: { type: String, default: undefined },
    light: { type: String, default: undefined },
    invert: { type: Boolean, default: undefined },
    moduleShape: { type: String as PropType<QRCodeOptions['moduleShape']>, default: undefined },
    gradient: { type: Object as PropType<QRCodeOptions['gradient']>, default: undefined },
    logo: { type: Object as PropType<QRCodeOptions['logo']>, default: undefined },
  },
  setup(props, { slots }) {
    const result = computed(() => {
      const { value, size, format, kit } = props;
      const options = defined(
        Object.fromEntries(Object.entries(props).filter(([name]) => !OWN_PROPS.has(name))),
      ) as QRCodeOptions;
      const sizing = options.scale !== undefined ? {} : format === 'png' ? { scale: 8 } : { size };
      return generateQRCode(value, { ...options, ...sizing, format }, kit);
    });
    return (): VNode | VNode[] | null => {
      const { src } = result.value;
      const fallback = slots['fallback'];
      if (src === undefined) return fallback === undefined ? null : h('span', fallback());
      return h('img', { src, width: props.size, height: props.size, alt: props.label });
    };
  },
});
