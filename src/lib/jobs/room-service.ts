/**
 * The job room: what the two parties of a contract share. Contract detail and version
 * history, messages and progress posts, milestones and the activity feed. Everything is
 * filtered to contract parties: an unknown contract is 404, someone else's is 403.
 * Shared by the HTTP routes (app/api/contracts/**) and the Jobs MCP tools.
 */
import { jobsDb } from './db';
import { JobsError, dbError, notFound } from './errors';
import { isUuid, loadJob, loadSpecVersion } from './jobs-service';
import { loadContract } from './contracts-service';
import { ensureUserPrincipal } from './principals';
import { pausesWork, remainingCredits } from './steering';
import { parseSeqCursor, parseTimeCursor, type ContractListInput, type MilestoneUpdateInput, type ProgressPostInput } from './room-schemas';
import type {
  ActivityEventRow,
  ContractRow,
  ContractVersionRow,
  JobMessageRow,
  JobSpecVersionRow,
  MilestoneRow,
  PartyRole,
  SteeringRequestRow,
} from './types';

const PAGE = 200;

export interface Actor {
  userId: string;
  role: PartyRole;
  agentIdentityId?: string | null;
}

export interface PartyContract {
  contract: ContractRow;
  role: PartyRole;
}

/** The contract and the caller's role in it; 404 if unknown, 403 if not a party. */
export async function getContractForParty(userId: string, contractId: string): Promise<PartyContract> {
  if (!isUuid(contractId)) throw notFound('Contract not found');
  const contract = await loadContract(contractId);
  if (!contract) throw notFound('Contract not found');
  if (contract.customer_user_id === userId) return { contract, role: 'customer' };
  if (contract.provider_user_id === userId) return { contract, role: 'provider' };
  throw new JobsError('forbidden', 403, 'Only the customer and the provider of this contract can see it');
}

export function requireRole(pc: PartyContract, role: PartyRole, action: string): void {
  if (pc.role !== role) throw new JobsError('forbidden', 403, `Only the ${role} can ${action}`);
}

/** Work happens (progress, milestones, steering) only once the contract is paid and open. */
const WORKING_STATUSES = new Set(['active', 'rework']);

export function requireWorking(contract: ContractRow): void {
  if (!WORKING_STATUSES.has(contract.status)) {
    throw new JobsError('invalid_state', 409, `The contract is ${contract.status}; this needs an active contract`);
  }
}

// ---------- versions, steering summary ----------

export async function listContractVersions(contractId: string): Promise<ContractVersionRow[]> {
  const { data, error } = await jobsDb()
    .from('contract_versions')
    .select('*')
    .eq('contract_id', contractId)
    .order('version', { ascending: true });
  if (error) throw dbError(error, 'list contract versions');
  return (data ?? []) as ContractVersionRow[];
}

export async function listSteeringRows(contractId: string): Promise<SteeringRequestRow[]> {
  const { data, error } = await jobsDb()
    .from('steering_requests')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list steering');
  return (data ?? []) as SteeringRequestRow[];
}

export type VersionState = 'current' | 'superseded' | 'proposed' | 'rejected';

/** Derive each version's state from the contract's current version and open scope changes. */
export function versionStates(
  versions: ContractVersionRow[],
  currentVersionId: string | null,
  steering: SteeringRequestRow[],
): Array<ContractVersionRow & { state: VersionState }> {
  const current = versions.find((v) => v.id === currentVersionId);
  const proposed = new Set(
    steering.filter((s) => s.status === 'awaiting_provider' || s.status === 'awaiting_approval').map((s) => s.new_contract_version_id),
  );
  return versions.map((v) => {
    let state: VersionState;
    if (v.id === currentVersionId) state = 'current';
    else if (proposed.has(v.id)) state = 'proposed';
    else if (current && v.version < current.version) state = 'superseded';
    else state = 'rejected';
    return { ...v, state };
  });
}

