/**
 * Automation Workflow Types
 *
 * These types define the YAML schema for automation workflows.
 * YAML is the source of truth - Mermaid diagrams are generated from it.
 *
 * Key concepts:
 * - Automations can trigger other automations by name
 * - Outputs are notifications (email, slack, webhook) not JSON
 * - Required fields can be pre-filled, marked sensitive, or human_input
 * - Missing required fields trigger human-in-the-loop notifications
 */

// ============ WORKFLOW DEFINITION ============

export interface WorkflowDefinition {
  name: string;
  description?: string;
  version?: number;

  // Trigger configuration
  trigger: TriggerConfig;

  // Workflow inputs (from trigger/webhook)
  inputs?: WorkflowInput[];

  // Pre-configured required inputs with values or human_input markers
  required_inputs?: RequiredInputsConfig;

  // How results are delivered (email, slack, webhook, trigger automation)
  outputs?: OutputConfig[];

  // The steps to execute
  steps: Step[];

  // Constraints and settings
  constraints?: WorkflowConstraints;

  // Available tools (auto-populated from connectors)
  tools?: string[];  // e.g., ["brave-search.*", "slack.send_message"]
}

export interface WorkflowInput {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: unknown;
  description?: string;
}

export interface WorkflowConstraints {
  maxToolCalls?: number;
  timeout?: string;  // e.g., "60s", "5m"
  requireApprovalFor?: string[];  // Tool names that need human approval
}

// ============ TRIGGER CONFIGURATION ============

export type TriggerConfig =
  | ManualTrigger
  | CronTrigger
  | WebhookTrigger
  | EventTrigger
  | AutomationTrigger;

export interface ManualTrigger {
  type: 'manual';
}

export interface CronTrigger {
  type: 'cron';
  schedule: string;  // Cron expression
  timezone?: string;
}

export interface WebhookTrigger {
  type: 'webhook';
  webhook: {
    method?: 'GET' | 'POST';
    auth?: WebhookAuth;
    inputSchema?: Record<string, unknown>;  // JSON Schema for validation
  };
}

export interface WebhookAuth {
  type: 'none' | 'api_key' | 'signature' | 'bearer';
  apiKey?: { header?: string; query?: string };
  signature?: { header: string; secretEnv: string };
  bearer?: { secretEnv: string };
}

export interface EventTrigger {
  type: 'event';
  event: {
    name: string;  // e.g., "order.created"
    filter?: string;  // JavaScript expression
  };
}

// Triggered by another automation completing or reaching a step
export interface AutomationTrigger {
  type: 'automation';
  from: string;  // Name of the triggering automation
  on?: 'complete' | 'step';  // When to trigger (default: complete)
  step?: string;  // If on='step', which step id
}

// ============ REQUIRED INPUTS CONFIGURATION ============

export interface RequiredInputsConfig {
  [fieldName: string]: RequiredInputValue;
}

