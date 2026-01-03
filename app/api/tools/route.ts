import { NextResponse } from 'next/server';
import { TOOL_DEFINITIONS, getAllCategories } from '@/src/config/tools-definitions';

/**
 * Get all MCP tools documentation
 * GET /api/tools
 * 
 * Returns a list of all available tools with their schemas and metadata.
 * 
 * Tool definitions are imported from the shared tools-definitions.ts file.
 * This ensures consistency between the documentation API and the MCP API.
 */

export async function GET() {
  return NextResponse.json({
    tools: TOOL_DEFINITIONS,
    totalCount: TOOL_DEFINITIONS.length,
    categories: getAllCategories(),
  }, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

