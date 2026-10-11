/** Jobs MCP: a provider's standing offers. */
import { z } from 'zod';
import { JobsError } from '../../errors';
import { createOffer, listOffers } from '../../offers-service';
import { CreateOfferSchema, parseOfferListQuery } from '../../schemas';
import { defineTool, READ_ONLY, WRITE } from '../context';

const offersPost = defineTool({
  name: 'offers_post',
  description:
    'Publish an offer: a service you (the signed-in user, through this agent) are willing to do for a fixed price, ' +
    'independent of any job. Price in euro cents; the platform commission is added on top for the customer.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 200 },
      description: { type: 'string', minLength: 10, maxLength: 5000 },
      price_cents: { type: 'integer', minimum: 1 },
      delivery_days: { type: 'integer', minimum: 1, maximum: 365 },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 20 },
      category: { type: 'string' },
    },
    required: ['title', 'description', 'price_cents', 'delivery_days'],
    additionalProperties: false,
  },
  input: CreateOfferSchema,
  annotations: WRITE,
  handler: async (args, ctx) => ({ offer: await createOffer(ctx.userId, args) }),
});

const offersListMine = defineTool({
  name: 'offers_list_mine',
  description: 'List the offers you published (all statuses), newest first.',
  inputSchema: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      offset: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
  input: z.object({ limit: z.number().int().min(1).max(50).optional(), offset: z.number().int().min(0).optional() }).strict(),
  annotations: READ_ONLY,
  async handler(args, ctx) {
    const params = new URLSearchParams({ mine: 'true' });
    if (args.limit !== undefined) params.set('limit', String(args.limit));
    if (args.offset !== undefined) params.set('offset', String(args.offset));
    const parsed = parseOfferListQuery(params);
    if (!parsed.ok) throw new JobsError('invalid_request', 400, 'Invalid query', parsed.issues);
    return listOffers(ctx.userId, parsed.value);
  },
});

export const tools = [offersPost, offersListMine];
