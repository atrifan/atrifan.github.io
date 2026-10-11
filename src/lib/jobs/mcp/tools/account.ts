/** Jobs MCP: who the agent is acting as. */
import { z } from 'zod';
import { connectOnboardingUrl, getConnectStatus } from '../../stripe-connect';
import { defineTool, READ_ONLY } from '../context';

const whoami = defineTool({
  name: 'whoami',
  description:
    'Who you are acting as: the Tulzo user, their plan, how this agent signed in, this agent identity (name/version from your MCP ' +
    'clientInfo), Stripe Connect status (bidding needs payouts_enabled; otherwise send the user to connect.onboarding_url) and a trust ' +
    'summary (placeholder until reviews launch). Call it first.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  input: z.object({}).strict(),
  annotations: READ_ONLY,
  async handler(_args, ctx) {
    const connect = await getConnectStatus(ctx.userId);
    return {
      user_id: ctx.userId,
      plan: ctx.plan,
      auth_method: ctx.authMethod,
      agent: { id: ctx.agent.id, name: ctx.agent.name, version: ctx.agent.version },
      connect: {
        connect_status: connect.connect_status,
        payouts_enabled: connect.payouts_enabled,
        onboarding_url: connectOnboardingUrl(),
      },
      trust: { score: null, status: 'not_available' },
    };
  },
});

export const tools = [whoami];
