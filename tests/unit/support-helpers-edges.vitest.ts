/** Edge cases for the support helpers, from mutation testing (Stryker) survivors. */
import { describe, expect, it } from 'vitest';
import { replySubject, REFERENCE_ALPHABET } from '@/src/lib/support/reference';
import { decodeEntities, htmlToText, sanitizeHtml } from '@/src/lib/support/sanitize-html';
import { headerValue, parseAddress, replyHeaders } from '@/src/lib/support/mail-headers';
import { MESSAGES, validateComplaint } from '@/src/lib/support/complaint';
import { contactEmailFrom, LEGAL_UPDATED_DATE, TERMS_EFFECTIVE_DATE, TERMS_VERSION } from '@/src/lib/legal/facts';

const KEPT = ['abbr', 'b', 'blockquote', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul'];
const DROPPED = ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'applet', 'svg', 'math', 'template', 'noscript', 'head', 'title', 'textarea', 'select', 'button', 'option', 'xmp', 'noembed', 'noframes', 'plaintext'];

describe('sanitizeHtml allow-lists', () => {
  it.each(KEPT)('keeps <%s>', (t) => {
    expect(sanitizeHtml(`<${t}>x</${t}>`)).toBe(`<${t}>x</${t}>`);
  });

  it('keeps the void tags br and hr without closing them', () => {
    expect(sanitizeHtml('a<br>b<hr/>c')).toBe('a<br>b<hr>c');
  });

  it.each(DROPPED)('drops <%s> with its content', (t) => {
    expect(sanitizeHtml(`<${t}>secret</${t}>after`)).toBe('after');
  });

  it('a void or self-closed dangerous tag does not swallow what follows', () => {
    expect(sanitizeHtml('<embed src="x">after')).toBe('after');
    expect(sanitizeHtml('<iframe src="x"/>after')).toBe('after');
    expect(sanitizeHtml('<script/>after')).toBe('after');
  });

  it('only the matching closer ends a dropped element', () => {
    expect(sanitizeHtml('<script>a</b>b</style>c</script>d')).toBe('d');
  });

  it('keeps title on abbr and a, and colspan/rowspan of 1 to 3 digits on td and th', () => {
    expect(sanitizeHtml('<abbr title="Hyper Text">HT</abbr>')).toBe('<abbr title="Hyper Text">HT</abbr>');
    expect(sanitizeHtml('<a title=\'a b\' href=https://x.test/y>t</a>')).toBe(
      '<a title="a b" href="https://x.test/y" rel="noopener noreferrer nofollow" target="_blank">t</a>',
    );
    expect(sanitizeHtml('<table><tr><th rowspan="2" colspan="123">h</th><td colspan="1234">c</td><td colspan="x2">d</td></tr></table>')).toBe(
      '<table><tr><th rowspan="2" colspan="123">h</th><td>c</td><td>d</td></tr></table>',
    );
    expect(sanitizeHtml('<p title="t">p</p>')).toBe('<p>p</p>');
    expect(sanitizeHtml('<td rowspan="3">c</td>')).toBe('<td rowspan="3">c</td>');
  });

  it('keeps the first of two hrefs only', () => {
    expect(sanitizeHtml('<a href="https://a.test" href="https://b.test">x</a>')).toBe(
      '<a href="https://a.test" rel="noopener noreferrer nofollow" target="_blank">x</a>',
    );
  });

  it('a quoted ">" stays inside the attribute', () => {
    expect(sanitizeHtml('<a title="a>b" href="https://x.test">t</a>')).toBe(
      '<a title="a&gt;b" href="https://x.test" rel="noopener noreferrer nofollow" target="_blank">t</a>',
    );
  });

  it('removes comments, CDATA, doctype and processing instructions, closed or not', () => {
    expect(sanitizeHtml('a<!-- c -->b')).toBe('ab');
    expect(sanitizeHtml('a<!-- never closed <p>x</p>')).toBe('a');
    expect(sanitizeHtml('a<![CDATA[<b>x</b>]]>b')).toBe('ab');
    expect(sanitizeHtml('a<![CDATA[never closed')).toBe('a');
    expect(sanitizeHtml('<?xml version="1.0"?>x')).toBe('x');
    expect(sanitizeHtml('<!DOCTYPE html>x')).toBe('x');
  });

  it('decodes the highest code point and nothing above it', () => {
    expect(decodeEntities('&#x10FFFF;')).toBe(String.fromCodePoint(0x10ffff));
    expect(decodeEntities('&#1114112;')).toBe('');
  });

  it('htmlToText', () => {
    expect(htmlToText('a<br />b<BR>c')).toBe('a\nb\nc');
    expect(htmlToText('<h2>T</h2>x')).toBe('T\nx');
    expect(htmlToText('<script>\nvar a = 1;\n</script>ok')).toBe('ok');
    expect(htmlToText('<head><title>t</title></head>b')).toBe('b');
  });
});

