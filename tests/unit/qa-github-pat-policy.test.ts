import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOwnerAdmin,
  checkTokenFormat,
  parseRepoRef,
  parseExpirationHeader,
  checkExpiry,
  checkRepo,
  checkScope,
  normalizeShaInput,
  patRejectionMessage,
  MAX_PAT_LIFETIME_DAYS,
  PAT_REJECTIONS,
} from '../../src/lib/jobs/github-pat-policy.ts';

const FINE = `github_pat_11ABCDEFGHIJKLMNOPQRST_${'x'.repeat(59)}`;
const DAY = 24 * 60 * 60 * 1000;

test('only fine-grained github_pat_ tokens pass the format check', () => {
  assert.equal(checkTokenFormat(FINE), null);
  assert.equal(checkTokenFormat(`  ${FINE}  `), null);
  for (const classic of ['ghp_' + 'a'.repeat(36), 'gho_' + 'a'.repeat(36), 'ghu_abc', 'ghs_abc', 'ghr_abc']) {
    assert.equal(checkTokenFormat(classic), 'classic_pat', classic);
  }
  for (const bad of ['', '   ', 'github_pat_', 'github_pat_short', 'token', `github_pat_${'x'.repeat(19)}`, `github_pat_bad chars ${'x'.repeat(30)}`]) {
    assert.equal(checkTokenFormat(bad), 'invalid_pat', bad);
  }
  assert.equal(checkTokenFormat(`github_pat_${'x'.repeat(20)}`), null);
  assert.equal(checkTokenFormat(`github_pat_${'x'.repeat(256)}`), 'invalid_pat');
  assert.equal(checkTokenFormat(undefined as unknown as string), 'invalid_pat');
});

test('parseRepoRef accepts owner/repo and GitHub URLs', () => {
  const want = { owner: 'acme', repo: 'my-repo', fullName: 'acme/my-repo' };
  for (const input of [
    'acme/my-repo',
    ' acme/my-repo ',
    'https://github.com/acme/my-repo',
    'https://github.com/acme/my-repo.git',
    'https://github.com/acme/my-repo/',
    'http://www.github.com/acme/my-repo',
    'github.com/acme/my-repo',
    'git@github.com:acme/my-repo.git',
  ]) {
    assert.deepEqual(parseRepoRef(input), want, input);
  }
  assert.deepEqual(parseRepoRef('Acme.Org/repo_1.js'), { owner: 'Acme.Org', repo: 'repo_1.js', fullName: 'Acme.Org/repo_1.js' });
});

test('parseRepoRef rejects anything else', () => {
  for (const bad of [
    '', 'acme', 'acme/', '/repo', 'acme/repo/extra', 'https://gitlab.com/acme/repo', 'https://github.com/acme',
    'acme/re po', '../etc/passwd', 'acme/..', 'acme/.', 'ac me/repo', 'https://github.com/acme/repo/tree/main',
    'https://evil.com/github.com/acme/repo', 'a'.repeat(101) + '/repo', 'acme/' + 'r'.repeat(101),
  ]) {
    assert.equal(parseRepoRef(bad), null, bad);
  }
  assert.equal(parseRepoRef(undefined as unknown as string), null);
});

test('parseExpirationHeader reads the GitHub header format', () => {
  assert.deepEqual(parseExpirationHeader(null), { present: false, expiresAt: null });
  assert.deepEqual(parseExpirationHeader(''), { present: false, expiresAt: null });
  assert.equal(parseExpirationHeader('2026-10-20 12:30:45 UTC').expiresAt?.toISOString(), '2026-10-20T12:30:45.000Z');
  assert.equal(parseExpirationHeader('2026-10-20 12:30:45 -0800').expiresAt?.toISOString(), '2026-10-20T20:30:45.000Z');
  assert.equal(parseExpirationHeader('2026-10-20 12:30:45 +0130').expiresAt?.toISOString(), '2026-10-20T11:00:45.000Z');
  const garbage = parseExpirationHeader('soon');
  assert.equal(garbage.present, true);
  assert.equal(garbage.expiresAt, null);
  assert.equal(parseExpirationHeader('2026-13-45 99:00:00 UTC').expiresAt, null);
});

test('checkExpiry rejects expired tokens and tokens that live longer than 30 days', () => {
  const now = new Date('2026-10-12T00:00:00Z');
  assert.equal(MAX_PAT_LIFETIME_DAYS, 30);
  assert.equal(checkExpiry(new Date(now.getTime() + 10 * DAY), now), null);
  assert.equal(checkExpiry(new Date(now.getTime() + 30 * DAY), now), null);
  assert.equal(checkExpiry(new Date(now.getTime() + 30 * DAY + 1000), now), 'pat_expiry_too_long');
  assert.equal(checkExpiry(new Date(now.getTime() + 1000), now), null);
  assert.equal(checkExpiry(now, now), 'pat_expired');
  assert.equal(checkExpiry(new Date(now.getTime() - 1), now), 'pat_expired');
  assert.equal(checkExpiry(new Date(now.getTime() + 5 * DAY), now, 3), 'pat_expiry_too_long');
  // absent header: cannot judge, accepted (documented limitation)
  assert.equal(checkExpiry(null, now), null);
});

