import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAllTools } from '@/src/lib/supabase-services';
import { TOOL_DEFINITIONS, getAllCategories } from '@/src/config/tools-definitions';

/**
 * Get all MCP tools documentation
 * GET /api/tools
 *
 * Returns a list of all available tools with their schemas and metadata.
 *
 * Fetches from Supabase tools table. Falls back to static definitions if Supabase fails.
 */

export async function GET() {
  try {
    // Get user ID if authenticated (for user-created tools)
    const { userId } = await auth();

    // Fetch tools from Supabase
    const tools = await getAllTools(userId || undefined);

    // Extract unique categories
    const categories = [...new Set(tools.map(t => t.category))];

    // Transform to match expected format
    const formattedTools = tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
      toolType: tool.tool_type,
      hasWidget: tool.has_widget,
      invokingMessage: tool.invoking_message,
      invokedMessage: tool.invoked_message,
      inputSchema: tool.input_schema,
      outputSchema: tool.output_schema,
    }));

    return NextResponse.json({
      tools: formattedTools,
      totalCount: formattedTools.length,
      categories,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300', // 5 min cache
      },
    });
  } catch (error) {
    console.error('Error fetching tools from Supabase, falling back to static:', error);

    // Fallback to static definitions
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
}

