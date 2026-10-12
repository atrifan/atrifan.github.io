/**
 * A small reader for the (already gunzipped) tarballs GitHub serves for a commit. Pure.
 *
 * Handles ustar headers with the `prefix` field, pax extended headers (`x`: path, linkpath;
 * `g`: global, ignored) and GNU long names (`L`, `K`). GitHub wraps everything in one top
 * directory (`<owner>-<repo>-<sha7>/`); `stripTopDir` removes it. Only regular files and
 * symlinks are returned. Paths that escape the root ("..", absolute) are refused.
 */

export interface TarFile {
  path: string;
  kind: 'file' | 'symlink';
  /** Git tree mode: 100644, 100755 or 120000. */
  gitMode: '100644' | '100755' | '120000';
  data: Buffer;
}

export class TarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TarError';
  }
}

export interface TarLimits {
  maxFiles: number;
  maxBytes: number;
}

export const DEFAULT_TAR_LIMITS: TarLimits = { maxFiles: 5000, maxBytes: 100 * 1024 * 1024 };

function cstring(buf: Buffer, start: number, len: number): string {
  const slice = buf.subarray(start, start + len);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString('utf8');
}

function octal(buf: Buffer, start: number, len: number): number {
  const s = cstring(buf, start, len).trim();
  if (!s) return 0;
  if (!/^[0-7]+$/.test(s)) throw new TarError('Malformed tar header');
  return parseInt(s, 8);
}

function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < data.length) {
    const space = data.indexOf(0x20, i);
    if (space === -1) break;
    const len = parseInt(data.subarray(i, space).toString('utf8'), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = data.subarray(space + 1, i + len - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

function safePath(path: string): string {
  const parts = path.split('/').filter((p) => p !== '' && p !== '.');
  if (path.startsWith('/') || parts.some((p) => p === '..')) throw new TarError(`Unsafe path in archive: ${path}`);
  return parts.join('/');
}

export function readTar(tar: Buffer, limits: TarLimits = DEFAULT_TAR_LIMITS): TarFile[] {
  const files: TarFile[] = [];
  let offset = 0;
  let total = 0;
  let pending: { path?: string; linkpath?: string } = {};
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const dataStart = offset + 512;
    const data = tar.subarray(dataStart, dataStart + size);
    if (data.length < size) throw new TarError('Truncated tar archive');
    offset = dataStart + Math.ceil(size / 512) * 512;

    if (type === 'x') {
      const pax = parsePax(data);
      pending = { ...pending, path: pax.path ?? pending.path, linkpath: pax.linkpath ?? pending.linkpath };
      continue;
    }
    if (type === 'g') continue;
    if (type === 'L') {
      pending.path = cstring(data, 0, data.length);
      continue;
    }
    if (type === 'K') {
      pending.linkpath = cstring(data, 0, data.length);
      continue;
    }

    const name = cstring(header, 0, 100);
    const magic = cstring(header, 257, 6);
    const prefix = magic.startsWith('ustar') ? cstring(header, 345, 155) : '';
    const path = pending.path ?? (prefix ? `${prefix}/${name}` : name);
    const linkpath = pending.linkpath ?? cstring(header, 157, 100);
    pending = {};

    if (type === '0' || type === '\0' || type === '7') {
      const mode = octal(header, 100, 8);
      total += size;
      if (total > limits.maxBytes) throw new TarError('The archive is too large');
      files.push({ path: safePath(path), kind: 'file', gitMode: mode & 0o111 ? '100755' : '100644', data: Buffer.from(data) });
    } else if (type === '2') {
      files.push({ path: safePath(path), kind: 'symlink', gitMode: '120000', data: Buffer.from(linkpath, 'utf8') });
    } else {
      continue; // directories, hard links, devices: not part of a git tree
    }
    if (files.length > limits.maxFiles) throw new TarError('The archive has too many files');
  }
  return files;
}

/** Drop GitHub's single top-level directory (`owner-repo-sha7/`). */
export function stripTopDir(files: TarFile[]): TarFile[] {
  return files
    .map((f) => {
      const slash = f.path.indexOf('/');
      return slash === -1 ? null : { ...f, path: f.path.slice(slash + 1) };
    })
    .filter((f): f is TarFile => f !== null && f.path.length > 0);
}
