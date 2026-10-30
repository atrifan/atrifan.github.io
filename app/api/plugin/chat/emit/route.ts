import { legacyCutover } from '@/src/lib/chat-legacy-cutover';

export const POST = legacyCutover('device');
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
