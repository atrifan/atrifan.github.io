/**
 * The AI SDK's fullStream as OpenAI-compatible SSE frames ("data: {...}\n\n", then "data: [DONE]").
 *
 * An `error` part (AI SDK 6 reports an upstream failure this way, not as a throw — e.g. the gateway
 * refusing a model the account cannot use) becomes `data: {"error":{"message","status"}}` and ends the
 * stream with no finish frame and no [DONE], so a client sees a refusal instead of an empty answer.
 */

type StreamPart = { type: string; [k: string]: any };

const frame = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`;

function errorBody(error: unknown): { message: string; status?: number } {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : (error as any)?.message ?? 'Stream error';
  const status = (error as any)?.statusCode ?? (error as any)?.status;
  return typeof status === 'number' ? { message: message || 'Stream error', status } : { message: message || 'Stream error' };
}

export async function* toOpenAiSse(parts: AsyncIterable<StreamPart>): AsyncGenerator<string> {
  let toolCallIndex = 0;
  let finishReason = 'stop';
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null;

  for await (const part of parts) {
    if (part.type === 'text-delta') {
      yield frame({ choices: [{ index: 0, delta: { content: part.text }, finish_reason: null }] });
    } else if (part.type === 'tool-call') {
      finishReason = 'tool_calls';
      yield frame({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: toolCallIndex,
              id: part.toolCallId,
              type: 'function',
              function: { name: part.toolName, arguments: JSON.stringify(part.input) },
            }],
          },
          finish_reason: null,
        }],
      });
      toolCallIndex++;
    } else if (part.type === 'finish') {
      usage = {
        prompt_tokens: part.totalUsage?.inputTokens || 0,
        completion_tokens: part.totalUsage?.outputTokens || 0,
      };
    } else if (part.type === 'error') {
      yield frame({ error: errorBody(part.error) });
      return;
    }
  }

  yield frame({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }], ...(usage ? { usage } : {}) });
  yield 'data: [DONE]\n\n';
}

export { errorBody as sseErrorBody };
