import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL;
  const key = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

interface NotificationTool {
  connectorName: string;
  serverName: string;
  toolName: string;
  fullName: string;
  type: 'email' | 'slack' | 'push' | 'sms' | 'webhook' | 'unknown';
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface Connector {
  id: string;
  display_name: string;
  connector_type: string;
  mcp_server_id?: string;
  external_url?: string;
}

interface MCPServer {
  id: string;
  server_name: string;
  display_name: string;
  source_url: string;
}

interface Automation {
  id: string;
  name: string;
  display_name: string;
  description: string;
  required_inputs: Record<string, { type?: string; description?: string; human_input?: boolean }> | null;
}

// GET - Generate workflow rules with dynamic tools section
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Database not available' }, { status: 503 });
    }

    // Read the base rules file
    const rulesPath = path.join(process.cwd(), 'docs', 'workflow-rules.md');
    let rulesContent = '';
    try {
      rulesContent = fs.readFileSync(rulesPath, 'utf-8');
    } catch {
      rulesContent = '# Workflow Rules\n\nRules file not found.';
    }

    // Fetch user's connectors
    const { data: connectors } = await supabase
      .from('chat_connectors')
      .select('id, display_name, connector_type, mcp_server_id, external_url')
      .eq('user_id', userId);

    // Fetch user's automations for trigger_automation block
    const { data: automations } = await supabase
      .from('automations')
      .select('id, name, display_name, description, required_inputs')
      .eq('user_id', userId)
      .eq('is_active', true);

    // Fetch MCP servers for internal connectors
    const mcpServerIds = (connectors || [])
      .filter((c: Connector) => c.mcp_server_id)
      .map((c: Connector) => c.mcp_server_id);

    let mcpServers: MCPServer[] = [];
    if (mcpServerIds.length > 0) {
      const { data } = await supabase
        .from('mcp_servers')
        .select('id, server_name, display_name, source_url')
        .in('id', mcpServerIds);
      mcpServers = data || [];
    }

    // Build tools documentation and detect notification tools
    const { toolsDocs, notificationTools } = await buildToolsDocumentation(connectors || [], mcpServers, supabase);

    // Build notification section
    const notificationSection = buildNotificationSection(notificationTools);

    // Build automations section for trigger_automation block
    const automationsSection = buildAutomationsSection(automations || []);

    // Replace the tools section placeholder
    const toolsSection = `<!-- TOOLS_SECTION_START -->
${toolsDocs}

${notificationSection}

${automationsSection}
<!-- TOOLS_SECTION_END -->`;

    rulesContent = rulesContent.replace(
      /<!-- TOOLS_SECTION_START -->[\s\S]*<!-- TOOLS_SECTION_END -->/,
      toolsSection
    );

    // Return as markdown or JSON based on Accept header
    const accept = request.headers.get('accept') || '';
    if (accept.includes('text/markdown') || accept.includes('text/plain')) {
      return new NextResponse(rulesContent, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }

    return NextResponse.json({
      rules: rulesContent,
      connectorCount: (connectors || []).length,
      toolCount: toolsDocs.split('###').length - 1,
      automationCount: (automations || []).length,
    });
  } catch (error) {
    console.error('Rules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function buildToolsDocumentation(
  connectors: Connector[],
  mcpServers: MCPServer[],
  supabase: SupabaseClient
): Promise<{ toolsDocs: string; notificationTools: NotificationTool[] }> {
  if (connectors.length === 0) {
    return {
      toolsDocs: '*No connectors configured. Add connectors in Settings to see available tools.*',
      notificationTools: [],
    };
  }

  const sections: string[] = [];
  const notificationTools: NotificationTool[] = [];
  let totalToolCount = 0;

  // Add summary header
  sections.push('## Available Tools\n');
  sections.push('The following tools are available from your active connectors. Use the full tool name (server.tool_name) in your workflow steps.\n');

  for (const connector of connectors) {
    const server = mcpServers.find(s => s.id === connector.mcp_server_id);
    const serverName = server?.server_name || connector.display_name.toLowerCase().replace(/\s+/g, '-');

    // Fetch tools for this connector
    const tools = await fetchToolsForConnector(connector, server, supabase);

    if (tools.length === 0) continue;

    totalToolCount += tools.length;
    const connectorType = connector.connector_type === 'external_mcp' ? 'External MCP' :
                          connector.connector_type === 'internal_mcp' ? 'Internal MCP' :
                          connector.connector_type === 'internal_agent' ? 'A2A Agent' :
                          connector.connector_type === 'external_agent' ? 'External Agent' : 'Unknown';

    sections.push(`### ${connector.display_name}`);
    sections.push(`- **Server Name:** \`${serverName}\``);
    sections.push(`- **Type:** ${connectorType}`);
    sections.push(`- **Tools:** ${tools.length}`);
    sections.push('');

    for (const tool of tools) {
      const fullName = `${serverName}.${tool.name}`;
      sections.push(`#### \`${fullName}\``);
      sections.push('');
      sections.push(`**Description:** ${tool.description}`);
      sections.push('');

      // Detect notification tools by name/description
      const notificationType = detectNotificationType(tool.name, tool.description);
      if (notificationType) {
        notificationTools.push({
          connectorName: connector.display_name,
          serverName,
          toolName: tool.name,
          fullName,
          type: notificationType,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }

      // Format input schema with property descriptions
      if (tool.inputSchema && Object.keys(tool.inputSchema).length > 0) {
        sections.push('**Input Schema:**');
        sections.push('```json');
        sections.push(JSON.stringify(tool.inputSchema, null, 2));
        sections.push('```');

        // Add human-readable parameter list
        const props = (tool.inputSchema as { properties?: Record<string, { type?: string; description?: string }> }).properties;
        const required = (tool.inputSchema as { required?: string[] }).required || [];
        if (props && Object.keys(props).length > 0) {
          sections.push('');
          sections.push('**Parameters:**');
          for (const [propName, propDef] of Object.entries(props)) {
            const isRequired = required.includes(propName);
            const typeStr = propDef.type || 'any';
            const desc = propDef.description || '';
            sections.push(`- \`${propName}\` (${typeStr}${isRequired ? ', required' : ''}): ${desc}`);
          }
        }
        sections.push('');
      }

      if (tool.outputSchema && Object.keys(tool.outputSchema).length > 0) {
        sections.push('**Output Schema:**');
        sections.push('```json');
        sections.push(JSON.stringify(tool.outputSchema, null, 2));
        sections.push('```');
        sections.push('');
      }

      // Add usage example
      sections.push('**Usage Example:**');
      sections.push('```yaml');
      sections.push('steps:');
      sections.push(`  - id: use_${tool.name.replace(/[^a-zA-Z0-9]/g, '_')}`);
      sections.push('    type: action');
      sections.push(`    name: "Use ${tool.name}"`);
      sections.push(`    tool: "${fullName}"`);

      const props = (tool.inputSchema as { properties?: Record<string, { type?: string }> }).properties;
      if (props && Object.keys(props).length > 0) {
        sections.push('    input:');
        for (const [propName, propDef] of Object.entries(props)) {
          const exampleValue = propDef.type === 'string' ? '"example"' :
                               propDef.type === 'number' ? '123' :
                               propDef.type === 'boolean' ? 'true' :
                               propDef.type === 'array' ? '[]' :
                               propDef.type === 'object' ? '{}' : '"value"';
          sections.push(`      ${propName}: ${exampleValue}`);
        }
      }
      sections.push('```');
      sections.push('');
      sections.push('---');
      sections.push('');
    }
  }

  // Add summary at the top
  const summary = `**Total Connectors:** ${connectors.length} | **Total Tools:** ${totalToolCount}\n`;
  sections.splice(2, 0, summary);

  return { toolsDocs: sections.join('\n'), notificationTools };
}

// Detect if a tool is a notification tool based on name and description
function detectNotificationType(name: string, description: string): NotificationTool['type'] | null {
  const lowerName = name.toLowerCase();
  const lowerDesc = description.toLowerCase();
  const combined = `${lowerName} ${lowerDesc}`;

  // Email detection
  if (lowerName.includes('email') || lowerName.includes('mail') || lowerName.includes('send_email') ||
      combined.includes('send email') || combined.includes('send mail')) {
    return 'email';
  }

  // Slack detection
  if (lowerName.includes('slack') || lowerName.includes('post_message') ||
      combined.includes('slack') || combined.includes('channel message')) {
    return 'slack';
  }

  // Push notification detection
  if (lowerName.includes('push') || lowerName.includes('notification') ||
      combined.includes('push notification') || combined.includes('mobile notification')) {
    return 'push';
  }

  // SMS detection
  if (lowerName.includes('sms') || lowerName.includes('text_message') ||
      combined.includes('send sms') || combined.includes('text message')) {
    return 'sms';
  }

  // Webhook detection (for outgoing notifications)
  if ((lowerName.includes('webhook') || lowerName.includes('http_post')) &&
      (combined.includes('notify') || combined.includes('callback'))) {
    return 'webhook';
  }

  return null;
}

// Build notification section for rules
function buildNotificationSection(notificationTools: NotificationTool[]): string {
  if (notificationTools.length === 0) {
    return `## Detected Notification Tools

*No notification tools detected. Add connectors with email, Slack, or push notification capabilities to enable notifications.*

> **Note:** Notification tools are auto-detected based on tool names and descriptions containing keywords like "email", "slack", "push", "sms", etc.`;
  }

  const sections: string[] = [
    '## Detected Notification Tools',
    '',
    'The following notification tools were auto-detected from your connectors:',
    '',
  ];

  // Group by type
  const byType: Record<string, NotificationTool[]> = {};
  for (const tool of notificationTools) {
    if (!byType[tool.type]) byType[tool.type] = [];
    byType[tool.type].push(tool);
  }

  for (const [type, tools] of Object.entries(byType)) {
    const emoji = type === 'email' ? '📧' : type === 'slack' ? '💬' : type === 'push' ? '🔔' : type === 'sms' ? '📱' : '🔗';
    sections.push(`### ${emoji} ${type.charAt(0).toUpperCase() + type.slice(1)}`);
    sections.push('');
    for (const tool of tools) {
      sections.push(`- \`${tool.fullName}\` - ${tool.description}`);
    }
    sections.push('');
  }

  sections.push('### Using Notification Tools');
  sections.push('');
  sections.push('These tools are automatically used for:');
  sections.push('- **Human-in-the-loop requests**: When an automation needs user input');
  sections.push('- **Error notifications**: When an automation fails or requires attention');
  sections.push('- **Output delivery**: When configured in the `outputs` section');
  sections.push('');
  sections.push('Example usage in workflow:');
  sections.push('```yaml');
  sections.push('outputs:');
  for (const tool of notificationTools.slice(0, 2)) {
    sections.push(`  - type: ${tool.type}`);
    sections.push(`    tool: ${tool.fullName}`);
    if (tool.type === 'email') {
      sections.push('    to: "{{user_email}}"');
      sections.push('    subject: "Automation Complete"');
      sections.push('    body: "{{summary}}"');
    } else if (tool.type === 'slack') {
      sections.push('    channel: "#notifications"');
      sections.push('    message: "{{summary}}"');
    }
  }
  sections.push('```');

  return sections.join('\n');
}

async function fetchToolsForConnector(
  connector: Connector,
  server: MCPServer | undefined,
  supabase: SupabaseClient
): Promise<MCPTool[]> {
  // For internal MCP connectors, fetch tools from the tools table via server_name
  if (connector.connector_type === 'internal_mcp' && server) {
    const { data: tools } = await supabase
      .from('tools')
      .select('name, description, input_schema, output_schema')
      .eq('server_name', server.server_name);

    return (tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.input_schema,
      outputSchema: t.output_schema,
    }));
  }

  // For external MCP connectors, fetch tools from mcp_server_tools table
  if (connector.connector_type === 'external_mcp' && connector.mcp_server_id) {
    const { data: serverTools } = await supabase
      .from('mcp_server_tools')
      .select(`
        original_name,
        original_description,
        is_enabled,
        tool:tools (
          name,
          description,
          input_schema,
          output_schema
        )
      `)
      .eq('mcp_server_id', connector.mcp_server_id)
      .eq('is_enabled', true);

    if (serverTools && serverTools.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return serverTools.map((st: any) => {
        // tool can be an array or single object depending on Supabase version
        const tool = Array.isArray(st.tool) ? st.tool[0] : st.tool;
        return {
          name: tool?.name || st.original_name,
          description: tool?.description || st.original_description || '',
          inputSchema: tool?.input_schema || {},
          outputSchema: tool?.output_schema || {},
        };
      });
    }

    // Fallback if no tools found
    return [{
      name: '*',
      description: `External MCP server at ${connector.external_url}. Tools are fetched dynamically at runtime.`,
      inputSchema: {},
      outputSchema: {},
    }];
  }

  // For A2A agents (internal or external)
  if (connector.connector_type === 'internal_agent' || connector.connector_type === 'external_agent') {
    // Try to fetch agent's skills/tools if available
    if (connector.mcp_server_id) {
      const { data: agentTools } = await supabase
        .from('mcp_server_tools')
        .select(`
          original_name,
          original_description,
          is_enabled,
          tool:tools (
            name,
            description,
            input_schema,
            output_schema
          )
        `)
        .eq('mcp_server_id', connector.mcp_server_id)
        .eq('is_enabled', true);

      if (agentTools && agentTools.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return agentTools.map((st: any) => {
          // tool can be an array or single object depending on Supabase version
          const tool = Array.isArray(st.tool) ? st.tool[0] : st.tool;
          return {
            name: tool?.name || st.original_name,
            description: tool?.description || st.original_description || '',
            inputSchema: tool?.input_schema || {},
            outputSchema: tool?.output_schema || {},
          };
        });
      }
    }

    // Default agent invoke tool
    return [{
      name: 'invoke',
      description: `Invoke the ${connector.display_name} agent with a task.`,
      inputSchema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'The task to perform' },
          context: { type: 'object', description: 'Additional context for the agent' },
        },
        required: ['task'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { type: 'string', description: 'The agent response' },
          artifacts: { type: 'array', description: 'Any artifacts produced by the agent' },
        },
      },
    }];
  }

  return [];
}

