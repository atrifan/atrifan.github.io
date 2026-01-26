/**
 * Runtime Executor Service
 *
 * Executes automation workflows with real MCP tool calls.
 * Used by:
 * - Manual Run (website button)
 * - Webhook triggers
 * - CLI (--live --db mode)
 *
 * This is the unified execution path that replaces simulateExecution().
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateText } from 'ai';
import * as yaml from 'yaml';
import { executeWorkflow, ExecutorOptions, LLMExecutor } from './executor';
import { createToolExecutorForUser, OAuthRequiredError } from './tool-executor-service';
import { WorkflowDefinition } from './types';

export interface RuntimeExecutionOptions {
  userId: string;
  userEmail?: string;
  automationId: string;
  automationName?: string;
  executionId: string;
  yamlDefinition: string;
  inputs?: Record<string, unknown>;
  triggerType: 'manual' | 'webhook' | 'cron' | 'cli' | 'automation';
  baseUrl?: string;
  notificationChannels?: string[];
}

export interface RuntimeExecutionResult {
  success: boolean;
  status: 'pending' | 'running' | 'completed' | 'paused' | 'waiting_input' | 'cancelled' | 'failed';
  output?: unknown;
  error?: string;
  requiresAuth?: {
    serverName: string;
    serverId: string;
    serverType: 'mcp' | 'rest' | 'graphql' | 'a2a';
    toolName: string;
    connectorId?: string;
  };
}

/**
 * Create an LLM executor using Vercel AI SDK
 * This is used for `llm:` steps within YAML workflows
 */
function createLLMExecutor(): LLMExecutor {
  return {
    async callLLM(options): Promise<string> {
      const model = options.model || 'mistral/ministral-3b';
      
      try {
        const result = await generateText({
          model,
          system: options.system,
          prompt: options.prompt,
          maxOutputTokens: 4096,
        });
        
        return result.text;
      } catch (error) {
        console.error('[LLMExecutor] Error:', error);
        throw error;
      }
    },
  };
}

/**
 * Execute a workflow with real MCP tool calls
 */