export interface RequiredInputValue {
  value?: unknown;  // Pre-filled value (null/undefined if human_input)
  human_input?: boolean;  // Explicitly request from human at runtime
  sensitive?: boolean;  // Store in vault, mask in UI
  description?: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

// ============ OUTPUT CONFIGURATION ============

export type OutputConfig =
  | EmailOutput
  | SlackOutput
  | WebhookOutput
  | PushOutput
  | AutomationOutput;

export interface EmailOutput {
  type: 'email';
  to: string | string[];  // Can use {{variable}}
  subject: string;
  template?: string;  // Template name or inline
  body?: string;
}

export interface SlackOutput {
  type: 'slack';
  channel: string;
  message: string;
  blocks?: unknown[];  // Slack block kit
}

export interface WebhookOutput {
  type: 'webhook';
  url: string;
  method?: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: unknown;
}

export interface PushOutput {
  type: 'push';
  title: string;
  message: string;
  data?: Record<string, unknown>;
}

// Trigger another automation as output
export interface AutomationOutput {
  type: 'automation';
  name: string;  // Name of automation to trigger
  inputs?: Record<string, unknown>;  // Inputs to pass
}

// ============ STEP TYPES ============

export type Step =
  | ToolCallStep
  | CodeStep
  | LLMStep
  | IfStep
  | ForStep
  | WhileStep
  | HumanInLoopStep
  | ReturnStep
  | NotifyStep
  | TriggerAutomationStep;

// Base properties shared by all steps
interface BaseStep {
  id: string;
  onError?: 'continue' | 'fail' | 'retry';
}

// Tool call step - calls an MCP tool
export interface ToolCallStep extends BaseStep {
  tool: string;  // e.g., "brave-search.web_search"
  params: Record<string, ParameterValue>;
  output: string;  // Variable name to store result
}

// Inline code step - JavaScript/TypeScript expression
export interface CodeStep extends BaseStep {
  code: string;  // JavaScript code
  output: string;
}

// LLM call step - calls an AI model
export interface LLMStep extends BaseStep {
  llm: {
    model?: string;
    system?: string;
    prompt: string;  // Can include {{variables}}
    format?: 'text' | 'json';
    schema?: Record<string, unknown>;  // JSON Schema if format is 'json'
  };
  output: string;
}

// Conditional step
export interface IfStep extends BaseStep {
  if: string;  // JavaScript condition
  then: Step[];
  else?: Step[];
}

// For loop step
export interface ForStep extends BaseStep {
  for: string;  // e.g., "item in items"
  do: Step[];
}

// While loop step
export interface WhileStep extends BaseStep {
  while: string;  // JavaScript condition
  do: Step[];
  maxIterations?: number;
}

// Human-in-the-loop step
export interface HumanInLoopStep extends BaseStep {
  human: {
    message: string;
    type: 'confirm' | 'text' | 'choice';
    choices?: string[];
    timeout?: number;  // Seconds
    notify?: ('email' | 'slack' | 'ui')[];
  };
  output: string;
}

// Early return step
export interface ReturnStep extends BaseStep {
  return: Record<string, unknown> | string;  // Return value or expression
}

// Notification step (unified abstraction)
export interface NotifyStep extends BaseStep {
  notify: {
    channels: ('email' | 'slack' | 'push' | 'ui')[];
    message: string;
    priority?: 'low' | 'normal' | 'high';
  };
}

// Trigger another automation step
export interface TriggerAutomationStep extends BaseStep {
  trigger_automation: {
    name: string;  // Name of automation to trigger
    inputs?: Record<string, ParameterValue>;  // Inputs to pass
    wait?: boolean;  // Wait for completion (default: false)
  };
  output?: string;  // Variable to store result if wait=true
}

// ============ PARAMETER VALUES ============

export type ParameterValue =
  | unknown  // Literal value
  | string;  // Can be "{{variable}}" or "{{expression}}"

// ============ EXECUTION TYPES ============

export type ExecutionStatus = 'pending' | 'waiting_input' | 'running' | 'paused' | 'completed' | 'failed';

export interface ExecutionState {
  id: string;
  workflowId: string;
  automationId: string;
  userId: string;
  status: ExecutionStatus;

  // Current position
  currentStepId?: string;
  currentStepIndex: number;

  // Variables accumulated during execution
  variables: Record<string, unknown>;

  // Collected and pending inputs
  collectedInputs: Record<string, unknown>;  // Inputs collected so far
  pendingInputs: PendingInput[];  // Inputs still needed

  // Trigger data
  triggerType: string;
  triggeredBy?: string;  // automation_id if triggered by another automation
  triggerData?: unknown;

  // Human-in-loop pause info
  pauseReason?: 'human_step' | 'missing_input' | 'approval_required';
  pauseMessage?: string;
  humanInput?: unknown;

  // Timing
  startedAt: Date;
  pausedAt?: Date;
  resumedAt?: Date;
  completedAt?: Date;

  // Results
  output?: unknown;
  outputResults?: OutputResult[];  // Results of output steps
  error?: string;

  // Execution log
  log: ExecutionLogEntry[];
}

export interface PendingInput {
  fieldName: string;
  stepId?: string;  // Which step needs this input
  toolName?: string;  // Which tool needs this input
  description?: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  notificationSent?: boolean;
}

export interface OutputResult {
  type: 'email' | 'slack' | 'webhook' | 'push' | 'automation';
  success: boolean;
  sentAt?: Date;
  error?: string;
  details?: Record<string, unknown>;
}

export interface ExecutionLogEntry {
  timestamp: Date;
  stepId: string;
  stepType: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  message?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
}

export interface ExecutionResult {
  status: ExecutionStatus;
  output?: unknown;
  error?: string;
  pauseToken?: string;
  currentStepId?: string;
}

// ============ MERMAID NODE TYPES ============

export type MermaidNodeType =
  | 'trigger'
  | 'tool'
  | 'code'
  | 'llm'
  | 'if'
  | 'for'
  | 'while'
  | 'human'
  | 'notify'
  | 'return'
  | 'end';

export interface MermaidNode {
  id: string;
  type: MermaidNodeType;
  label: string;
  inputs: string[];
  params: Record<string, unknown>;
  code?: string;
  prompt?: string;
  condition?: string;
  output?: string;
}

export interface MermaidEdge {
  from: string;
  to: string;
  label?: string;  // "yes", "no", etc.
}

export interface ParsedMermaid {
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

