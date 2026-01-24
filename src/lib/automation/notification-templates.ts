/**
 * Notification Templates for Automation Executor
 * 
 * Pre-formatted messages for various automation states that require user attention.
 * These are used when sending notifications via email, Slack, push, etc.
 * 
 * IMPORTANT: All waiting states have a 5-minute timeout.
 */

export const WAIT_TIMEOUT_SECONDS = 300; // 5 minutes

export interface NotificationContext {
  automationId: string;
  automationName: string;
  executionId: string;
  apiBaseUrl: string;
  inputUrl?: string;
  logsUrl?: string;
  retryUrl?: string;
  approvalUrl?: string;
}

export interface InputRequiredContext extends NotificationContext {
  missingInputs: Array<{
    fieldName: string;
    type: string;
    description?: string;
  }>;
}

export interface WaitForVariableContext extends NotificationContext {
  variableName: string;
  timeoutSeconds: number;
  condition?: string;
}

export interface ApprovalContext extends NotificationContext {
  stepId: string;
  approvalMessage: string;
}

export interface TimeoutContext extends NotificationContext {
  timeoutType: 'timeout_user_input' | 'timeout_wait_for' | 'timeout_approval';
  waitDescription: string;
}

/**
 * Generate input required notification message
 */
export function formatInputRequiredNotification(ctx: InputRequiredContext): string {
  const inputsList = ctx.missingInputs
    .map(i => `  - ${i.fieldName} (${i.type})${i.description ? `: ${i.description}` : ''}`)
    .join('\n');

  const curlExample = ctx.missingInputs.length > 0
    ? `curl -X POST "${ctx.apiBaseUrl}/api/ai/automations/${ctx.automationId}/executions/${ctx.executionId}/input" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "inputs": {
${ctx.missingInputs.map(i => `      "${i.fieldName}": "YOUR_VALUE"`).join(',\n')}
    }
  }'`
    : '';

  return `🤖 Automation "${ctx.automationName}" requires your input

Run ID: ${ctx.executionId}
Status: Waiting for input

The following fields are needed to continue:
${inputsList}

⏱️ This request will timeout in 5 minutes.

📝 Provide input via UI:
${ctx.inputUrl || `${ctx.apiBaseUrl}/automation/${ctx.automationId}/running/${ctx.executionId}/input`}

🔧 Or via API (curl):
${curlExample}`;
}

/**
 * Generate wait for variable notification message
 */
export function formatWaitForVariableNotification(ctx: WaitForVariableContext): string {
  return `⏳ Automation "${ctx.automationName}" is waiting for external event

Run ID: ${ctx.executionId}
Status: Waiting for variable "${ctx.variableName}"
${ctx.condition ? `Condition: ${ctx.condition}` : ''}

⏱️ This will timeout in ${ctx.timeoutSeconds} seconds.

🔧 Set the variable via API:
curl -X PUT "${ctx.apiBaseUrl}/api/ai/automations/${ctx.automationId}/executions/${ctx.executionId}/variables" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "variables": {
      "${ctx.variableName}": YOUR_VALUE
    }
  }'`;
}

/**
 * Generate human approval notification message
 */
export function formatApprovalNotification(ctx: ApprovalContext): string {
  return `👤 Automation "${ctx.automationName}" requires your approval

Run ID: ${ctx.executionId}
Step: ${ctx.stepId}

${ctx.approvalMessage}

⏱️ This request will timeout in 5 minutes.

📝 Respond via UI:
${ctx.approvalUrl || `${ctx.apiBaseUrl}/automation/${ctx.automationId}/running/${ctx.executionId}/input`}

🔧 Or via API:
# Approve
curl -X POST "${ctx.apiBaseUrl}/api/ai/automations/${ctx.automationId}/executions/${ctx.executionId}/input" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"inputs": {"approved": true}}'

# Reject
curl -X POST "${ctx.apiBaseUrl}/api/ai/automations/${ctx.automationId}/executions/${ctx.executionId}/input" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"inputs": {"approved": false, "reason": "Rejected by user"}}'`;
}

/**
 * Generate timeout notification message
 */
export function formatTimeoutNotification(ctx: TimeoutContext): string {
  return `⚠️ Automation "${ctx.automationName}" timed out

Run ID: ${ctx.executionId}
Status: Failed
Error: ${ctx.timeoutType}

The automation was waiting for ${ctx.waitDescription} but no response was received within 5 minutes.

The execution has been marked as failed. You can:
- View logs: ${ctx.logsUrl || `${ctx.apiBaseUrl}/automation/${ctx.automationId}/running/${ctx.executionId}`}
- Retry: ${ctx.retryUrl || `${ctx.apiBaseUrl}/automation/${ctx.automationId}`}`;
}

