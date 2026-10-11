/**
 * Tool registry for the Jobs MCP. Pure: tool modules (src/lib/jobs/mcp/tools/*.ts) each
 * export `tools`; `buildRegistry` checks them once and turns calls into MCP results.
 *
 * - Arguments are validated with the tool's zod schema; failures are tool errors
 *   `invalid_request` with the zod issues, so the agent can fix its call.
 * - A JobsError becomes a tool error `{ error: code, message, status, ...details }`, the same
 *   codes the HTTP routes return.
 * - An unknown tool is a JSON-RPC -32602 error.
 */
import type { z } from 'zod';
import { JobsError } from '../errors.ts';
import { InvalidTransitionError } from '../job-state.ts';
import { JSONRPC_ERROR, JsonRpcError, toolResult, type ToolCallResult } from '../../mcp/jsonrpc-core.ts';

export interface JsonObjectSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDef<Ctx, I> {
  name: string;
  description: string;
  inputSchema: JsonObjectSchema;
  input: z.ZodType<I, z.ZodTypeDef, unknown>;
  annotations?: ToolAnnotations;
  handler(args: I, ctx: Ctx): Promise<Record<string, unknown>>;
}

/** Erased tool type for module lists (the handler is only called with parsed input). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolDef<Ctx> = ToolDef<Ctx, any>;

export interface ToolModule<Ctx> {
  tools: readonly AnyToolDef<Ctx>[];
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonObjectSchema;
  annotations?: ToolAnnotations;
}

export interface Registry<Ctx> {
  names(): string[];
  list(): ToolDescriptor[];
  has(name: string): boolean;
  call(name: string, args: unknown, ctx: Ctx): Promise<ToolCallResult>;
}

/** Identity helper that keeps the handler's argument type tied to the zod schema. */
export function defineTool<Ctx, I>(def: ToolDef<Ctx, I>): ToolDef<Ctx, I> {
  return def;
}

const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;

function check<Ctx>(tool: AnyToolDef<Ctx>): void {
  if (typeof tool.name !== 'string' || !NAME_RE.test(tool.name)) throw new Error(`Invalid tool name: ${String(tool.name)}`);
  if (typeof tool.description !== 'string' || tool.description.trim() === '') {
    throw new Error(`Tool ${tool.name} needs a description`);
  }
  const schema = tool.inputSchema as Partial<JsonObjectSchema> | undefined;
  if (!schema || schema.type !== 'object' || typeof schema.properties !== 'object' || schema.properties === null) {
    throw new Error(`Tool ${tool.name}: inputSchema must be an object schema`);
  }
  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
      throw new Error(`Tool ${tool.name}: inputSchema requires unknown property ${key}`);
    }
  }
}

function errorPayload(err: unknown): Record<string, unknown> {
  if (err instanceof JobsError) {
    const payload: Record<string, unknown> = {};
    if (Array.isArray(err.details)) {
      payload.issues = err.details;
    } else if (err.details && typeof err.details === 'object') {
      Object.assign(payload, err.details);
    }
    return { ...payload, error: err.code, message: err.message, status: err.status };
  }
  if (err instanceof InvalidTransitionError) return { error: 'invalid_state', message: err.message, status: 409 };
  console.error('[jobs-mcp] unexpected tool error:', err);
  return { error: 'internal_error', message: 'Something went wrong', status: 500 };
}

export function buildRegistry<Ctx>(modules: readonly ToolModule<Ctx>[]): Registry<Ctx> {
  const byName = new Map<string, AnyToolDef<Ctx>>();
  for (const mod of modules) {
    for (const tool of mod.tools) {
      check(tool);
      if (byName.has(tool.name)) throw new Error(`Duplicate tool name: ${tool.name}`);
      byName.set(tool.name, tool);
    }
  }
  const descriptors: ToolDescriptor[] = [...byName.values()].map((t) => {
    const d: ToolDescriptor = { name: t.name, description: t.description, inputSchema: t.inputSchema };
    if (t.annotations) d.annotations = t.annotations;
    return d;
  });

  return {
    names: () => [...byName.keys()],
    list: () => descriptors,
    has: (name) => byName.has(name),
    async call(name, args, ctx) {
      const tool = byName.get(name);
      if (!tool) throw new JsonRpcError(JSONRPC_ERROR.INVALID_PARAMS, `Unknown tool: ${name}`);
      const parsed = tool.input.safeParse(args ?? {});
      if (!parsed.success) {
        return toolResult(
          { error: 'invalid_request', message: `Invalid arguments for ${name}`, status: 400, issues: parsed.error.issues },
          true,
        );
      }
      try {
        return toolResult(await tool.handler(parsed.data, ctx));
      } catch (err) {
        return toolResult(errorPayload(err), true);
      }
    },
  };
}
