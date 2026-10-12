/**
 * The delivery snapshot: when QA validates a submission, the platform fetches the tarball of
 * the pinned SHA once (with the provider's sealed PAT) and keeps it in **private** Vercel Blob
 * (`access: 'private'`, token BLOB_PRIVATE_READ_WRITE_TOKEN, else BLOB_READ_WRITE_TOKEN).
 * Downloads and pushes are served from the snapshot, before and after acceptance, so the PAT
 * can be purged on acceptance without ending the customer's access. The blob is only read
 * server-side, through the auth-checked download route; its path has a random 32-byte nonce.
 *
 * `submissions.snapshot_path`, `files_hash` (./snapshot-hash.ts), `snapshot_bytes`,
 * `snapshot_at` record it. A snapshot that failed at validation is retried on the next
 * download or push, and before acceptance purges the PAT.
 *
 * Tests set DELIVERY_SNAPSHOT_FAKE_DIR (ignored in production) to keep snapshots on disk.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { get, put } from '@vercel/blob';
import { open as openSecret } from '../crypto/secret-box';
import { jobsDb } from '../jobs/db';
import { JobsError, dbError } from '../jobs/errors';
import { audit } from '../qa/qa-data';
import type { DeliverySubmission } from './contract-data';
import { fetchCommitTarball } from './github-delivery';
import { filesHash, snapshotPath } from './snapshot-hash';
import { DEFAULT_TAR_LIMITS, TarError, readTar, stripTopDir, type TarFile } from './tar';

export interface SnapshotStore {
  put(pathname: string, body: Buffer): Promise<void>;
  /** The stored bytes as a stream, or null when the blob is gone. */
  open(pathname: string): Promise<{ body: ReadableStream<Uint8Array>; size: number | null } | null>;
}

function fakeStore(dir: string): SnapshotStore {
  const file = (p: string) => path.join(dir, ...p.split('/'));
  return {
    async put(p, body) {
      await mkdir(path.dirname(file(p)), { recursive: true });
      await writeFile(file(p), body, { flag: 'wx' });
    },
    async open(p) {
      try {
        const info = await stat(file(p));
        const bytes = await readFile(file(p));
        return { body: Readable.toWeb(Readable.from([bytes])) as ReadableStream<Uint8Array>, size: info.size };
      } catch {
        return null;
      }
    },
  };
}

function blobStore(token: string): SnapshotStore {
  return {
    async put(p, body) {
      await put(p, body, { access: 'private', token, contentType: 'application/gzip', addRandomSuffix: false, allowOverwrite: false });
    },
    async open(p) {
      const res = await get(p, { access: 'private', token, useCache: false });
      if (!res || res.statusCode !== 200) return null;
      return { body: res.stream, size: res.blob.size };
    },
  };
}

/** The configured store, or null when none is (snapshots can't be taken). */
export function snapshotStore(): SnapshotStore | null {
  const fake = process.env.DELIVERY_SNAPSHOT_FAKE_DIR;
  if (fake && process.env.NODE_ENV !== 'production') return fakeStore(fake);
  const token = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  return token ? blobStore(token) : null;
}

type SnapshotFields = { snapshot_path?: string | null; files_hash?: string | null; snapshot_bytes?: number | null; snapshot_at?: string | null };
export type SnapshotSubmission = DeliverySubmission & SnapshotFields;

