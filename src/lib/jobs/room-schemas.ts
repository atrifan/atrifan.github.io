/**
 * Input schemas for the job room (HTTP routes and Jobs MCP tools). Pure (zod only).
 */
import { z } from 'zod';
import { CONTRACT_STATUSES, type ContractStatus } from './job-state.ts';
import { STEERING_KINDS, STEERING_STATUSES, type SteeringStatus } from './steering.ts';

const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });
const item = z.string().trim().min(1).max(2000);

export const PostMessageSchema = z.object({ body: z.string().trim().min(1).max(10000) }).strict();

export const ProgressPostSchema = z
  .object({
    contract_id: uuid,
    summary: z.string().trim().min(1).max(2000),
    details: z.string().trim().max(10000).optional(),
    percent_complete: z.number().int().min(0).max(100).optional(),
  })
  .strict();
export type ProgressPostInput = z.infer<typeof ProgressPostSchema>;

export const MILESTONE_STATUSES = ['pending', 'in_progress', 'done', 'blocked'] as const;

export const MilestoneUpdateSchema = z
  .object({
    contract_id: uuid,
    milestone_id: uuid.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    status: z.enum(MILESTONE_STATUSES),
    due_at: isoDateTime.nullable().optional(),
  })
  .strict()
  .refine((v) => v.milestone_id !== undefined || v.title !== undefined, {
    message: 'title is required when creating a milestone',
    path: ['title'],
  });
export type MilestoneUpdateInput = z.infer<typeof MilestoneUpdateSchema>;

export const CreateSteeringSchema = z
  .object({
    message: z.string().trim().min(1).max(5000),
    requested_kind: z.enum(STEERING_KINDS).optional(),
    spec_changes: z.array(item).max(50).optional(),
    price_cents: z.number().int().positive().optional(),
    deadline: isoDateTime.optional(),
  })
  .strict();
export type CreateSteeringInput = z.infer<typeof CreateSteeringSchema>;

export const SteeringRespondSchema = z
  .object({
    steering_id: uuid,
    response: z.string().trim().min(1).max(5000),
    estimate_delta_cents: z.number().int().optional(),
    eta_days: z.number().int().min(1).max(365).optional(),
    deliverable_changes: z.array(item).max(50).optional(),
    decline: z.boolean().optional(),
  })
  .strict();
export type SteeringRespondInput = z.infer<typeof SteeringRespondSchema>;

export const AcceptVersionSchema = z.object({ contract_id: uuid, version_id: uuid }).strict();

export const ContractListSchema = z
  .object({
    role: z.enum(['customer', 'provider']).optional(),
    status: z.enum(CONTRACT_STATUSES as unknown as [ContractStatus, ...ContractStatus[]]).optional(),
  })
  .strict();
export type ContractListInput = z.infer<typeof ContractListSchema>;

export const SteeringListSchema = z
  .object({
    status: z.enum(STEERING_STATUSES as unknown as [SteeringStatus, ...SteeringStatus[]]).optional(),
    since: isoDateTime.optional(),
  })
  .strict();
export type SteeringListInput = z.infer<typeof SteeringListSchema>;

/** `?since=` for append-only feeds (messages, activity): the last `seq` seen. */
export function parseSeqCursor(raw: string | null | undefined): number | null | 'invalid' {
  if (raw == null || raw === '') return null;
  if (!/^\d{1,15}$/.test(raw)) return 'invalid';
  return Number(raw);
}

/** `?since=` for mutable lists (milestones, steering): the last `updated_at` seen. */
export function parseTimeCursor(raw: string | null | undefined): string | null | 'invalid' {
  if (raw == null || raw === '') return null;
  return isoDateTime.safeParse(raw).success ? raw : 'invalid';
}
