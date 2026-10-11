/**
 * Shared email shell. Table layout with inline styles (Gmail/Outlook strip <style>),
 * plus a prefers-color-scheme block for clients that honour it (Apple Mail, iOS, Outlook.com).
 * Colours are mid-contrast neutrals so clients that force-invert still read well.
 */

export interface EmailContent {
  subject: string;
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** User-supplied text (a question, reason, comment), shown as a quote. */
  quote?: string;
  details?: Array<[label: string, value: string]>;
  cta: { label: string; url: string };
}

export interface LayoutContext {
  recipientName: string | null;
  unsubscribeUrl: string;
  preferencesUrl: string;
  /** Label of the event type, e.g. "New bids", used in the footer. */
  typeLabel: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function oneLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

const C = {
  bg: '#f4f5f7',
  card: '#ffffff',
  text: '#1f2328',
  muted: '#5b636e',
  border: '#e3e6ea',
  accent: '#3b5bdb',
  accentText: '#ffffff',
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const DARK_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
@media (prefers-color-scheme: dark) {
  .t-bg { background-color: #15171a !important; }
  .t-card { background-color: #1f2227 !important; border-color: #30353c !important; }
  .t-text { color: #e8eaed !important; }
  .t-muted { color: #a2a9b3 !important; }
  .t-rule { border-color: #3a4048 !important; }
  .t-btn { background-color: #4263eb !important; }
  .t-link { color: #91a7ff !important; }
}
@media only screen and (max-width: 480px) {
  .t-pad { padding: 24px 20px !important; }
}`;

function greeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : 'Hi there,';
}

export function renderHtml(content: EmailContent, ctx: LayoutContext): string {
  const p = (text: string, cls = 't-text', color = C.text) =>
    `<p class="${cls}" style="margin:0 0 16px;font-size:16px;line-height:24px;color:${color};">${escapeHtml(text)}</p>`;

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border-collapse:collapse;">${content.details
        .map(
          ([label, value]) =>
            `<tr><td class="t-muted t-rule" style="width:1%;padding:8px 24px 8px 0;border-top:1px solid ${C.border};font-size:14px;line-height:20px;color:${C.muted};white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td class="t-text t-rule" style="padding:8px 0;border-top:1px solid ${C.border};font-size:14px;line-height:20px;color:${C.text};word-break:break-word;">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : '';

  const quote = content.quote
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td class="t-text t-rule" style="padding:2px 0 2px 14px;border-left:3px solid ${C.border};font-size:16px;line-height:24px;color:${C.text};word-break:break-word;">${escapeHtml(content.quote)}</td></tr></table>`
    : '';

  const cta = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td class="t-btn" style="border-radius:8px;background-color:${C.accent};"><a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:16px;line-height:20px;font-weight:600;color:${C.accentText};text-decoration:none;border-radius:8px;">${escapeHtml(content.cta.label)}</a></td></tr></table>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(oneLine(content.subject))}</title>
<style>${DARK_CSS}</style>
</head>
<body class="t-bg" style="margin:0;padding:0;background-color:${C.bg};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" class="t-bg" width="100%" cellpadding="0" cellspacing="0" style="background-color:${C.bg};font-family:${FONT};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 16px;"><span class="t-text" style="font-family:${FONT};font-size:20px;line-height:24px;font-weight:700;letter-spacing:-0.3px;color:${C.text};">Tulzo</span></td></tr>
<tr><td class="t-card t-pad" style="background-color:${C.card};border:1px solid ${C.border};border-radius:12px;padding:32px;">
<h1 class="t-text" style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:28px;font-weight:700;color:${C.text};">${escapeHtml(content.heading)}</h1>
${p(greeting(ctx.recipientName))}
${content.paragraphs.map((t) => p(t)).join('\n')}
${quote}
${details}
${cta}
</td></tr>
<tr><td class="t-muted" style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">
You're getting this because you have a Tulzo account and "${escapeHtml(ctx.typeLabel)}" emails are on.<br>
<a class="t-link" href="${escapeHtml(ctx.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline;">Unsubscribe from these emails</a> &middot; <a class="t-link" href="${escapeHtml(ctx.preferencesUrl)}" style="color:${C.muted};text-decoration:underline;">Email preferences</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderText(content: EmailContent, ctx: LayoutContext): string {
  const lines = [content.heading, '', greeting(ctx.recipientName), '', ...content.paragraphs.flatMap((t) => [t, ''])];
  if (content.quote) lines.push(...content.quote.split('\n').map((l) => `> ${l}`), '');
  if (content.details?.length) {
    lines.push(...content.details.map(([label, value]) => `${label}: ${value}`), '');
  }
  lines.push(`${content.cta.label}: ${content.cta.url}`, '', '--', 'Tulzo');
  lines.push(`Unsubscribe from "${ctx.typeLabel}" emails: ${ctx.unsubscribeUrl}`);
  lines.push(`Email preferences: ${ctx.preferencesUrl}`);
  return lines.join('\n');
}
