import { constants } from 'node:fs';
import { lstat, mkdir, open, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { PROVIDER_API_VERSION } from '../../contracts/common.js';
import type { ExportOptions, ExportedResult, ExporterProvider } from '../../contracts/exporter.js';
import type { RenderedKind, RenderedOutput } from '../../contracts/renderer.js';
import { ExportError } from '../../domain/errors.js';
import { encodeBilevelPng } from '../../formats/png.js';

declare module '../../contracts/exporter.js' {
  interface FormatValueMap {
    /** PNG bytes; in Node.js the value is a `Buffer`. */
    'png-buffer': Uint8Array;
    /** UTF-8 SVG bytes; in Node.js the value is a `Buffer`. */
    'svg-buffer': Uint8Array;
    'png-file': FileResult;
    'svg-file': FileResult;
    'text-file': FileResult;
  }
}

const utf8 = (text: string): Uint8Array => {
  const out: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return Uint8Array.from(out);
};

function bytesOf(
  rendered: RenderedOutput,
  kind: RenderedKind,
): { bytes: Uint8Array; mimeType: string } {
  if (rendered.kind !== kind)
    throw new ExportError(`This exporter cannot export "${rendered.kind}" output.`);
  switch (rendered.kind) {
    case 'bitmap':
      return {
        bytes: encodeBilevelPng(
          rendered.width,
          rendered.height,
          rendered.pixels,
          rendered.dark,
          rendered.light,
        ),
        mimeType: 'image/png',
      };
    case 'svg':
      return { bytes: utf8(rendered.markup), mimeType: 'image/svg+xml' };
    case 'text':
      return { bytes: utf8(rendered.text), mimeType: 'text/plain;charset=utf-8' };
    default:
      throw new ExportError(`This exporter cannot export "${rendered.kind}" output.`);
  }
}

/** Wrap bytes in a Node.js `Buffer` without copying (falls back to the plain `Uint8Array`). */
function asBuffer(bytes: Uint8Array): Uint8Array {
  const ctor = (
    globalThis as unknown as {
      Buffer?: { from(buffer: ArrayBufferLike, offset: number, length: number): Uint8Array };
    }
  ).Buffer;
  return ctor === undefined ? bytes : ctor.from(bytes.buffer, bytes.byteOffset, bytes.length);
}

const base = {
  apiVersion: PROVIDER_API_VERSION,
  quality: false,
  sync: true,
} as const;

/** `png-buffer` and `svg-buffer`: bytes as Node.js `Buffer`s. */
export function createBufferExporters(): ExporterProvider[] {
  const make = (id: string, kind: 'bitmap' | 'svg', format: string): ExporterProvider => ({
    id,
    ...base,
    capabilities: {
      accepts: [kind],
      formats: [format],
      runtimes: ['node'],
      requiresPath: false,
      quality: false,
      sync: true,
    },
    export(rendered: RenderedOutput): ExportedResult {
      const { bytes, mimeType } = bytesOf(rendered, kind);
      return { format, mimeType, value: asBuffer(bytes) };
    },
  });
  return [
    make('qrcode-toolkit/node/buffer-png', 'bitmap', 'png-buffer'),
    make('qrcode-toolkit/node/buffer-svg', 'svg', 'svg-buffer'),
  ];
}

export interface FileExporterOptions {
  /**
   * Confine writes to this directory. Paths are resolved against it and must
   * stay inside it; use this whenever the destination can be influenced by
   * untrusted input. Default: no confinement (paths resolve against the cwd).
   */
  readonly baseDir?: string;
  /** Create missing parent directories. Default `false`. */
  readonly createDirectories?: boolean;
}

/** `png-file`, `svg-file` and `text-file`: write the output to `path` and return `{ path, bytes }`. */
export function createFileExporters(options: FileExporterOptions = {}): ExporterProvider[] {
  const root = options.baseDir === undefined ? undefined : resolve(options.baseDir);

  const destination = (path: string | undefined): string => {
    if (path === undefined) throw new ExportError('The "path" option is required for file output.');
    const full = root === undefined ? resolve(path) : resolve(root, path);
    if (root !== undefined) {
      const rel = relative(root, full);
      if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
        throw new ExportError('The output path escapes the configured base directory.', {
          details: { baseDir: root },
        });
      }
    }
    return full;
  };

  const inside = (base: string, target: string): boolean => {
    const rel = relative(base, target);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };

  /** Resolve symlinks of `dir` (or of its nearest existing ancestor) and require it to stay in `root`. */
  const assertRealInside = async (rootReal: string, dir: string): Promise<void> => {
    let current = dir;
    for (;;) {
      try {
        const real = await realpath(current);
        if (!inside(rootReal, real)) {
          throw new ExportError(
            'The output path leaves the base directory through a symbolic link.',
            {
              details: { baseDir: rootReal },
            },
          );
        }
        return;
      } catch (error) {
        if (error instanceof ExportError) throw error;
        const parent = dirname(current);
        if (parent === current) throw error;
        current = parent;
      }
    }
  };

  const make = (id: string, kind: 'bitmap' | 'svg' | 'text', format: string): ExporterProvider => ({
    id,
    ...base,
    capabilities: {
      accepts: [kind],
      formats: [format],
      runtimes: ['node'],
      requiresPath: true,
      quality: false,
      sync: false,
    },
    async export(
      rendered: RenderedOutput,
      _format: string,
      exportOptions: ExportOptions,
    ): Promise<ExportedResult> {
      const { bytes, mimeType } = bytesOf(rendered, kind);
      const path = destination(exportOptions.path);
      try {
        if (root !== undefined) {
          // Symbolic links are resolved before and after creating directories. This is best-effort
          // confinement, not a sandbox: it cannot rule out a concurrent attacker swapping links.
          const rootReal = await realpath(root);
          await assertRealInside(rootReal, dirname(path));
          if (options.createDirectories === true) await mkdir(dirname(path), { recursive: true });
          await assertRealInside(rootReal, dirname(path));
          const existing = await lstat(path).catch(() => undefined);
          if (existing?.isSymbolicLink() === true) {
            throw new ExportError(
              'The output file is a symbolic link; refusing to write through it.',
            );
          }
          // O_NOFOLLOW makes the kernel refuse a link swapped in for the final path component
          // after the checks above (POSIX; the flag is 0 on Windows). Parent directories are
          // re-checked once the file is open.
          const handle = await open(
            path,
            constants.O_WRONLY |
              constants.O_CREAT |
              constants.O_TRUNC |
              (constants.O_NOFOLLOW ?? 0),
          );
          try {
            await assertRealInside(rootReal, dirname(await realpath(path)));
            await handle.writeFile(bytes);
          } finally {
            await handle.close();
          }
        } else {
          if (options.createDirectories === true) await mkdir(dirname(path), { recursive: true });
          await writeFile(path, bytes);
        }
      } catch (cause) {
        if (cause instanceof ExportError) throw cause;
        throw new ExportError('The file could not be written.', { cause, details: { path } });
      }
      return { format, mimeType, value: { path, bytes: bytes.length } };
    },
  });
  return [
    make('qrcode-toolkit/node/file-png', 'bitmap', 'png-file'),
    make('qrcode-toolkit/node/file-svg', 'svg', 'svg-file'),
    make('qrcode-toolkit/node/file-text', 'text', 'text-file'),
  ];
}

/** All Node.js providers. */
export function createNodeProviders(options: FileExporterOptions = {}): {
  readonly exporters: readonly ExporterProvider[];
} {
  return { exporters: [...createBufferExporters(), ...createFileExporters(options)] };
}