// Build automations section for trigger_automation block
function buildAutomationsSection(automations: Automation[]): string {
  const sections: string[] = [
    '## Available Automations (for trigger_automation)',
    '',
    'Use the `trigger_automation` block to trigger other automations from within a workflow.',
    'The `{api_key}` placeholder will be automatically replaced with the user\'s API key at runtime.',
    '',
  ];

  if (automations.length === 0) {
    sections.push('*No automations available yet. Create automations to enable chaining.*');
    return sections.join('\n');
  }

  sections.push('### Automations List');
  sections.push('');
  sections.push('| Name | ID | Webhook Path | Required Inputs |');
  sections.push('|------|----|--------------|--------------------|');

  for (const automation of automations) {
    const webhookPath = `/api/ai/automations/${automation.id}/hook/{api_key}`;
    const inputs = automation.required_inputs
      ? Object.entries(automation.required_inputs)
          .map(([k, v]) => `${k}: ${v.type || 'string'}`)
          .join(', ')
      : 'none';
    sections.push(`| ${automation.display_name || automation.name} | \`${automation.id}\` | \`${webhookPath}\` | ${inputs || 'none'} |`);
  }

  sections.push('');
  sections.push('### trigger_automation Block Syntax');
  sections.push('');
  sections.push('```yaml');
  sections.push('steps:');
  sections.push('  - id: chain_automation');
  sections.push('    type: trigger_automation');
  sections.push('    automation_id: "<automation-uuid>"  # From table above');
  sections.push('    inputs:');
  sections.push('      param1: "{{some_value}}"');
  sections.push('      param2: "literal value"');
  sections.push('    wait_for_completion: false  # Optional: true to wait for result');
  sections.push('```');
  sections.push('');
  sections.push('### Example: Chain to Another Automation');
  sections.push('');

  if (automations.length > 0) {
    const example = automations[0];
    sections.push('```yaml');
    sections.push('steps:');
    sections.push('  - id: trigger_report');
    sections.push('    type: trigger_automation');
    sections.push(`    automation_id: "${example.id}"`);
    if (example.required_inputs && Object.keys(example.required_inputs).length > 0) {
      sections.push('    inputs:');
      for (const [key, config] of Object.entries(example.required_inputs)) {
        sections.push(`      ${key}: "{{${key}}}"  # ${config.type || 'string'}`);
      }
    }
    sections.push('```');
  }

  sections.push('');
  sections.push('> **Note:** When `trigger_automation` is executed, the system will:');
  sections.push('> 1. Look up the user\'s API key from the execution context');
  sections.push('> 2. Call `POST /api/ai/automations/{id}/hook/{api_key}` with the inputs');
  sections.push('> 3. If `wait_for_completion: true`, poll until the triggered automation completes');

  return sections.join('\n');
}

