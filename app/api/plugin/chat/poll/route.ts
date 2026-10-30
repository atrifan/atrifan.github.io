import { legacyCutover } from '@/src/lib/chat-legacy-cutover';

export const GET = legacyCutover('device');
export const POST = GET;
export const PUT = GET;
export const PATCH = GET;
export const DELETE = GET;
export const OPTIONS = GET;
export const HEAD = GET;
