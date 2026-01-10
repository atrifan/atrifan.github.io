import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import { AI_MODELS } from '@/src/config/ai-tokens.config';

export const dynamic = 'force-dynamic';

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// System prompt for automation flow generation
const AUTOMATION_SYSTEM_PROMPT = `You are an automation flow designer. You help users create workflow automations using MCP (Model Context Protocol) tools.

When the user describes what they want to automate, you generate a Mermaid flowchart diagram and a structured flow definition.

Available node types:
- start: Entry point (only one per flow)
- end: Exit point (can have multiple)
- skill: Calls an MCP tool (format: mcp_server_name.tool_name)
- if: Conditional branch (has true/false paths)
- for: Loop over items
- while: Loop while condition is true
- ai: AI processing block (for data transformation or human-in-loop decisions)

Response format (JSON):
{
  "mermaid": "flowchart TD\\n  start([Start]) --> step1[Step 1]\\n  step1 --> end_node([End])",
  "flow": {
    "nodes": [
      {"id": "start", "type": "start", "label": "Start"},
      {"id": "step1", "type": "skill", "label": "Get Data", "config": {"server": "my-server", "tool": "get_data", "params": {}}},
      {"id": "end", "type": "end", "label": "End"}
    ],
    "edges": [
      {"from": "start", "to": "step1"},
      {"from": "step1", "to": "end"}
    ]
  },
  "explanation": "Brief explanation of what the flow does"
}

Use descriptive node labels. For skill nodes, include the MCP server and tool name in the config.
For if nodes, label the edges with "Yes"/"No" or the condition.
Always start with a start node and end with at least one end node.`;

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const body = await request.json();
    const { automationId, prompt, currentMermaid, modelId, availableTools, personaSystemPrompt } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Build context message
    let contextMessage = prompt;
    if (currentMermaid) {
      contextMessage = `Current flow:\n\`\`\`mermaid\n${currentMermaid}\n\`\`\`\n\nUser request: ${prompt}`;
    }
    if (availableTools && availableTools.length > 0) {
      contextMessage += `\n\nAvailable MCP tools:\n${availableTools.map((t: { server: string; name: string; description: string }) => `- ${t.server}.${t.name}: ${t.description}`).join('\n')}`;
    }

    // Build combined system prompt: persona prompts + automation system prompt
    const combinedSystemPrompt = personaSystemPrompt
      ? `${personaSystemPrompt}\n\n---\n\n${AUTOMATION_SYSTEM_PROMPT}`
      : AUTOMATION_SYSTEM_PROMPT;

    // Call AI to generate flow using Vercel AI SDK with built-in gateway support
    const model = modelId || 'mistral/ministral-3b';
    let responseContent = '';
    let usage = { prompt_tokens: 0, completion_tokens: 0 };

    try {
      const result = await generateText({
        model, // AI SDK v6 has built-in gateway support
        system: combinedSystemPrompt,
        prompt: contextMessage,
        maxOutputTokens: 2048,
      });

      responseContent = result.text;
      usage = {
        prompt_tokens: result.usage?.inputTokens || 0,
        completion_tokens: result.usage?.outputTokens || 0,
      };
    } catch (error) {
      console.error('AI Gateway error:', error);
      return NextResponse.json({ error: 'AI service error' }, { status: 500 });
    }

    // Parse AI response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(responseContent);
    } catch {
      // If not valid JSON, try to extract from markdown code block
      const jsonMatch = responseContent.match(/```json\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[1]);
      } else {
        parsedResponse = { mermaid: '', flow: { nodes: [], edges: [] }, explanation: responseContent };
      }
    }

    // Save prompt history if automation exists
    if (automationId && supabase) {
      await supabase.from('automation_prompt_history').insert({
        automation_id: automationId,
        user_id: userId,
        prompt,
        response_flow: parsedResponse.flow,
        response_mermaid: parsedResponse.mermaid,
        input_tokens: usage.prompt_tokens,
        output_tokens: usage.completion_tokens,
      });

      // Track token usage
      const modelInfo = AI_MODELS.find(m => m.id === model);
      if (modelInfo) {
        const cost = (usage.prompt_tokens * modelInfo.inputCostPer1M / 1_000_000) + (usage.completion_tokens * modelInfo.outputCostPer1M / 1_000_000);
        await supabase.from('ai_token_usage').insert({
          user_id: userId,
          model_id: model,
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          cost_usd: cost,
          context: 'automation_prompt',
        });
      }
    }

    return NextResponse.json({
      mermaid: parsedResponse.mermaid,
      flow: parsedResponse.flow,
      explanation: parsedResponse.explanation,
      usage: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
      },
    });
  } catch (error) {
    console.error('Automation prompt error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

