/**
 * Pure helpers for the delivery snapshot (./snapshot.ts).
 *
 *  - filesHash: a content hash of the delivered tree that doesn't depend on how the archive
 *    was packed (order, timestamps, gzip level): sha256 over one line per file,
 *    "<git mode> <sha256 of the bytes> <path>\n", sorted by path (code units).
 *  - snapshotPath: where a submission's snapshot lives in the private blob store,
 *    `deliveries/<contract>/<submission>-<nonce>.tar.gz`, with a random hex nonce of at least
 *    32 bytes so the name can't be guessed even if the store were ever made public.
 */
import { createHash } from 'node:crypto';
import type { TarFile } from './tar';

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

export function filesHash(files: readonly Pick<TarFile, 'path' | 'gitMode' | 'data'>[]): string {
  const lines = [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((f) => `${f.gitMode} ${sha256(f.data)} ${f.path}\n`)
    .join('');
  return `sha256:${sha256(lines)}`;
}

export class SnapshotPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotPathError';
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NONCE = /^[0-9a-f]{64,}$/;

export function snapshotPath(contractId: string, submissionId: string, nonceHex: string): string {
  if (!UUID.test(contractId)) throw new SnapshotPathError('contract id must be a UUID');
  if (!UUID.test(submissionId)) throw new SnapshotPathError('submission id must be a UUID');
  if (!NONCE.test(nonceHex)) throw new SnapshotPathError('nonce must be at least 32 random bytes, lower-case hex');
  return `deliveries/${contractId}/${submissionId}-${nonceHex}.tar.gz`;
}
