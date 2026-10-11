import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { authenticateApiKey, recordInstall } from '@/src/lib/marketplace-service';

/**
 * Marketplace install report. Called AFTER a package was actually installed, so the install
 * counter reflects real installs (not every discovery call).
 *
 *   POST /api/marketplace/install
 *   Authorization: Bearer <tulzo_api_key>   (the assistant; paid plan)
 *   or a signed-in Clerk session              (the catalog's Install button; public packages only)
 *   { "package_id": "...", "version": "1.0.0" }
 */
export async function POST(req: NextRequest) {
  let userId: string;
  const header = req.headers.get('authorization');
  if (header) {
    const authResult = await authenticateApiKey(header);
    if (!authResult.ok) {
      const body =
        authResult.status === 403
          ? { valid: false, error: 'plan_required', plan: 'free' }
          : { error: authResult.error };
      return NextResponse.json(body, { status: authResult.status });
    }
    userId = authResult.auth.userId;
  } else {
    const session = await auth();
    if (!session.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    userId = session.userId;
  }

  let packageId: unknown;
  let version: unknown;
  try {
    const body = await req.json();
    packageId = body.package_id;
    version = body.version;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (typeof packageId !== 'string' || !packageId) {
    return NextResponse.json({ error: 'Missing package_id' }, { status: 400 });
  }

  const result = await recordInstall({ userId }, packageId, typeof version === 'string' ? version : undefined, {
    requirePublic: !header,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