export function steeringCredits(current: ContractVersionRow | undefined, steering: SteeringRequestRow[]) {
  const allowance = current?.steering_allowance ?? 0;
  const used = steering.filter((s) => s.status !== 'cancelled').reduce((sum, s) => sum + s.credit_cost, 0);
  return { allowance, used, remaining: remainingCredits(allowance, used) };
}

export async function isWorkPaused(contractId: string): Promise<boolean> {
  return (await listSteeringRows(contractId)).some(pausesWork);
}

export interface ContractDetail {
  contract: ContractRow;
  role: PartyRole;
  job: { id: string; title: string; status: string } | null;
  spec: JobSpecVersionRow | null;
  current_version: ContractVersionRow | null;
  versions: Array<ContractVersionRow & { state: VersionState }>;
  work_paused: boolean;
  steering_credits: { allowance: number; used: number; remaining: number };
}

export async function getContractDetail(userId: string, contractId: string): Promise<ContractDetail> {
  const { contract, role } = await getContractForParty(userId, contractId);
  const [job, versions, steering] = await Promise.all([
    loadJob(contract.job_id),
    listContractVersions(contract.id),
    listSteeringRows(contract.id),
  ]);
  const current = versions.find((v) => v.id === contract.current_version_id);
  const spec = current ? await loadSpecVersion(current.spec_version_id) : null;
  return {
    contract,
    role,
    job: job ? { id: job.id, title: job.title, status: job.status } : null,
    spec,
    current_version: current ?? null,
    versions: versionStates(versions, contract.current_version_id, steering),
    work_paused: steering.some(pausesWork),
    steering_credits: steeringCredits(current, steering),
  };
}

export interface ContractSummary {
  id: string;
  job_id: string;
  job_title: string | null;
  status: string;
  role: PartyRole;
  current_version: Pick<ContractVersionRow, 'id' | 'version' | 'price_cents' | 'customer_total_cents' | 'currency' | 'deadline' | 'steering_allowance'> | null;
  created_at: string;
  updated_at: string;
}

