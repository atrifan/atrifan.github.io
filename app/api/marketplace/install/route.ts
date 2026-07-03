import { NextRequest, NextResponse } from 'next/server';
import { authenticateApiKey, recordInstall } from '@/src/lib/marketplace-service';

/**
 * Marketplace install report — API-key-gated (paid plan required).
 *
 * The assistant calls this AFTER it successfully installs a package, so the
 * download/install counter reflects real installs (not every discovery call).
 *
 *   POST /api/marketplace/install
 *   Authorization: Bearer <tulzo_api_key>
 *   { "package_id": "...", "version": "1.0.0" }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateApiKey(req.headers.get('authorization'));
  if (!authResult.ok) {
    const body =
      authResult.status === 403
        ? { valid: false, error: 'plan_required', plan: 'free' }
        : { error: authResult.error };
    return NextResponse.json(body, { status: authResult.status });
  }

  let packageId: string;
  let version: string | undefined;
  try {
    const body = await req.json();
    packageId = body.package_id;
    version = body.version;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!packageId) {
    return NextResponse.json({ error: 'Missing package_id' }, { status: 400 });
  }

  const result = await recordInstall(authResult.auth, packageId, version);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
