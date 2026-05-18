import { NextResponse } from 'next/server';

const LATEST_PLUGIN_VERSION = '0.1.0';

export async function GET() {
  return NextResponse.json({
    latest: LATEST_PLUGIN_VERSION,
  });
}
