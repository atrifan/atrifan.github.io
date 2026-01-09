import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AI_MODELS } from '@/src/config/ai-tokens.config';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// System prompt for TypeScript code generation
const EXPORT_SYSTEM_PROMPT = `You are a TypeScript code generator for serverless automation functions.

Given a flow definition (nodes and edges), generate a TypeScript function that implements the automation.

Requirements:
1. The function should be async and export default
2. Use proper TypeScript types
3. Handle errors gracefully
4. For MCP tool calls, use the provided mcpClient helper
5. For AI blocks, use the provided aiClient helper
6. Return the final output as JSON

Template:
\`\`\`typescript
import { MCPClient, AIClient } from '@zip.run/automation-sdk';

interface AutomationInput {
  // Define input parameters
}

interface AutomationOutput {
  // Define output structure
}

export default async function automation(
  input: AutomationInput,
  mcpClient: MCPClient,
  aiClient: AIClient
): Promise<AutomationOutput> {
  // Implementation
}
\`\`\`

Generate clean, readable code with comments explaining each step.`;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { automationId, flowDefinition, mermaidDiagram, modelId, automationName } = body;

    if (!flowDefinition && !mermaidDiagram) {
      return NextResponse.json({ error: 'Flow definition or mermaid diagram is required' }, { status: 400 });
    }

    // Build context for code generation
    const contextMessage = `Generate TypeScript code for this automation:

Name: ${automationName || 'Unnamed Automation'}

Flow Definition:
\`\`\`json
${JSON.stringify(flowDefinition, null, 2)}
\`\`\`

Mermaid Diagram:
\`\`\`mermaid
${mermaidDiagram}
\`\`\`

Generate the complete TypeScript implementation.`;

    // Call AI to generate code
    const model = modelId || 'anthropic/claude-3.5-sonnet';
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AI_GATEWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://zip.run',
        'X-Title': 'ZIP.RUN Automation Export',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: EXPORT_SYSTEM_PROMPT },
          { role: 'user', content: contextMessage },
        ],
        max_tokens: 4096,
      }),
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.json();
      console.error('OpenRouter error:', errorData);
      return NextResponse.json({ error: 'AI service error' }, { status: 500 });
    }

    const aiData = await openRouterResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || '';
    const usage = aiData.usage || { prompt_tokens: 0, completion_tokens: 0 };

    // Extract TypeScript code from response
    let typescriptCode = responseContent;
    const codeMatch = responseContent.match(/```typescript\n?([\s\S]*?)\n?```/);
    if (codeMatch) {
      typescriptCode = codeMatch[1];
    }

    // Calculate cost
    const modelInfo = AI_MODELS.find(m => m.id === model);
    const cost = modelInfo 
      ? (usage.prompt_tokens * modelInfo.inputCostPer1M / 1_000_000) + (usage.completion_tokens * modelInfo.outputCostPer1M / 1_000_000)
      : 0;

    // Save to automation and track usage
    if (automationId && supabase) {
      await supabase
        .from('automations')
        .update({ typescript_code: typescriptCode })
        .eq('id', automationId)
        .eq('user_id', userId);

      // Track token usage
      await supabase.from('ai_token_usage').insert({
        user_id: userId,
        model_id: model,
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
        cost_usd: cost,
        context: 'automation_export',
      });
    }

    return NextResponse.json({
      typescriptCode,
      usage: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
        cost,
      },
    });
  } catch (error) {
    console.error('Automation export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

