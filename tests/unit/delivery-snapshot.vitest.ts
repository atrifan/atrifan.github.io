import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { filesHash, snapshotPath, SnapshotPathError } from '@/src/lib/delivery/snapshot-hash';
import type { TarFile } from '@/src/lib/delivery/tar';

const file = (path: string, data: string, gitMode: TarFile['gitMode'] = '100644'): TarFile => ({
  path,
  kind: gitMode === '120000' ? 'symlink' : 'file',
  gitMode,
  data: Buffer.from(data),
});

const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

describe('filesHash', () => {
  it('is the sha256 of "<mode> <sha256(data)> <path>\\n" lines sorted by path', () => {
    const files = [file('b.txt', 'B'), file('a.txt', 'A', '100755')];
    const expected = sha(`100755 ${sha('A')} a.txt\n100644 ${sha('B')} b.txt\n`);
    expect(filesHash(files)).toBe(`sha256:${expected}`);
  });

  it('does not depend on the order of the archive', () => {
    const a = [file('x/1', 'one'), file('x/2', 'two'), file('y', 'three')];
    expect(filesHash(a)).toBe(filesHash([...a].reverse()));
  });

  it('changes when a byte, a path or a mode changes', () => {
    const base = filesHash([file('a', 'hello')]);
    expect(filesHash([file('a', 'hellp')])).not.toBe(base);
    expect(filesHash([file('b', 'hello')])).not.toBe(base);
    expect(filesHash([file('a', 'hello', '100755')])).not.toBe(base);
    expect(filesHash([file('a', 'hello'), file('c', '')])).not.toBe(base);
  });

  it('sorts by code unit, not locale', () => {
    const files = [file('a', '1'), file('B', '2')];
    const expected = sha(`100644 ${sha('2')} B\n100644 ${sha('1')} a\n`);
    expect(filesHash(files)).toBe(`sha256:${expected}`);
  });

  it('duplicate paths hash the same in any order', () => {
    const dup = [file('a', 'one'), file('a', 'two'), file('a', 'one', '100755')];
    expect(filesHash(dup)).toBe(filesHash([...dup].reverse()));
    expect(filesHash([dup[1], dup[2], dup[0]])).toBe(filesHash(dup));
  });

  it('an empty tree has a stable hash', () => {
    expect(filesHash([])).toBe(`sha256:${sha('')}`);
  });
});

describe('snapshotPath', () => {
  const contract = '11111111-2222-4333-8444-555555555555';
  const submission = '66666666-7777-4888-9999-000000000000';
  const nonce = 'ab'.repeat(32);

  it('puts the snapshot under the contract with an unguessable name', () => {
    expect(snapshotPath(contract, submission, nonce)).toBe(`deliveries/${contract}/${submission}-${nonce}.tar.gz`);
  });

  it.each([
    ['contract', 'not-a-uuid', submission, nonce],
    ['submission', contract, '../../etc', nonce],
    ['short nonce', contract, submission, 'ab'.repeat(15)],
    ['non-hex nonce', contract, submission, 'zz'.repeat(32)],
    ['upper-case nonce', contract, submission, 'AB'.repeat(32)],
  ])('refuses a bad %s', (_what, c, s, n) => {
    expect(() => snapshotPath(c, s, n)).toThrow(SnapshotPathError);
  });

  it('anchors the checks: no extra characters before or after', () => {
    expect(() => snapshotPath(`x${contract}`, submission, nonce)).toThrow(/contract id must be a UUID/);
    expect(() => snapshotPath(`${contract}x`, submission, nonce)).toThrow(/contract id must be a UUID/);
    expect(() => snapshotPath(contract, `x${submission}`, nonce)).toThrow(/submission id must be a UUID/);
    expect(() => snapshotPath(contract, `${submission}x`, nonce)).toThrow(/submission id must be a UUID/);
    expect(() => snapshotPath(contract, submission, `z${nonce}`)).toThrow(/nonce must be at least 32 random bytes/);
    expect(() => snapshotPath(contract, submission, `${nonce}z`)).toThrow(/nonce must be at least 32 random bytes/);
  });

  it('throws a named SnapshotPathError', () => {
    try {
      snapshotPath('x', submission, nonce);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).name).toBe('SnapshotPathError');
    }
  });

  it('accepts a longer nonce', () => {
    expect(snapshotPath(contract, submission, 'cd'.repeat(40))).toMatch(/-[0-9a-f]{80}\.tar\.gz$/);
  });
});