test('checkRepo requires a private repo with pull; admin (the user\'s role) is allowed', () => {
  const ok = { full_name: 'acme/r', private: true, permissions: { admin: false, push: false, pull: true } };
  assert.equal(checkRepo(ok), null);
  assert.equal(checkRepo({ ...ok, permissions: { admin: false, push: true, pull: true } }), null);
  assert.equal(checkRepo({ ...ok, private: false }), 'public_repo');
  assert.equal(checkRepo({ ...ok, private: undefined }), 'public_repo');
  assert.equal(checkRepo({ ...ok, permissions: { admin: false, push: false, pull: false } }), 'repo_not_accessible');
  assert.equal(checkRepo({ full_name: 'acme/r', private: true }), 'repo_not_accessible');
  assert.equal(checkRepo({ ...ok, permissions: { admin: true, push: true, pull: true } }), null);
  // public is reported first: it's the most important reason
  assert.equal(checkRepo({ full_name: 'acme/r', private: false, permissions: { admin: true, push: true, pull: false } }), 'public_repo');
  assert.equal(checkRepo({ ...ok, private: true, permissions: { admin: true, push: true, pull: false } }), 'repo_not_accessible');
});

test('checkScope allows only the target repo', () => {
  assert.equal(checkScope([{ full_name: 'acme/r' }], 'acme/r'), null);
  assert.equal(checkScope([{ full_name: 'ACME/R' }], 'acme/r'), null);
  assert.equal(checkScope([], 'acme/r'), null);
  assert.equal(checkScope([{ full_name: 'acme/r' }, { full_name: 'acme/other' }], 'acme/r'), 'pat_too_broad');
  assert.equal(checkScope([{ full_name: 'acme/other' }], 'acme/r'), 'pat_too_broad');
  assert.equal(checkScope([{}], 'acme/r'), 'pat_too_broad');
});

test('normalizeShaInput accepts 7-40 hex characters, lower-cased', () => {
  assert.equal(normalizeShaInput(undefined), null);
  assert.equal(normalizeShaInput(null), null);
  assert.equal(normalizeShaInput(''), null);
  assert.equal(normalizeShaInput('  '), null);
  assert.equal(normalizeShaInput('ABCDEF1'), 'abcdef1');
  assert.equal(normalizeShaInput(' ' + 'a'.repeat(40) + ' '), 'a'.repeat(40));
  for (const bad of ['abcdef', 'g'.repeat(40), 'a'.repeat(41), 'main', 'abc def1']) {
    assert.equal(normalizeShaInput(bad), 'invalid', bad);
  }
});

test('every rejection has a human message; public repos explain that paid work must be private', () => {
  for (const r of PAT_REJECTIONS) {
    assert.ok(patRejectionMessage(r).length > 20, r);
  }
  assert.match(patRejectionMessage('public_repo'), /private/i);
  assert.match(patRejectionMessage('public_repo'), /paid/i);
  assert.match(patRejectionMessage('classic_pat'), /fine-grained/i);
  assert.match(patRejectionMessage('pat_too_broad'), /only/i);
  assert.match(patRejectionMessage('pat_expiry_too_long'), /30 days/);
  assert.equal(new Set(PAT_REJECTIONS.map(patRejectionMessage)).size, PAT_REJECTIONS.length);
});

test('format and repo parsing are anchored at both ends', () => {
  assert.equal(checkTokenFormat(`github_pat_ghp_${'x'.repeat(20)}`), null);
  assert.equal(checkTokenFormat(`xgithub_pat_${'x'.repeat(20)}`), 'invalid_pat');
  assert.deepEqual(parseRepoRef('a/repo'), { owner: 'a', repo: 'repo', fullName: 'a/repo' });
  assert.equal(parseRepoRef('xgit@github.com:acme/r'), null);
  assert.equal(parseRepoRef('notgithub.com/repo'), null);
  assert.deepEqual(parseRepoRef('acme/my.github-tools'), { owner: 'acme', repo: 'my.github-tools', fullName: 'acme/my.github-tools' });
});

test('the expiration header is trimmed and must match the whole format', () => {
  assert.equal(parseExpirationHeader('  2026-10-20 12:30:45 UTC  ').expiresAt?.toISOString(), '2026-10-20T12:30:45.000Z');
  for (const bad of ['2026-10-20 12:30:45 UTC extra', 'x2026-10-20 12:30:45 UTC', '2026-13-45 99:00:00 UTC']) {
    assert.deepEqual(parseExpirationHeader(bad), { present: true, expiresAt: null }, bad);
  }
});

test('isOwnerAdmin is true only when GitHub reports admin: true', () => {
  assert.equal(isOwnerAdmin({ private: true, permissions: { admin: true, push: true, pull: true } }), true);
  assert.equal(isOwnerAdmin({ private: true, permissions: { admin: false, push: true, pull: true } }), false);
  assert.equal(isOwnerAdmin({ private: true, permissions: {} }), false);
  assert.equal(isOwnerAdmin({ private: true }), false);
});
