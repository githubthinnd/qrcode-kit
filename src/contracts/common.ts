export type MaybePromise<T> = T | Promise<T>;

/** Version of the provider contracts. Increases only with a breaking contract change. */
export const PROVIDER_API_VERSION = 1;

/** Fields shared by every provider kind. */
export interface ProviderBase<Capabilities> {
  /** Unique within a kit. Convention: `scope/name`, e.g. `qrcode-toolkit/svg`. */
  readonly id: string;
  /** The contract version this provider implements. */
  readonly apiVersion: typeof PROVIDER_API_VERSION;
  /** Static, truthful description of what the provider supports. */
  readonly capabilities: Capabilities;
}

/** A non-fatal observation returned with a result (never logged by the library). */
export interface Diagnostic {
  readonly code: string;
  readonly message: string;
}

/** Straight (non-premultiplied) 8-bit RGBA colour. */
export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}
