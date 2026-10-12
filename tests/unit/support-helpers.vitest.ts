import { describe, expect, it } from 'vitest';
import { findReference, isReference, referenceFromBytes, replySubject, subjectWithReference, REFERENCE_PATTERN } from '@/src/lib/support/reference';
import { decodeEntities, escapeHtml, htmlToText, isSafeHref, sanitizeHtml } from '@/src/lib/support/sanitize-html';
import { headerValue, messageIdsIn, parseAddress, replyHeaders } from '@/src/lib/support/mail-headers';
import {
  CATEGORY_LABELS,
  COMPLAINT_CATEGORIES,
  MESSAGES,
  clientIp,
  isComplaintCategory,
  isEmail,
  isHoneypotHit,
  rateLimitDecision,
  validateComplaint,
} from '@/src/lib/support/complaint';

describe('support references', () => {
  it('maps 8 bytes onto TZ-XXXX-XXXX with the low 5 bits of each byte', () => {
    expect(referenceFromBytes([0, 1, 2, 3, 31, 32, 63, 255])).toBe('TZ-0123-Z0ZZ');
    expect(referenceFromBytes([10, 11, 12, 13, 14, 15, 16, 17])).toBe('TZ-ABCD-EFGH');
    expect(referenceFromBytes([18, 19, 20, 21, 22, 23, 24, 25, 99])).toBe('TZ-JKMN-PQRS');
  });

  it('never uses I, L, O or U, and always matches the pattern', () => {
    for (let b = 0; b < 256; b += 1) {
      const ref = referenceFromBytes([b, b, b, b, b, b, b, b]);
      expect(ref).toMatch(REFERENCE_PATTERN);
      expect(ref.slice(3)).not.toMatch(/[ILOU]/);
    }
  });

  it('needs 8 bytes', () => {
    expect(() => referenceFromBytes([1, 2, 3, 4, 5, 6, 7])).toThrow(RangeError);
  });

  it('isReference accepts only the exact upper-case form', () => {
    expect(isReference('TZ-7K3M-Q9XD')).toBe(true);
    expect(isReference('tz-7k3m-q9xd')).toBe(false);
    expect(isReference('TZ-7K3M-Q9XDX')).toBe(false);
    expect(isReference('xTZ-7K3M-Q9XD')).toBe(false);
    expect(isReference('TZ-7K3I-Q9XD')).toBe(false);
    expect(isReference(42)).toBe(false);
  });

  it('finds the first reference in subject or body, case-insensitively, upper-cased', () => {
    expect(findReference('Re: help [tz-7k3m-q9xd]')).toBe('TZ-7K3M-Q9XD');
    expect(findReference(null, undefined, '', 'see TZ-AB12-CD34 and TZ-0000-0000')).toBe('TZ-AB12-CD34');
    expect(findReference('Subject TZ-1111-2222', 'body TZ-3333-4444')).toBe('TZ-1111-2222');
    expect(findReference('no ref here', 'nor here')).toBeNull();
    expect(findReference('XTZ-7K3M-Q9XD')).toBeNull();
    expect(findReference('TZ-7K3M-Q9XDZ')).toBeNull();
    expect(findReference('TZ-7K3L-Q9XD')).toBeNull();
  });

  it('adds the reference to a subject once', () => {
    expect(subjectWithReference('Refund', 'TZ-7K3M-Q9XD')).toBe('Refund [TZ-7K3M-Q9XD]');
    expect(subjectWithReference('Refund [TZ-7K3M-Q9XD]', 'TZ-7K3M-Q9XD')).toBe('Refund [TZ-7K3M-Q9XD]');
    expect(subjectWithReference('   ', 'TZ-7K3M-Q9XD')).toBe('Your message to Tulzo [TZ-7K3M-Q9XD]');
    expect(subjectWithReference('About TZ-0000-0000', 'TZ-7K3M-Q9XD')).toBe('About TZ-0000-0000 [TZ-7K3M-Q9XD]');
  });

  it('reply subjects have one "Re:" and the reference', () => {
    expect(replySubject('Re: RE: Fwd: Refund', 'TZ-7K3M-Q9XD')).toBe('Re: Refund [TZ-7K3M-Q9XD]');
    expect(replySubject('AW: sv: Refund [TZ-7K3M-Q9XD]', 'TZ-7K3M-Q9XD')).toBe('Re: Refund [TZ-7K3M-Q9XD]');
    expect(replySubject('Refund', 'TZ-7K3M-Q9XD')).toBe('Re: Refund [TZ-7K3M-Q9XD]');
    expect(replySubject('Reply needed', 'TZ-7K3M-Q9XD')).toBe('Re: Reply needed [TZ-7K3M-Q9XD]');
  });
});

