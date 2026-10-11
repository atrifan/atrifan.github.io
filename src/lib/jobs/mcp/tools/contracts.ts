/** Jobs MCP: contracts the caller is a party to. */
import { z } from 'zod';
import { getContractDetail, listContractsForUser, listMilestonesFor } from '../../room-service';
import { acceptProposedVersion } from '../../steering-service';
import { AcceptVersionSchema, ContractListSchema } from '../../room-schemas';
import { CONTRACT_STATUSES } from '../../job-state';
import { defineTool, READ_ONLY, WRITE } from '../context';
import { openSteering } from './steering';

const contractsList = defineTool({
  name: 'contracts_list',
  description:
    'List contracts where you are the customer or the provider, newest first, with the current contract version ' +
    '(price, deadline, steering allowance). Filter by role or status (active means paid and in progress).',
  inputSchema: {
    type: 'object',
    properties: {
      role: { type: 'string', enum: ['customer', 'provider'] },
      status: { type: 'string', enum: [...CONTRACT_STATUSES] },
    },
    additionalProperties: false,
  },
  input: ContractListSchema,
  annotations: READ_ONLY,
  handler: async (args, ctx) => ({ contracts: await listContractsForUser(ctx.userId, args) }),
});

const contractGet = defineTool({
  name: 'contract_get',
  description:
    'Everything about one contract you are a party to: status, your role, the job and its approved spec, the current contract ' +
    'version and the version history (current / superseded / proposed / rejected), whether work is paused by a pending scope change, ' +
    'steering credits (allowance, used, remaining), milestones and open steering requests. Call it before starting or resuming work.',
  inputSchema: {
    type: 'object',
    properties: { contract_id: { type: 'string', description: 'Contract id (uuid)' } },
    required: ['contract_id'],
    additionalProperties: false,
  },
  input: z.object({ contract_id: z.string().min(1) }).strict(),
  annotations: READ_ONLY,
  async handler({ contract_id }, ctx) {
    const detail = await getContractDetail(ctx.userId, contract_id);
    const [{ milestones }, open] = await Promise.all([listMilestonesFor(detail.contract.id), openSteering(detail.contract.id)]);
    return { ...detail, milestones, open_steering: open };
  },
});

const contractAcceptVersion = defineTool({
  name: 'contract_accept_version',
  description:
    'Provider only: sign a contract version the customer proposed (a scope change where the customer set a new price or deadline; ' +
    'see contract_get versions with state "proposed" and steering requests with status awaiting_provider). The version becomes current; ' +
    'if the price went up the customer pays a top-up and work stays paused until it is paid. ' +
    'To counter-propose instead, use steering_respond with an estimate. Errors: forbidden, not_found, invalid_state.',
  inputSchema: {
    type: 'object',
    properties: {
      contract_id: { type: 'string' },
      version_id: { type: 'string', description: 'The proposed contract version id' },
    },
    required: ['contract_id', 'version_id'],
    additionalProperties: false,
  },
  input: AcceptVersionSchema,
  annotations: WRITE,
  handler: async ({ contract_id, version_id }, ctx) => {
    const applied = await acceptProposedVersion(ctx.userId, contract_id, version_id, ctx.agent.id);
    return { ...applied };
  },
});

export const tools = [contractsList, contractGet, contractAcceptVersion];
