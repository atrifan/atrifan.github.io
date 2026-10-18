import { describe, expect, it } from 'vitest';
import { toOpenAiSse } from '@/src/lib/chat-openai-sse';

// The chat route turns the AI SDK's stream into OpenAI-shaped SSE frames. AI SDK 6 delivers an
// upstream failure (e.g. the gateway's 403 for a model the account cannot use) as an `error`
// part rather than a throw; it used to be skipped, so the caller got finish_reason "stop" with no
// text and could not tell a refusal from an empty answer.

async function* parts(list: unknown[]) {
  for (const p of list) yield p as any;
}

async function frames(list: unknown[]) {
  const out: string[] = [];
  for await (const f of toOpenAiSse(parts(list))) out.push(f);
  return out;
}

const data = (frame: string) => (frame.trim() === 'data: [DONE]' ? '[DONE]' : JSON.parse(frame.replace(/^data: /, '')));

describe('toOpenAiSse', () => {
  it('streams text, then a finish frame with usage, then [DONE]', async () => {
    const out = await frames([
      { type: 'text-delta', text: 'Hel' },
      { type: 'text-delta', text: 'lo' },
      { type: 'finish', totalUsage: { inputTokens: 7, outputTokens: 2 } },
    ]);
    expect(out.map(data)).toEqual([
      { choices: [{ index: 0, delta: { content: 'Hel' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: { content: 'lo' }, finish_reason: null }] },
      { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 7, completion_tokens: 2 } },
      '[DONE]',
    ]);
  });

  it('streams a tool call and finishes with tool_calls', async () => {
    const out = (await frames([
      { type: 'tool-call', toolCallId: 'c1', toolName: 'RECALL', input: { q: 'x' } },
      { type: 'finish', totalUsage: { inputTokens: 1, outputTokens: 1 } },
    ])).map(data);
    expect(out[0].choices[0].delta.tool_calls[0]).toEqual({
      index: 0, id: 'c1', type: 'function', function: { name: 'RECALL', arguments: '{"q":"x"}' },
    });
    expect(out[1].choices[0].finish_reason).toBe('tool_calls');
  });

  it('an upstream error part becomes an error frame with its message and status, and no finish or [DONE]', async () => {
    const err = Object.assign(new Error('Free tier users do not have access to this model.'), { statusCode: 403 });
    const out = await frames([{ type: 'error', error: err }]);
    expect(out.map(data)).toEqual([
      { error: { message: 'Free tier users do not have access to this model.', status: 403 } },
    ]);
  });

  it('an error part that is not an Error still carries a message', async () => {
    const out = (await frames([{ type: 'error', error: 'boom' }])).map(data);
    expect(out).toEqual([{ error: { message: 'boom' } }]);
  });

  it('text before an error is kept, then the error ends the stream', async () => {
    const out = (await frames([
      { type: 'text-delta', text: 'partial' },
      { type: 'error', error: new Error('upstream reset') },
      { type: 'text-delta', text: 'never' },
    ])).map(data);
    expect(out).toEqual([
      { choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }] },
      { error: { message: 'upstream reset' } },
    ]);
  });
});