export async function runRealExecution(
  options: RuntimeExecutionOptions
): Promise<RuntimeExecutionResult> {
  const {
    userId,
    userEmail,
    automationId,
    automationName,
    executionId,
    yamlDefinition,
    inputs = {},
    triggerType,
    baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    notificationChannels = ['email'],
  } = options;

  const supabaseUrl = process.env.STORAGE_SUPABASE_URL || process.env.NEXT_PUBLIC_STORAGE_SUPABASE_URL!;
  const supabaseKey = process.env.STORAGE_SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Parse YAML
  let workflow: WorkflowDefinition;
  try {
    workflow = yaml.parse(yamlDefinition) as WorkflowDefinition;
  } catch (error) {
    const errorMsg = `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`;
    await updateExecutionStatus(supabase, executionId, 'failed', errorMsg);
    return { success: false, status: 'failed', error: errorMsg };
  }

  // Create tool executor with real MCP
  let toolExecutor;
  try {
    toolExecutor = await createToolExecutorForUser(userId, {
      baseUrl,
      context: 'automation',
      onToolCall: (toolName, params) => {
        console.log(`[Runtime] Tool call: ${toolName}`, params);
        logToDb(supabase, executionId, automationId, 'info', toolName, `Calling tool: ${toolName}`, 'started');
      },
      onToolResult: (toolName, result) => {
        console.log(`[Runtime] Tool result: ${toolName}`, result);
        logToDb(supabase, executionId, automationId, 'info', toolName, JSON.stringify(result).slice(0, 1000), 'completed');
      },
      onToolError: (toolName, error) => {
        console.error(`[Runtime] Tool error: ${toolName}`, error);
        logToDb(supabase, executionId, automationId, 'error', toolName, error.message, 'failed');
      },
    });
  } catch (error) {
    const errorMsg = `Failed to create tool executor: ${error instanceof Error ? error.message : String(error)}`;
    await updateExecutionStatus(supabase, executionId, 'failed', errorMsg);
    return { success: false, status: 'failed', error: errorMsg };
  }

  // Create LLM executor
  const llmExecutor = createLLMExecutor();

  // Inject user data into inputs
  const enrichedInputs = {
    ...inputs,
    user: { id: userId, email: userEmail },
    trigger: { type: triggerType },
  };

  // Track step timing
  const stepStartTimes: Record<string, number> = {};

  // Build executor options
  const executorOptions: ExecutorOptions = {
    toolExecutor,
    llmExecutor,
    collectedInputs: enrichedInputs,
    // Notification handler for notify steps
    notificationHandler: {
      async notify({ channels, message, priority }) {
        console.log(`[Runtime] Notify: channels=${channels.join(',')}, priority=${priority || 'normal'}`);

        // Send push notification if requested
        if (channels.includes('push')) {
          try {
            await fetch(`${baseUrl}/api/push/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
              },
              body: JSON.stringify({
                userId,
                title: '🔔 Automation Notification',
                body: message,
                data: {
                  type: 'automation_notify',
                  automationId,
                  executionId,
                  priority,
                },
              }),
            });
          } catch (e) {
            console.error('[Runtime] Failed to send push notification:', e);
          }
        }

        // Send email notification if requested
        if (channels.includes('email') && userEmail) {
          try {
            await fetch(`${baseUrl}/api/email/send`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
              },
              body: JSON.stringify({
                to: userEmail,
                subject: `🔔 Automation: ${automationName || automationId}`,
                body: message,
              }),
            });
          } catch (e) {
            console.error('[Runtime] Failed to send email notification:', e);
          }
        }
      },
    },
    // Output handler for outputs section
    outputHandler: {
      async sendEmail({ to, subject, body }) {
        try {
          const response = await fetch(`${baseUrl}/api/email/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({ to, subject, body }),
          });
          return { type: 'email', success: response.ok };
        } catch (e) {
          return { type: 'email', success: false, error: String(e) };
        }
      },
      async sendPush({ title, message, data }) {
        try {
          const response = await fetch(`${baseUrl}/api/push/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({
              userId,
              title,
              body: message,
              data: {
                ...data,
                type: 'automation_output',
                automationId,
                executionId,
              },
            }),
          });
          return { type: 'push', success: response.ok };
        } catch (e) {
          return { type: 'push', success: false, error: String(e) };
        }
      },
      async sendWebhook({ url, method = 'POST', headers = {}, body }) {
        try {
          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
          });
          return { type: 'webhook', success: response.ok };
        } catch (e) {
          return { type: 'webhook', success: false, error: String(e) };
        }
      },
    },
    onStepStart: (stepId, stepType) => {
      stepStartTimes[stepId] = Date.now();
      updateExecutionStep(supabase, executionId, stepId);
      logToDb(supabase, executionId, automationId, 'info', stepId, `Starting step: ${stepType}`, 'started');
    },
    onStepComplete: (stepId, result) => {
      const duration = stepStartTimes[stepId] ? Date.now() - stepStartTimes[stepId] : undefined;
      logToDb(supabase, executionId, automationId, 'info', stepId, JSON.stringify(result).slice(0, 1000), 'completed', duration);
    },
    onStepError: (stepId, error) => {
      const duration = stepStartTimes[stepId] ? Date.now() - stepStartTimes[stepId] : undefined;
      logToDb(supabase, executionId, automationId, 'error', stepId, error.message, 'failed', duration);
    },
  };

  // Execute workflow
  try {
    console.log(`[Runtime] Starting execution: ${executionId}`);
    const result = await executeWorkflow(workflow, enrichedInputs, executorOptions);

    // Update final status
    await updateExecutionStatus(supabase, executionId, result.status, result.error);
    await logToDb(supabase, executionId, automationId, 'info', 'workflow', `Workflow ${result.status}`, result.status);

    return {
      success: result.status === 'completed',
      status: result.status,
      output: result.output,
      error: result.error,
    };
  } catch (error) {
    // Handle OAuth authentication errors specially
    if (error instanceof OAuthRequiredError) {
      console.log(`[Runtime] OAuth required for tool: ${error.toolName}, server: ${error.serverName}`);

      // Update execution status to waiting_input
      await updateExecutionStatus(supabase, executionId, 'waiting_input', `Authentication required for ${error.serverName}`);
      await logToDb(supabase, executionId, automationId, 'warn', error.toolName, `OAuth authentication required for server: ${error.serverName}`, 'waiting_input');

      // Create human request record for auth
      const inputUrl = `/automation/${automationId}/running/${executionId}/input`;
      await supabase.from('automation_human_requests').insert({
        execution_id: executionId,
        automation_id: automationId,
        user_id: userId,
        request_type: 'auth',
        message: `Automation "${automationName || automationId}" requires authentication for ${error.serverName}`,
        required_fields: [{
          name: 'oauth_auth',
          type: 'oauth',
          description: `Authenticate with ${error.serverName}`,
          server_name: error.serverName,
          server_id: error.serverId,
          server_type: error.serverType,
        }],
        input_url: inputUrl,
        notification_channels: notificationChannels,
      });

      // Build full URL with auth requirement query params
      const fullInputUrl = new URL(inputUrl, baseUrl);
      fullInputUrl.searchParams.set('require_auth', 'true');
      fullInputUrl.searchParams.set('server_name', error.serverName);
      if (error.serverId) {
        fullInputUrl.searchParams.set('server_id', error.serverId);
      }
      fullInputUrl.searchParams.set('message', `Authentication required for ${error.serverName}`);

      const notificationMessage = `Automation "${automationName || automationId}" requires authentication for ${error.serverName}`;

      // Send push notification
      if (notificationChannels.includes('push')) {
        try {
          await fetch(`${baseUrl}/api/push/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
            },
            body: JSON.stringify({
              userId,
              title: '🔐 Authentication Required',
              body: notificationMessage,
              data: {
                url: fullInputUrl.toString(),
                type: 'automation_auth',
                automationId,
                executionId,
                serverName: error.serverName,
              },
              requireInteraction: true,
            }),
          });
        } catch (e) {
          console.error('[Runtime] Failed to send push notification:', e);
        }
      }

      // Send email notification
      if (notificationChannels.includes('email') && userEmail) {
        try {
          const emailBody = `
Hello,

${notificationMessage}

The automation tried to use a tool from "${error.serverName}" but authentication is required.

Click here to authenticate and continue:
${fullInputUrl.toString()}

⏱️ This request will timeout in 5 minutes.

- Tulzo Automation
          `.trim();

          await fetch(`${baseUrl}/api/email/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Internal-Call': process.env.INTERNAL_API_SECRET || '',
              ...(userId && { 'X-User-Id': userId }),
            },
            body: JSON.stringify({
              to: userEmail,
              subject: `🔐 Authentication Required: ${automationName || automationId}`,
              body: emailBody,
            }),
          });
        } catch (e) {
          console.error('[Runtime] Failed to send email notification:', e);
        }
      }

      return {
        success: false,
        status: 'waiting_input',
        error: `Authentication required for ${error.serverName}`,
        requiresAuth: {
          serverName: error.serverName,
          serverId: error.serverId,
          serverType: error.serverType,
          toolName: error.toolName,
          connectorId: error.connectorId,
        },
      };
    }

    // Handle other errors
    const errorMsg = error instanceof Error ? error.message : String(error);
    await updateExecutionStatus(supabase, executionId, 'failed', errorMsg);
    await logToDb(supabase, executionId, automationId, 'error', 'workflow', errorMsg, 'failed');
    return { success: false, status: 'failed', error: errorMsg };
  }
}

/**
 * Update execution status in database
 */
async function updateExecutionStatus(
  supabase: SupabaseClient,
  executionId: string,
  status: string,
  error?: string
): Promise<void> {
  try {
    const update: Record<string, unknown> = { status };
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      update.completed_at = new Date().toISOString();
    }
    if (error) {
      update.error = error;
    }
    await supabase
      .from('automation_executions')
      .update(update)
      .eq('id', executionId);
  } catch (err) {
    console.error('[Runtime] Failed to update execution status:', err);
  }
}

/**
 * Update current step in execution
 */
async function updateExecutionStep(
  supabase: SupabaseClient,
  executionId: string,
  stepId: string
): Promise<void> {
  try {
    await supabase
      .from('automation_executions')
      .update({ current_step: stepId })
      .eq('id', executionId);
  } catch (err) {
    console.error('[Runtime] Failed to update execution step:', err);
  }
}

/**
 * Log to automation_logs table
 */
async function logToDb(
  supabase: SupabaseClient,
  executionId: string,
  automationId: string,
  level: string,
  stepName: string,
  message: string,
  status: string,
  durationMs?: number
): Promise<void> {
  try {
    await supabase.from('automation_logs').insert({
      execution_id: executionId,
      automation_id: automationId,
      level,
      step_name: stepName,
      message,
      status,
      duration_ms: durationMs,
    });
  } catch (err) {
    console.error('[Runtime] Failed to log to DB:', err);
  }
}

