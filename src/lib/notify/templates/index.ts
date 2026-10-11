import { NOTIFICATION_LABELS, type NotificationType, type Payload } from '../types.ts';
import { buildContent } from './content.ts';
import { renderHtml, renderText } from './layout.ts';

export interface RenderContext {
  recipientName: string | null;
  unsubscribeUrl: string;
  preferencesUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderEmail<T extends NotificationType>(type: T, payload: Payload<T>, ctx: RenderContext): RenderedEmail {
  const content = buildContent(type, payload);
  const layout = { ...ctx, typeLabel: NOTIFICATION_LABELS[type] };
  return { subject: content.subject, html: renderHtml(content, layout), text: renderText(content, layout) };
}