function usablePat(sub: SnapshotSubmission, now = new Date()): string | null {
  if (sub.pat_purged_at || !sub.pat_ciphertext || !sub.pat_iv || !sub.pat_tag) return null;
  if (sub.pat_expires_at && new Date(sub.pat_expires_at).getTime() <= now.getTime()) return null;
  try {
    return openSecret({ ciphertext: sub.pat_ciphertext, iv: sub.pat_iv, tag: sub.pat_tag }, { aad: `submission:${sub.id}` });
  } catch (err) {
    console.error('[delivery] PAT decrypt failed:', err instanceof Error ? err.name : 'error');
    throw new JobsError('config_error', 500, 'The delivery could not be prepared. Try again later.');
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream)) {
    total += (chunk as Buffer).length;
    if (total > maxBytes) throw new JobsError('archive_too_large', 413, `The delivery is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** The files in a gzipped GitHub tarball, top directory stripped. */
export function filesOf(gz: Buffer): TarFile[] {
  try {
    return stripTopDir(readTar(gunzipSync(gz, { maxOutputLength: DEFAULT_TAR_LIMITS.maxBytes })));
  } catch (err) {
    if (err instanceof TarError) throw new JobsError('archive_too_large', 413, err.message);
    if (err instanceof RangeError) throw new JobsError('archive_too_large', 413, 'The delivery is too large');
    throw new JobsError('github_error', 502, 'The delivered archive could not be read');
  }
}

/**
 * Take the snapshot of a validated submission if it has none. Returns its path. Throws
 * snapshot_missing (410) when the PAT is gone and there is no snapshot, snapshot_unavailable
 * (503) when no store is configured.
 */
export async function ensureSnapshot(sub: SnapshotSubmission, actor: string | null): Promise<string> {
  if (sub.snapshot_path) return sub.snapshot_path;
  const store = snapshotStore();
  if (!store) throw new JobsError('snapshot_unavailable', 503, 'Delivery storage is not configured. Try again later.');
  const pat = usablePat(sub);
  if (!pat) throw new JobsError('snapshot_missing', 410, "The delivery wasn't kept and the platform's access to the provider's repository has ended");

  const gz = await readCapped(await fetchCommitTarball(pat, sub.repo_full_name, sub.commit_sha), DEFAULT_TAR_LIMITS.maxBytes);
  const hash = filesHash(filesOf(gz));
  const pathname = snapshotPath(sub.contract_id, sub.id, randomBytes(32).toString('hex'));
  await store.put(pathname, gz);
  const now = new Date().toISOString();
  const { data, error } = await jobsDb()
    .from('submissions')
    .update({ snapshot_path: pathname, files_hash: hash, snapshot_bytes: gz.length, snapshot_at: now })
    .eq('id', sub.id)
    .is('snapshot_path', null)
    .select('snapshot_path')
    .maybeSingle();
  if (error) throw dbError(error, 'record snapshot');
  if (!data) {
    // A concurrent call recorded its own snapshot first: use that one.
    const { data: row, error: readError } = await jobsDb().from('submissions').select('snapshot_path').eq('id', sub.id).single();
    if (readError) throw dbError(readError, 'read snapshot');
    return (row as { snapshot_path: string }).snapshot_path;
  }
  await audit(actor, 'delivery_snapshot', 'submission', sub.id, { contract_id: sub.contract_id, commit_sha: sub.commit_sha, files_hash: hash, bytes: gz.length });
  return pathname;
}

/** Best effort at validation and before acceptance: a failure is logged and retried later. */
export async function trySnapshot(sub: SnapshotSubmission, actor: string | null): Promise<boolean> {
  try {
    await ensureSnapshot(sub, actor);
    return true;
  } catch (err) {
    console.error('[delivery] snapshot failed:', sub.id, err instanceof JobsError ? err.code : err instanceof Error ? err.name : 'error');
    return false;
  }
}

/** Open the stored snapshot; snapshot_missing (410) when the blob is gone. */
export async function openSnapshot(pathname: string): Promise<{ body: ReadableStream<Uint8Array>; size: number | null }> {
  const store = snapshotStore();
  if (!store) throw new JobsError('snapshot_unavailable', 503, 'Delivery storage is not configured. Try again later.');
  const file = await store.open(pathname);
  if (!file) throw new JobsError('snapshot_missing', 410, 'The stored delivery could not be found');
  return file;
}

/** The whole snapshot in memory (for a push). */
export async function readSnapshot(pathname: string): Promise<Buffer> {
  const file = await openSnapshot(pathname);
  return readCapped(new Response(file.body), DEFAULT_TAR_LIMITS.maxBytes);
}
