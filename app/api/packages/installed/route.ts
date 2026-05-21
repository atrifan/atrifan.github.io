import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!,
  process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const typeFilter = searchParams.get('type');

  const { data, error } = await supabase
    .from('user_mcp_installs')
    .select('package_id, installed_at, packages(id, name, description, type, latest_version, config_json)')
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let installs = (data || []).map((row: any) => ({
    ...row.packages,
    installed_at: row.installed_at,
  }));

  if (typeFilter) {
    installs = installs.filter((p: any) => p.type === typeFilter);
  }

  return NextResponse.json({ installed: installs });
}
