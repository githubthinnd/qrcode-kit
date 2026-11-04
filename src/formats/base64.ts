const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 (RFC 4648 §4) with padding. */
export function toBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let line = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    line += ALPHABET.charAt(a >> 2) + ALPHABET.charAt(((a & 3) << 4) | (b >> 4));
    line += i + 1 < bytes.length ? ALPHABET.charAt(((b & 15) << 2) | (c >> 6)) : '=';
    line += i + 2 < bytes.length ? ALPHABET.charAt(c & 63) : '=';
    if (line.length >= 8192) {
      chunks.push(line);
      line = '';
    }
  }
  chunks.push(line);
  return chunks.join('');
}

/** Percent-encode a UTF-8 string the way `encodeURIComponent` does (the function is part of ECMAScript). */
export const percentEncode: (text: string) => string = (text) => encodeURIComponent(text);
