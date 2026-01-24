/**
 * Script to generate SQL INSERT statements for tools table from TOOL_DEFINITIONS
 * Run with: npx tsx scripts/generate-tools-sql.ts > supabase/migrations/002_tools_seed.sql
 */

import { TOOL_DEFINITIONS } from '../src/config/tools-definitions';

function escapeSQL(str: string): string {
  return str.replace(/'/g, "''");
}

function generateToolsSQL(): string {
  const lines: string[] = [];
  
  lines.push('-- Auto-generated tool definitions from tools-definitions.ts');
  lines.push('-- Generated at: ' + new Date().toISOString());
  lines.push('');
  lines.push('INSERT INTO tools (name, description, category, tool_type, has_widget, invoking_message, invoked_message, input_schema, output_schema, user_id) VALUES');
  
  const values = TOOL_DEFINITIONS.map((tool, index) => {
    const invoking = tool.invocationMessages?.invoking || 'Processing...';
    const invoked = tool.invocationMessages?.invoked || 'Complete';
    
    return `  (
    '${escapeSQL(tool.name)}',
    '${escapeSQL(tool.description)}',
    '${escapeSQL(tool.category)}',
    '${tool.type}',
    ${tool.hasWidget},
    '${escapeSQL(invoking)}',
    '${escapeSQL(invoked)}',
    '${escapeSQL(JSON.stringify(tool.inputSchema))}'::jsonb,
    '${escapeSQL(JSON.stringify(tool.outputSchema))}'::jsonb,
    NULL
  )${index < TOOL_DEFINITIONS.length - 1 ? ',' : ''}`;
  });
  
  lines.push(values.join('\n'));
  lines.push('ON CONFLICT (name) DO UPDATE SET');
  lines.push('  description = EXCLUDED.description,');
  lines.push('  category = EXCLUDED.category,');
  lines.push('  tool_type = EXCLUDED.tool_type,');
  lines.push('  has_widget = EXCLUDED.has_widget,');
  lines.push('  invoking_message = EXCLUDED.invoking_message,');
  lines.push('  invoked_message = EXCLUDED.invoked_message,');
  lines.push('  input_schema = EXCLUDED.input_schema,');
  lines.push('  output_schema = EXCLUDED.output_schema,');
  lines.push('  updated_at = NOW();');
  
  return lines.join('\n');
}

function generateServerToolsSQL(): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('-- Link all NATIVE tools to the default server');
  lines.push('DO $$');
  lines.push('DECLARE');
  lines.push("  v_user_id TEXT := 'user_37inOsUBpoqj1Nv5ZyeZ7rBOUKo';");
  lines.push("  v_server_name TEXT := 'default';");
  lines.push('  v_tool_id UUID;');
  lines.push('  v_tool_name TEXT;');
  lines.push('BEGIN');
  lines.push("  -- Link each NATIVE tool to the user's default server");
  lines.push("  FOR v_tool_id, v_tool_name IN SELECT id, name FROM tools WHERE tool_type = 'NATIVE'");
  lines.push('  LOOP');
  lines.push('    INSERT INTO server_tools (user_id, server_name, tool_id, is_enabled)');
  lines.push('    VALUES (v_user_id, v_server_name, v_tool_id, true)');
  lines.push('    ON CONFLICT (user_id, server_name, tool_id) DO NOTHING;');
  lines.push('  END LOOP;');
  lines.push('END $$;');
  
  return lines.join('\n');
}

console.log(generateToolsSQL());
console.log(generateServerToolsSQL());

