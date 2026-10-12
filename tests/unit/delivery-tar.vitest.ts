import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { TarError, readTar, stripTopDir } from '@/src/lib/delivery/tar';
import { buildGithubTarball } from '@/tests/support/fake-github';

const SHA = 'a'.repeat(40);

describe('readTar on a GitHub-shaped tarball', () => {
  it('returns files and symlinks under the top dir, with git modes; skips dirs and pax headers', () => {
    const long = `deep/${'x'.repeat(120)}/file.txt`;
    const tgz = buildGithubTarball('acme/app', SHA, { 'README.md': '# hi\n', 'bin/run.sh': 'echo\n', [long]: 'long path' }, ['bin/run.sh']);
    const files = stripTopDir(readTar(gunzipSync(tgz)));
    expect(files.map((f) => [f.path, f.gitMode, f.data.toString()])).toEqual([
      ['README.md', '100644', '# hi\n'],
      ['bin/run.sh', '100755', 'echo\n'],
      [long, '100644', 'long path'],
    ]);
  });

  it('enforces file count and size limits', () => {
    const tar = gunzipSync(buildGithubTarball('acme/app', SHA, { a: '1', b: '2', c: '3' }));
    expect(() => readTar(tar, { maxFiles: 2, maxBytes: 1000 })).toThrow(TarError);
    expect(() => readTar(tar, { maxFiles: 10, maxBytes: 2 })).toThrow('too large');
  });

  it('refuses paths that escape the root', () => {
    const tar = gunzipSync(buildGithubTarball('acme/app', SHA, { 'x/../../etc/passwd': 'nope' }));
    expect(() => readTar(tar)).toThrow('Unsafe path');
  });

  it('rejects a truncated archive', () => {
    const tar = gunzipSync(buildGithubTarball('acme/app', SHA, { 'README.md': 'x'.repeat(2000) }));
    expect(() => readTar(tar.subarray(0, 2048))).toThrow('Truncated');
  });

  it('stripTopDir drops entries that are only the top dir', () => {
    expect(stripTopDir([{ path: 'top', kind: 'file', gitMode: '100644', data: Buffer.from('') }])).toEqual([]);
  });
});