export async function listContractsForUser(userId: string, query: ContractListInput): Promise<ContractSummary[]> {
  const roles: PartyRole[] = query.role ? [query.role] : ['customer', 'provider'];
  const rows: Array<{ row: ContractRow & { jobs?: { title: string } | null }; role: PartyRole }> = [];
  for (const role of roles) {
    let q = jobsDb()
      .from('contracts')
      .select('*, jobs(title)')
      .eq(role === 'customer' ? 'customer_user_id' : 'provider_user_id', userId);
    if (query.status) q = q.eq('status', query.status);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(PAGE);
    if (error) throw dbError(error, 'list contracts');
    for (const row of (data ?? []) as Array<ContractRow & { jobs?: { title: string } | null }>) rows.push({ row, role });
  }
  const versionIds = rows.map((r) => r.row.current_version_id).filter((v): v is string => !!v);
  const versions = new Map<string, ContractVersionRow>();
  if (versionIds.length > 0) {
    const { data, error } = await jobsDb().from('contract_versions').select('*').in('id', versionIds);
    if (error) throw dbError(error, 'list current versions');
    for (const v of (data ?? []) as ContractVersionRow[]) versions.set(v.id, v);
  }
  rows.sort((a, b) => (a.row.created_at < b.row.created_at ? 1 : -1));
  return rows.map(({ row, role }) => {
    const v = row.current_version_id ? versions.get(row.current_version_id) : undefined;
    return {
      id: row.id,
      job_id: row.job_id,
      job_title: row.jobs?.title ?? null,
      status: row.status,
      role,
      current_version: v
        ? {
            id: v.id,
            version: v.version,
            price_cents: v.price_cents,
            customer_total_cents: v.customer_total_cents,
            currency: v.currency,
            deadline: v.deadline,
            steering_allowance: v.steering_allowance,
          }
        : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

// ---------- activity ----------

export async function recordActivity(
  contractId: string,
  actor: Actor | null,
  type: string,
  summary: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await jobsDb()
    .from('activity_events')
    .insert({
      contract_id: contractId,
      user_id: actor?.userId ?? null,
      actor_role: actor?.role ?? 'system',
      agent_identity_id: actor?.agentIdentityId ?? null,
      type,
      summary: summary.slice(0, 500),
      data,
    });
  if (error) throw dbError(error, 'record activity');
}

function seqCursor(raw: string | null | undefined): number | null {
  const since = parseSeqCursor(raw);
  if (since === 'invalid') throw new JobsError('invalid_request', 400, 'since must be a cursor returned as next_cursor');
  return since;
}

function timeCursor(raw: string | null | undefined): string | null {
  const since = parseTimeCursor(raw);
  if (since === 'invalid') throw new JobsError('invalid_request', 400, 'since must be a cursor returned as next_cursor');
  return since;
}

async function seqFeed<T extends { seq: number }>(table: string, contractId: string, since: number | null) {
  let q = jobsDb().from(table).select('*').eq('contract_id', contractId);
  if (since != null) q = q.gt('seq', since);
  const { data, error } = await q.order('seq', { ascending: true }).limit(PAGE);
  if (error) throw dbError(error, `read ${table}`);
  const rows = (data ?? []) as T[];
  const last = rows.length > 0 ? rows[rows.length - 1].seq : since ?? 0;
  return { rows, next_cursor: String(last) };
}

export async function listActivity(userId: string, contractId: string, sinceRaw?: string | null) {
  const { contract } = await getContractForParty(userId, contractId);
  const { rows, next_cursor } = await seqFeed<ActivityEventRow>('activity_events', contract.id, seqCursor(sinceRaw));
  return { events: rows, next_cursor };
}

// ---------- messages ----------

export async function listMessages(userId: string, contractId: string, sinceRaw?: string | null) {
  const { contract } = await getContractForParty(userId, contractId);
  const { rows, next_cursor } = await seqFeed<JobMessageRow>('job_messages', contract.id, seqCursor(sinceRaw));
  return { messages: rows, next_cursor };
}

async function insertMessage(
  contractId: string,
  actor: Actor,
  kind: JobMessageRow['kind'],
  body: string,
  metadata: Record<string, unknown> = {},
): Promise<JobMessageRow> {
  const principal = await ensureUserPrincipal(actor.userId);
  const { data, error } = await jobsDb()
    .from('job_messages')
    .insert({
      contract_id: contractId,
      user_id: actor.userId,
      author_principal_id: principal.id,
      agent_identity_id: actor.agentIdentityId ?? null,
      author_role: actor.role,
      kind,
      body,
      metadata,
    })
    .select('*')
    .single();
  if (error) throw dbError(error, 'post message');
  return data as JobMessageRow;
}

/** A chat message from either party, in any contract status. */
export async function postMessage(
  userId: string,
  contractId: string,
  body: string,
  opts: { agentIdentityId?: string | null; metadata?: Record<string, unknown> } = {},
): Promise<JobMessageRow> {
  const { contract, role } = await getContractForParty(userId, contractId);
  return insertMessage(contract.id, { userId, role, agentIdentityId: opts.agentIdentityId }, 'message', body, opts.metadata);
}

/** A progress summary from the provider while the work is running. */
export async function postProgress(
  userId: string,
  input: ProgressPostInput,
  agentIdentityId: string | null,
): Promise<JobMessageRow> {
  const pc = await getContractForParty(userId, input.contract_id);
  requireRole(pc, 'provider', 'post progress');
  requireWorking(pc.contract);
  const actor: Actor = { userId, role: 'provider', agentIdentityId };
  const body = input.details ? `${input.summary}\n\n${input.details}` : input.summary;
  const metadata: Record<string, unknown> = {};
  if (input.percent_complete !== undefined) metadata.percent_complete = input.percent_complete;
  const message = await insertMessage(pc.contract.id, actor, 'progress', body, metadata);
  await recordActivity(pc.contract.id, actor, 'progress_posted', input.summary, { message_id: message.id, ...metadata });
  return message;
}

/** Internal: a provider message tied to a steering answer. */
export async function postSteeringReply(contractId: string, actor: Actor, body: string, steeringId: string): Promise<void> {
  await insertMessage(contractId, actor, 'message', body, { steering_id: steeringId });
}

// ---------- milestones ----------

export async function listMilestones(userId: string, contractId: string, sinceRaw?: string | null) {
  const { contract } = await getContractForParty(userId, contractId);
  return listMilestonesFor(contract.id, timeCursor(sinceRaw));
}

export async function listMilestonesFor(contractId: string, since: string | null = null) {
  let q = jobsDb().from('milestones').select('*').eq('contract_id', contractId);
  if (since) q = q.gt('updated_at', since);
  const { data, error } = await q.order('position', { ascending: true }).order('created_at', { ascending: true });
  if (error) throw dbError(error, 'list milestones');
  const milestones = (data ?? []) as MilestoneRow[];
  const latest = milestones.reduce<string | null>((max, m) => (!max || m.updated_at > max ? m.updated_at : max), since);
  return { milestones, next_cursor: latest ?? new Date(0).toISOString() };
}

/** Create (no milestone_id) or update a milestone. Provider only, while the work is not paused. */
export async function updateMilestone(
  userId: string,
  input: MilestoneUpdateInput,
  agentIdentityId: string | null,
): Promise<MilestoneRow> {
  const pc = await getContractForParty(userId, input.contract_id);
  requireRole(pc, 'provider', 'update milestones');
  requireWorking(pc.contract);
  if (await isWorkPaused(pc.contract.id)) {
    throw new JobsError('work_paused', 409, 'Work is paused until the customer approves the pending scope change (and pays any top-up)');
  }
  const actor: Actor = { userId, role: 'provider', agentIdentityId };
  const completedAt = input.status === 'done' ? new Date().toISOString() : null;
  const db = jobsDb();

  if (!input.milestone_id) {
    const { count, error: countError } = await db
      .from('milestones')
      .select('id', { count: 'exact', head: true })
      .eq('contract_id', pc.contract.id);
    if (countError) throw dbError(countError, 'count milestones');
    const { data, error } = await db
      .from('milestones')
      .insert({
        contract_id: pc.contract.id,
        user_id: userId,
        title: input.title!,
        description: input.description ?? null,
        status: input.status,
        position: count ?? 0,
        due_at: input.due_at ?? null,
        completed_at: completedAt,
      })
      .select('*')
      .single();
    if (error) throw dbError(error, 'create milestone');
    const m = data as MilestoneRow;
    await recordActivity(pc.contract.id, actor, 'milestone_created', `Milestone "${m.title}" added (${m.status})`, { milestone_id: m.id, status: m.status });
    return m;
  }

  const { data: existing, error: findError } = await db
    .from('milestones')
    .select('*')
    .eq('id', input.milestone_id)
    .eq('contract_id', pc.contract.id)
    .maybeSingle();
  if (findError) throw dbError(findError, 'find milestone');
  if (!existing) throw notFound('Milestone not found');
  const prev = existing as MilestoneRow;
  const changes: Partial<MilestoneRow> = { status: input.status };
  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = input.description;
  if (input.due_at !== undefined) changes.due_at = input.due_at;
  // keep the original completion time if it was already done
  changes.completed_at = input.status === 'done' ? prev.completed_at ?? completedAt : null;
  const { data, error } = await db.from('milestones').update(changes).eq('id', prev.id).select('*').single();
  if (error) throw dbError(error, 'update milestone');
  const m = data as MilestoneRow;
  const summary = prev.status === m.status ? `Milestone "${m.title}" updated` : `Milestone "${m.title}": ${prev.status} → ${m.status}`;
  await recordActivity(pc.contract.id, actor, 'milestone_updated', summary, { milestone_id: m.id, from: prev.status, status: m.status });
  return m;
}
