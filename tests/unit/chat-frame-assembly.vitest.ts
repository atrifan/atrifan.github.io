import { describe, expect, it } from 'vitest';
import { applyStreamFrame, contentText, doneText, isStreamFrame } from '@/src/views/remote-chat/model/frame-assembly';

type E = Parameters<typeof applyStreamFrame>[0];
const base = (over: Partial<E> = {}): E => ({ content: '', streaming: true, ...over });

describe('contentText', () => {
  it('accepts a plain string, a { text } object or Anthropic text blocks', () => {
    expect(contentText('hi')).toBe('hi');
    expect(contentText({ text: 'obj' })).toBe('obj');
    expect(
      contentText([
        { type: 'text', text: 'one' },
        { type: 'tool_use', id: 't', name: 'x', input: {} },
        { type: 'text', text: 'two' },
        'three',
      ]),
    ).toBe('one\n\ntwo\n\nthree');
  });

  it('returns an empty string for anything else', () => {
    for (const v of [undefined, null, 5, {}, { text: 4 }, [], [{ type: 'text' }], [{ type: 'text', text: 5 }], [{ type: 'image', text: 'x' }]]) {
      expect(contentText(v)).toBe('');
    }
  });
});

describe('doneText', () => {
  it('reads the finished message the device puts on STREAM_DONE', () => {
    expect(doneText({ type: 'STREAM_DONE', message: { role: 'assistant', content: 'final' } })).toBe('final');
    expect(doneText({ type: 'STREAM_DONE', message: { role: 'assistant', content: [{ type: 'text', text: 'blk' }] } })).toBe('blk');
  });

  it('is empty when the frame carries no message', () => {
    expect(doneText({ type: 'STREAM_DONE' })).toBe('');
    expect(doneText({ type: 'STREAM_DONE', message: 'x' })).toBe('');
  });
});

describe('applyStreamFrame', () => {
  it('appends STREAM_CHUNK content without mutating the input', () => {
    const e = base({ content: 'Hel' });
    const next = applyStreamFrame(e, { type: 'STREAM_CHUNK', delta: 'lo' });
    expect(next.content).toBe('Hello');
    expect(e.content).toBe('Hel');
  });

  it('routes an action trace into actions and a step sentinel into steps (shared stream parser)', () => {
    let e = base();
    e = applyStreamFrame(e, { type: 'STREAM_CHUNK', delta: 'Opening the page' });
    e = applyStreamFrame(e, { type: 'STREAM_CHUNK', delta: '<!--step-->' });
    e = applyStreamFrame(e, { type: 'STREAM_CHUNK', delta: '*[NAVIGATE]* → example.com' });
    e = applyStreamFrame(e, { type: 'STREAM_CHUNK', delta: 'Done.' });
    expect(e.steps).toEqual(['Opening the page']);
    expect(e.actions).toEqual(['NAVIGATE → example.com']);
    expect(e.content).toBe('Done.');
  });

  it('does not share action/step arrays with the previous entry', () => {
    const e = base({ actions: ['a'], steps: ['s'] });
    const next = applyStreamFrame(e, { type: 'STREAM_CHUNK', delta: '*[CLICK]* → ok' });
    expect(e.actions).toEqual(['a']);
    expect(next.actions).toEqual(['a', 'CLICK → ok']);
    expect(next.steps).not.toBe(e.steps);
  });

  it('accumulates THINKING_CHUNK', () => {
    let e = base();
    e = applyStreamFrame(e, { type: 'THINKING_CHUNK', delta: 'hmm ' });
    e = applyStreamFrame(e, { type: 'THINKING_CHUNK', delta: 'ok' });
    expect(e.thinking).toBe('hmm ok');
  });

  it('ignores chunks without a string delta', () => {
    const e = base({ content: 'x' });
    expect(applyStreamFrame(e, { type: 'STREAM_CHUNK' })).toBe(e);
    expect(applyStreamFrame(e, { type: 'THINKING_CHUNK', delta: 3 })).toBe(e);
  });

  it('STREAM_RESET clears the turn', () => {
    const e = base({ content: 'x', thinking: 't', actions: ['a'], steps: ['s'] });
    expect(applyStreamFrame(e, { type: 'STREAM_RESET' })).toMatchObject({ content: '', thinking: '', actions: [], steps: [] });
  });

  it('STREAM_VERIFY records the self-check state', () => {
    expect(applyStreamFrame(base(), { type: 'STREAM_VERIFY', state: 'verifying' }).verifyState).toBe('verifying');
  });

  it('STREAM_DONE ends streaming and keeps streamed content', () => {
    const next = applyStreamFrame(base({ content: 'streamed' }), {
      type: 'STREAM_DONE',
      inputTokens: 1,
      outputTokens: 2,
      message: { role: 'assistant', content: 'other' },
    });
    expect(next).toMatchObject({ streaming: false, content: 'streamed' });
  });

  it('STREAM_DONE fills an empty bubble from message.content', () => {
    const next = applyStreamFrame(base(), {
      type: 'STREAM_DONE',
      inputTokens: 0,
      outputTokens: 0,
      message: { role: 'assistant', content: 'only in done' },
    });
    expect(next).toMatchObject({ streaming: false, content: 'only in done' });
  });

  it('STREAM_ERROR ends streaming as an error, keeping partial content', () => {
    expect(applyStreamFrame(base(), { type: 'STREAM_ERROR', error: 'boom' })).toMatchObject({
      streaming: false,
      error: true,
      content: 'boom',
    });
    expect(applyStreamFrame(base({ content: 'partial' }), { type: 'STREAM_ERROR', error: 'boom' }).content).toBe('partial');
    expect(applyStreamFrame(base(), { type: 'STREAM_ERROR' }).content).toBe('The request failed.');
    expect(applyStreamFrame(base(), { type: 'STREAM_ERROR', error: 5 }).content).toBe('The request failed.');
    expect(applyStreamFrame(base(), { type: 'STREAM_ERROR', error: '' }).content).toBe('The request failed.');
  });

  it('returns the same entry for frames it does not own', () => {
    const e = base();
    expect(applyStreamFrame(e, { type: 'RENDER_BLOCK', block: {} })).toBe(e);
  });
});

describe('isStreamFrame', () => {
  it('is true for exactly the frames applyStreamFrame assembles', () => {
    for (const t of ['STREAM_CHUNK', 'THINKING_CHUNK', 'STREAM_RESET', 'STREAM_VERIFY', 'STREAM_DONE', 'STREAM_ERROR']) {
      expect(isStreamFrame({ type: t })).toBe(true);
    }
    for (const t of ['RENDER_BLOCK', 'ACTION_APPROVAL_REQUEST', 'stream_chunk', '']) expect(isStreamFrame({ type: t })).toBe(false);
  });
});