describe('sanitizeHtml', () => {
  it('keeps safe formatting', () => {
    expect(sanitizeHtml('<p>Hi <strong>there</strong><br>you</p>')).toBe('<p>Hi <strong>there</strong><br>you</p>');
    expect(sanitizeHtml('<ul><li>a</li><li>b</li></ul>')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('removes scripts, styles, iframes and their content', () => {
    expect(sanitizeHtml('<p>Hi</p><script>alert(1)</script>')).toBe('<p>Hi</p>');
    expect(sanitizeHtml('<SCRIPT type="x">a<b>b</b></SCRIPT>ok')).toBe('ok');
    expect(sanitizeHtml('<style>p{color:red}</style><p>x</p>')).toBe('<p>x</p>');
    expect(sanitizeHtml('<iframe src="https://evil.test"></iframe>after')).toBe('after');
    expect(sanitizeHtml('<svg><script>alert(1)</script></svg>x')).toBe('x');
    expect(sanitizeHtml('<script>never closed <p>x</p>')).toBe('');
    expect(sanitizeHtml('<head><title>t</title></head><body><p>b</p></body>')).toBe('<p>b</p>');
  });

  it('drops event handlers, styles, classes and ids', () => {
    const out = sanitizeHtml('<p onclick="x()" style="color:red" class="c" id="i" title="t">p</p>');
    expect(out).toBe('<p>p</p>');
    expect(sanitizeHtml('<div OnMouseOver=alert(1)>d</div>')).toBe('<div>d</div>');
  });

  it('turns images into text, never loading them', () => {
    expect(sanitizeHtml('<img src="https://evil.test/x.png" onerror="alert(1)">')).toBe('[image]');
    expect(sanitizeHtml('<img src=x alt="Logo &amp; name">')).toBe('[image: Logo &amp; name]');
    expect(sanitizeHtml('<img alt="  ">')).toBe('[image]');
    expect(sanitizeHtml('<img src="cid:img001" alt="a"/>')).toBe('[image: a]');
    expect(sanitizeHtml('a</img>b')).toBe('ab');
  });

  it('keeps only http, https and mailto links, opened safely', () => {
    expect(sanitizeHtml('<a href="https://tulzo.online/x?a=1&amp;b=2">t</a>')).toBe(
      '<a href="https://tulzo.online/x?a=1&amp;b=2" rel="noopener noreferrer nofollow" target="_blank">t</a>',
    );
    expect(sanitizeHtml('<a href="mailto:a@b.c">m</a>')).toContain('href="mailto:a@b.c"');
    expect(sanitizeHtml('<a href="http://x.test">h</a>')).toContain('href="http://x.test"');
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java&#x09;script:alert(1)', 'java\tscript:x', '&#106;avascript:x', 'data:text/html,x', 'vbscript:x', '/relative', '//evil.test']) {
      const out = sanitizeHtml(`<a href="${bad}">x</a>`);
      expect(out, bad).toBe('<a rel="noopener noreferrer nofollow" target="_blank">x</a>');
    }
    expect(sanitizeHtml('<a href="https://a.test" href="javascript:x">x</a>')).toContain('href="https://a.test"');
    expect(sanitizeHtml('<a href="https://a.test" href="javascript:x">x</a>')).not.toContain('javascript');
  });

  it('keeps numeric colspan/rowspan only', () => {
    expect(sanitizeHtml('<table><tr><td colspan="2" rowspan="x">c</td></tr></table>')).toBe('<table><tr><td colspan="2">c</td></tr></table>');
  });

  it('escapes text and unknown markup, and drops comments', () => {
    expect(sanitizeHtml('a < b & c > d')).toBe('a &lt; b &amp; c &gt; d');
    expect(sanitizeHtml('<!-- <script>x</script> -->ok')).toBe('ok');
    expect(sanitizeHtml('<!DOCTYPE html><font color=red>f</font>')).toBe('f');
    expect(sanitizeHtml('<p>"q" \'s\'</p>')).toBe('<p>&quot;q&quot; &#39;s&#39;</p>');
    expect(sanitizeHtml('<<script>script>alert(1)<</script>/script>')).not.toMatch(/<script/i);
  });

  it('closes what it opened and ignores stray closers', () => {
    expect(sanitizeHtml('<div><p>a')).toBe('<div><p>a</p></div>');
    expect(sanitizeHtml('</p>a</div>')).toBe('a');
    expect(sanitizeHtml('<div><p>a</div>b')).toBe('<div><p>a</p></div>b');
  });

  it('handles empty input', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });

  it('the contract fixture keeps the text and none of the attack', () => {
    const out = sanitizeHtml('<p>Hi</p><script>alert(1)</script><img src="https://evil.test/x.png" onerror="alert(1)"><a href="javascript:alert(1)">x</a>');
    expect(out).toContain('Hi');
    expect(out).not.toMatch(/<script|onerror|javascript:|evil\.test/i);
  });
});

describe('sanitizer helpers', () => {
  it('decodes entities', () => {
    expect(decodeEntities('&lt;&gt;&amp;&quot;&apos;&nbsp;&colon;&Tab;&newline;')).toBe('<>&"\'\u00a0:\t\n');
    expect(decodeEntities('&#65;&#x42;&#X43;')).toBe('ABC');
    expect(decodeEntities('&#0;&#x110000;')).toBe('');
    expect(decodeEntities('&unknown; &amp')).toBe('&unknown; &');
  });

  it('escapes the five HTML specials', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('isSafeHref', () => {
    expect(isSafeHref('https://x')).toBe(true);
    expect(isSafeHref('  HTTPS://x')).toBe(true);
    expect(isSafeHref('mailto:a@b')).toBe(true);
    expect(isSafeHref('ftp://x')).toBe(false);
    expect(isSafeHref('\u0000javascript:x')).toBe(false);
    expect(isSafeHref('java\u0085script:x')).toBe(false);
  });

  it('htmlToText', () => {
    expect(htmlToText('<style>x</style><p>a</p><div>b<br/>c</div><script>s</script>&amp;')).toBe('a\nb\nc\n&');
    expect(htmlToText('<p>a</p>\n\n\n\n<p>b</p>')).toBe('a\n\n\nb'.replace('\n\n\n', '\n\n'));
    expect(htmlToText(null)).toBe('');
  });
});

describe('mail headers', () => {
  it('parses addresses', () => {
    expect(parseAddress('Cara Customer <Cara@Example.com>')).toEqual({ name: 'Cara Customer', address: 'cara@example.com' });
    expect(parseAddress('"Cara C" <c@x.test>')).toEqual({ name: 'Cara C', address: 'c@x.test' });
    expect(parseAddress('<c@x.test>')).toEqual({ name: null, address: 'c@x.test' });
    expect(parseAddress(' C@X.test ')).toEqual({ name: null, address: 'c@x.test' });
    expect(parseAddress(null)).toEqual({ name: null, address: '' });
  });

  it('finds message ids', () => {
    expect(messageIdsIn('<a@x> <b@y>\n <c@z>')).toEqual(['<a@x>', '<b@y>', '<c@z>']);
    expect(messageIdsIn('no ids')).toEqual([]);
    expect(messageIdsIn(null)).toEqual([]);
  });

  it('reads headers case-insensitively', () => {
    expect(headerValue({ 'In-Reply-To': '<a@x>' }, 'in-reply-to')).toBe('<a@x>');
    expect(headerValue({ 'in-reply-to': '<a@x>' }, 'In-Reply-To')).toBe('<a@x>');
    expect(headerValue({}, 'x')).toBeNull();
    expect(headerValue(null, 'x')).toBeNull();
  });

  it('reply headers answer the latest inbound message and list every id once', () => {
    expect(
      replyHeaders([
        { direction: 'inbound', message_id: '<1@a>' },
        { direction: 'outbound', message_id: '<2@t>' },
        { direction: 'inbound', message_id: ' <3@a> ' },
        { direction: 'outbound', message_id: '<4@t>' },
        { direction: 'inbound', message_id: '<1@a>' },
        { direction: 'inbound', message_id: null },
      ]),
    ).toEqual({ 'In-Reply-To': '<1@a>', References: '<1@a> <2@t> <3@a> <4@t>' });
    expect(replyHeaders([{ direction: 'outbound', message_id: '<2@t>' }])).toEqual({ 'In-Reply-To': '<2@t>', References: '<2@t>' });
    expect(replyHeaders([{ direction: 'inbound', message_id: '  ' }])).toEqual({});
    expect(replyHeaders([])).toEqual({});
  });
});

describe('complaint rules', () => {
  const ok = { category: 'payment_refund', name: ' Cara ', email: 'cara@example.com', message: 'Where is my refund?' };

  it('accepts a valid complaint, trimmed, with related optional', () => {
    expect(validateComplaint(ok)).toEqual({
      ok: true,
      value: { category: 'payment_refund', name: 'Cara', email: 'cara@example.com', related: null, message: 'Where is my refund?', goodFaith: false },
    });
    const withRelated = validateComplaint({ ...ok, related: ' https://x.test ' });
    expect(withRelated.ok && withRelated.value.related).toBe('https://x.test');
  });

  it('reports every bad field', () => {
    expect(validateComplaint({})).toEqual({
      ok: false,
      fields: { category: MESSAGES.category, name: MESSAGES.name, email: MESSAGES.email, message: MESSAGES.message },
    });
    expect(validateComplaint(null)).toMatchObject({ ok: false });
    expect(validateComplaint('x')).toMatchObject({ ok: false });
  });

  it('field limits', () => {
    const f = (patch: Record<string, unknown>) => {
      const r = validateComplaint({ ...ok, ...patch });
      return r.ok ? {} : r.fields;
    };
    expect(f({ name: 'x'.repeat(200) })).toEqual({});
    expect(f({ name: 'x'.repeat(201) })).toHaveProperty('name');
    expect(f({ message: 'x'.repeat(9) })).toEqual({ message: MESSAGES.message });
    expect(f({ message: 'x'.repeat(10) })).toEqual({});
    expect(f({ message: 'x'.repeat(5000) })).toEqual({});
    expect(f({ message: 'x'.repeat(5001) })).toHaveProperty('message');
    expect(f({ message: `   ${'x'.repeat(9)}   ` })).toHaveProperty('message');
    expect(f({ related: 'x'.repeat(500) })).toEqual({});
    expect(f({ related: 'x'.repeat(501) })).toHaveProperty('related');
    expect(f({ category: 'nope' })).toEqual({ category: MESSAGES.category });
    expect(f({ name: 42 })).toEqual({ name: MESSAGES.name });
  });

  it('illegal-content notices need the URL and the good-faith statement', () => {
    const base = { ...ok, category: 'illegal_content' };
    expect(validateComplaint(base)).toEqual({ ok: false, fields: { related: MESSAGES.related, good_faith: MESSAGES.good_faith } });
    expect(validateComplaint({ ...base, related: 'https://x.test', good_faith: 'true' })).toEqual({ ok: false, fields: { good_faith: MESSAGES.good_faith } });
    const good = validateComplaint({ ...base, related: 'https://x.test', good_faith: true });
    expect(good.ok && good.value.goodFaith).toBe(true);
    expect(validateComplaint({ ...ok, good_faith: true })).toMatchObject({ ok: true, value: { goodFaith: true } });
  });

  it('emails', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a.b+c@sub.example.org')).toBe(true);
    for (const bad of ['', 'a', 'a@b', 'a@b.c', '@b.co', 'a@.co', 'a b@c.co', 'a@b.co>', '<a@b.co', 'a@@b.co', `${'x'.repeat(316)}@b.co`]) {
      expect(isEmail(bad), bad).toBe(false);
    }
    expect(isEmail(`${'x'.repeat(315)}@b.co`)).toBe(true);
  });

  it('categories have labels', () => {
    expect(COMPLAINT_CATEGORIES.map((c) => CATEGORY_LABELS[c])).toEqual([
      'Payment or refund',
      'Gigs dispute',
      'Marketplace content',
      'Illegal content notice',
      'Account',
      'Privacy',
      'Other',
    ]);
    expect(isComplaintCategory('privacy')).toBe(true);
    expect(isComplaintCategory('Privacy')).toBe(false);
  });

  it('honeypot', () => {
    expect(isHoneypotHit({})).toBe(false);
    expect(isHoneypotHit({ website: '' })).toBe(false);
    expect(isHoneypotHit({ website: '   ' })).toBe(false);
    expect(isHoneypotHit({ website: 'http://spam' })).toBe(true);
    expect(isHoneypotHit({ website: 1 })).toBe(true);
    expect(isHoneypotHit(null)).toBe(false);
  });

  it('rate limit: 5 an hour, sliding', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();
    expect(rateLimitDecision([], now)).toEqual({ allowed: true });
    expect(rateLimitDecision([at(1), at(2), at(3), at(4)], now)).toEqual({ allowed: true });
    expect(rateLimitDecision([at(1), at(2), at(3), at(4), at(50)], now)).toEqual({ allowed: false, retryAfterSeconds: 600 });
    // Outside the window, in the future or invalid: ignored.
    expect(rateLimitDecision([at(1), at(2), at(3), at(4), at(60), at(-5), 'nope'], now)).toEqual({ allowed: true });
    // Six inside: wait until the second-oldest leaves.
    expect(rateLimitDecision([at(59), at(30), at(1), at(2), at(3), at(4)], now)).toEqual({ allowed: false, retryAfterSeconds: 1800 });
    expect(rateLimitDecision([at(59.999)], now, { limit: 1 })).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(rateLimitDecision([at(0), at(0)], now, { limit: 2, windowMs: 1000 })).toEqual({ allowed: false, retryAfterSeconds: 1 });
  });

  it('client ip', () => {
    const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
    expect(clientIp(h({ 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' }))).toBe('1.2.3.4');
    expect(clientIp(h({ 'x-real-ip': ' 9.9.9.9 ' }))).toBe('9.9.9.9');
    expect(clientIp(h({ 'x-forwarded-for': '', 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9');
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ 'x-real-ip': '  ' }))).toBeNull();
  });
});
