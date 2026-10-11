/**
 * Agent identities: an AI agent acting for a user through the Jobs MCP. Each OAuth client
 * (or API key) of a user maps to one `agent_identities` row owned by the user's principal.
 * Bids, progress posts and steering answers record which agent did them.
 */
import { jobsDb } from './db';
import { dbError, isUniqueViolation } from './errors';
import { ensureUserPrincipal } from './principals';
import type { AgentIdentityRow } from './types';

export type AgentClient =
  | { kind: 'oauth'; clientId: string }
  | { kind: 'api_key'; apiKeyId: string }
  | { kind: 'test'; clientId: string };

export interface AgentInfo {
  name?: string;
  version?: string;
}

/** Refresh `last_seen_at` at most this often, so not every request writes. */
const SEEN_REFRESH_MS = 5 * 60 * 1000;

function defaultName(client: AgentClient): string {
  if (client.kind === 'api_key') return 'API key agent';
  if (client.kind === 'test') return `Test agent (${client.clientId})`.slice(0, 200);
  return 'MCP agent';
}

function clean(value: string | undefined, max: number): string | undefined {
  const v = value?.trim();
  return v ? v.slice(0, max) : undefined;
}

async function find(userId: string, client: AgentClient): Promise<AgentIdentityRow | null> {
  let q = jobsDb().from('agent_identities').select('*').eq('user_id', userId).eq('client_kind', client.kind);
  q = client.kind === 'api_key' ? q.eq('api_key_id', client.apiKeyId) : q.eq('oauth_client_id', client.clientId);
  const { data, error } = await q.maybeSingle();
  if (error) throw dbError(error, 'find agent identity');
  return data as AgentIdentityRow | null;
}

/** Get or create the caller's agent identity, updating name/version from MCP clientInfo. */
export async function resolveAgentIdentity(userId: string, client: AgentClient, info: AgentInfo = {}): Promise<AgentIdentityRow> {
  const name = clean(info.name, 200);
  const version = clean(info.version, 100);
  const existing = await find(userId, client);
  if (existing) {
    const changes: Partial<AgentIdentityRow> = {};
    if (name && name !== existing.name) changes.name = name;
    if (version && version !== existing.version) changes.version = version;
    const seen = existing.last_seen_at ? Date.parse(existing.last_seen_at) : 0;
    if (Object.keys(changes).length === 0 && Date.now() - seen < SEEN_REFRESH_MS) return existing;
    const { data, error } = await jobsDb()
      .from('agent_identities')
      .update({ ...changes, last_seen_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw dbError(error, 'update agent identity');
    return data as AgentIdentityRow;
  }

  const principal = await ensureUserPrincipal(userId);
  const { data, error } = await jobsDb()
    .from('agent_identities')
    .insert({
      user_id: userId,
      owner_principal_id: principal.id,
      name: name ?? defaultName(client),
      version: version ?? null,
      client_kind: client.kind,
      oauth_client_id: client.kind === 'api_key' ? null : client.clientId,
      api_key_id: client.kind === 'api_key' ? client.apiKeyId : null,
      last_seen_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      const raced = await find(userId, client);
      if (raced) return raced;
    }
    throw dbError(error, 'create agent identity');
  }
  return data as AgentIdentityRow;
}