describe('reference edges', () => {
  it('the alphabet is Crockford base32', () => {
    expect(REFERENCE_ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
  });

  it.each([
    ['Fwd: Refund', 'Re: Refund [TZ-7K3M-Q9XD]'],
    ['Fw: Refund', 'Re: Refund [TZ-7K3M-Q9XD]'],
    ['  Re: Refund', 'Re: Refund [TZ-7K3M-Q9XD]'],
    ['Re:Refund', 'Re: Refund [TZ-7K3M-Q9XD]'],
    ['RE :  Refund', 'Re: Refund [TZ-7K3M-Q9XD]'],
    ['Refund re: payment', 'Re: Refund re: payment [TZ-7K3M-Q9XD]'],
    ['Free: offer', 'Re: Free: offer [TZ-7K3M-Q9XD]'],
    ['xRe: Refund', 'Re: xRe: Refund [TZ-7K3M-Q9XD]'],
  ])('replySubject(%j)', (subject, expected) => {
    expect(replySubject(subject, 'TZ-7K3M-Q9XD')).toBe(expected);
  });
});

describe('mail header edges', () => {
  it('parseAddress trims both parts and needs the whole value to be "name <address>"', () => {
    expect(parseAddress('"  Cara  " < Cara@X.test >')).toEqual({ name: 'Cara', address: 'cara@x.test' });
    expect(parseAddress('A"B <c@d.test>')).toEqual({ name: null, address: 'a"b <c@d.test>' });
    expect(parseAddress('Cara <c@d.test> trailing')).toEqual({ name: null, address: 'cara <c@d.test> trailing' });
  });

  it('headerValue picks the named header among several', () => {
    expect(headerValue({ From: 'a', 'Message-ID': '<m@x>', To: 'b' }, 'message-id')).toBe('<m@x>');
  });

  it('In-Reply-To is the latest inbound id even when a reply came after it', () => {
    expect(
      replyHeaders([
        { direction: 'inbound', message_id: '<1@a>' },
        { direction: 'outbound', message_id: '<2@t>' },
      ]),
    ).toEqual({ 'In-Reply-To': '<1@a>', References: '<1@a> <2@t>' });
  });
});

describe('complaint message texts (shown in the form)', () => {
  it('are the agreed wording', () => {
    expect(MESSAGES).toEqual({
      category: 'Choose a category.',
      name: 'Enter your name.',
      email: 'Enter a valid email address.',
      related: 'Give the exact URL of the content.',
      message: 'Write at least 10 characters.',
      good_faith: 'Confirm the statement to send a notice.',
    });
  });

  it('over-long fields say the limit', () => {
    const r = validateComplaint({
      category: 'other',
      name: 'x'.repeat(201),
      email: 'a@b.co',
      related: 'x'.repeat(501),
      message: 'x'.repeat(5001),
    });
    expect(r).toEqual({
      ok: false,
      fields: { name: 'Use at most 200 characters.', related: 'Use at most 500 characters.', message: 'Use at most 5000 characters.' },
    });
  });
});

describe('legal constants', () => {
  it('version and dates', () => {
    expect([TERMS_VERSION, TERMS_EFFECTIVE_DATE, LEGAL_UPDATED_DATE]).toEqual(['1.0', '2026-10-12', '2026-10-12']);
  });

  it('a contact address with trailing junk is not an address', () => {
    expect(contactEmailFrom({ LEGAL_CONTACT_EMAIL: 'a@b.co extra' })).toBeNull();
  });
});
