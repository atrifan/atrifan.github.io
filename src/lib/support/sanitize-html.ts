/**
 * Allow-list HTML sanitiser for inbound support email. Pure, no DOM.
 *
 * The output only ever contains the tags in ALLOWED_TAGS with the attributes in ALLOWED_ATTRS;
 * everything else is rebuilt from scratch, never copied through:
 *  - script, style, iframe, object, embed, svg, math, template, noscript, head, title, textarea,
 *    select, form controls: removed together with their content;
 *  - other unknown tags (html, body, font, center, ...): the tag goes, its text stays;
 *  - every on* handler, style, class, id, src, srcset, ... is dropped;
 *  - links keep only http:, https: and mailto: hrefs (after decoding entities and removing
 *    control characters, so `java&#x09;script:` is caught) and open in a new tab without a referrer;
 *  - images never load: each <img> becomes the text "[image: alt]" (no remote images by default);
 *  - comments, doctype and CDATA are removed; text is re-escaped.
 */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'dd', 'div', 'dl', 'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'li', 'ol', 'p', 'pre', 's', 'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'u', 'ul',
]);
const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'base', 'col', 'area', 'source', 'track', 'wbr', 'embed', 'param']);
/** Removed with everything inside them. */
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'svg', 'math', 'template', 'noscript',
  'head', 'title', 'textarea', 'select', 'button', 'option', 'xmp', 'noembed', 'noframes', 'plaintext',
]);
const ALLOWED_ATTRS: Record<string, readonly string[]> = {
  a: ['href', 'title'],
  abbr: ['title'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};
const SAFE_SCHEMES = ['http:', 'https:', 'mailto:'];

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', colon: ':', tab: '\t', newline: '\n' };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? whole;
  });
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** True for an absolute http(s) or mailto URL. Relative, javascript:, data:, vbscript:, ... are not. */
export function isSafeHref(raw: string): boolean {
  // eslint-disable-next-line no-control-regex
  const v = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase();
  return SAFE_SCHEMES.some((s) => v.startsWith(s));
}

function parseAttrs(source: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '']);
  return out;
}

function openTag(name: string, attrSource: string): string {
  const allowed = ALLOWED_ATTRS[name] ?? [];
  const kept: string[] = [];
  for (const [attr, value] of parseAttrs(attrSource)) {
    if (!allowed.includes(attr) || kept.some((k) => k.startsWith(`${attr}=`))) continue;
    if (attr === 'href' && !isSafeHref(value)) continue;
    if ((attr === 'colspan' || attr === 'rowspan') && !/^\d{1,3}$/.test(value)) continue;
    kept.push(`${attr}="${escapeHtml(decodeEntities(value))}"`);
  }
  if (name === 'a') kept.push('rel="noopener noreferrer nofollow"', 'target="_blank"');
  return `<${name}${kept.length ? ` ${kept.join(' ')}` : ''}>`;
}

function imageText(attrSource: string): string {
  const alt = parseAttrs(attrSource).find(([a]) => a === 'alt')?.[1]?.trim();
  return escapeHtml(alt ? `[image: ${decodeEntities(alt)}]` : '[image]');
}

const TOKEN = /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<![^>]*>?|<\?[^>]*>?|<\/?([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  let out = '';
  const open: string[] = [];
  /** Inside a DROP_WITH_CONTENT element: its name, until the matching close tag. */
  let dropping: string | null = null;
  let last = 0;
  const text = (t: string) => {
    if (!dropping && t) out += escapeHtml(decodeEntities(t));
  };
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(input))) {
    text(input.slice(last, m.index));
    last = TOKEN.lastIndex;
    const name = m[1]?.toLowerCase();
    if (!name) continue; // comment, doctype, CDATA, processing instruction
    const closing = m[0][1] === '/';
    if (dropping) {
      if (closing && name === dropping) dropping = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && !VOID_TAGS.has(name) && !/\/\s*>$/.test(m[0])) dropping = name;
      continue;
    }
    if (name === 'img') {
      if (!closing) out += imageText(m[2] ?? '');
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) continue;
    if (closing) {
      const at = open.lastIndexOf(name);
      if (at === -1) continue;
      while (open.length > at) out += `</${open.pop()}>`;
      continue;
    }
    out += openTag(name, m[2] ?? '');
    if (!VOID_TAGS.has(name)) open.push(name);
  }
  text(input.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  return out;
}

/** Plain text from (unsanitised) HTML, for a text fallback when an email has no text part. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return '';
  const withBreaks = input
    .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(withBreaks).replace(/\n{3,}/g, '\n\n').trim();
}
