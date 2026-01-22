/**
 * Workflow Executor
 *
 * Interprets and executes automation workflows defined in YAML format.
 * Supports tool calls, LLM calls, conditionals, loops, and human-in-the-loop.
 *
 * Key features:
 * - Automation chaining (trigger other automations)
 * - Required inputs with pre-fill, sensitive, and human_input options
 * - Automatic human-in-the-loop for missing required inputs
 * - Output delivery via email, slack, webhook, push
 */

import {
  WorkflowDefinition,
  Step,
  ToolCallStep,
  CodeStep,
  LLMStep,
  IfStep,
  ForStep,
  WhileStep,
  HumanInLoopStep,
  ReturnStep,
  NotifyStep,
  TriggerAutomationStep,
  ExecutionState,
  ExecutionResult,
  ExecutionLogEntry,
  ExecutionStatus,
  PendingInput,
  OutputResult,
  OutputConfig,
  RequiredInputsConfig,
} from './types';

// Tool executor interface - to be implemented by the caller
export interface ToolExecutor {
  callTool(toolName: string, params: Record<string, unknown>): Promise<unknown>;
  // Get required parameters for a tool
  getToolSchema?(toolName: string): Promise<{
    required?: string[];
    properties?: Record<string, { type?: string; description?: string }>;
  } | null>;
}

// LLM executor interface - to be implemented by the caller
export interface LLMExecutor {
  callLLM(options: {
    model?: string;
    system?: string;
    prompt: string;
    format?: 'text' | 'json';
    schema?: Record<string, unknown>;
  }): Promise<string>;
}

// Human input handler interface
export interface HumanInputHandler {
  requestInput(options: {
    message: string;
    type: 'confirm' | 'text' | 'choice';
    choices?: string[];
    timeout?: number;
    notify?: string[];
  }): Promise<{ value: unknown; timedOut: boolean }>;

  // Request missing required input (sends notification)
  requestMissingInput?(options: {
    fieldName: string;
    stepId: string;
    toolName?: string;
    description?: string;
    type?: string;
    channels?: string[];
  }): Promise<void>;
}

// Notification handler interface
export interface NotificationHandler {
  notify(options: {
    channels: string[];
    message: string;
    priority?: string;
  }): Promise<void>;
}

// Output handler interface - delivers workflow results
export interface OutputHandler {
  sendEmail?(options: {
    to: string | string[];
    subject: string;
    body?: string;
    template?: string;
    data?: Record<string, unknown>;
  }): Promise<OutputResult>;

  sendSlack?(options: {
    channel: string;
    message: string;
    blocks?: unknown[];
  }): Promise<OutputResult>;

  sendWebhook?(options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<OutputResult>;

  sendPush?(options: {
    title: string;
    message: string;
    data?: Record<string, unknown>;
  }): Promise<OutputResult>;
}

// Automation trigger handler - triggers other automations
export interface AutomationTriggerHandler {
  triggerAutomation(options: {
    name: string;
    inputs?: Record<string, unknown>;
    wait?: boolean;
  }): Promise<{ executionId: string; result?: unknown }>;
}

export interface ExecutorOptions {
  toolExecutor: ToolExecutor;
  llmExecutor: LLMExecutor;
  humanInputHandler?: HumanInputHandler;
  notificationHandler?: NotificationHandler;
  outputHandler?: OutputHandler;
  automationTriggerHandler?: AutomationTriggerHandler;

  // Pre-collected inputs (from required_inputs or previous collection)
  collectedInputs?: Record<string, unknown>;

  // Callbacks
  onStepStart?: (stepId: string, stepType: string) => void;
  onStepComplete?: (stepId: string, result: unknown) => void;
  onStepError?: (stepId: string, error: Error) => void;
  onMissingInput?: (pending: PendingInput) => void;
  onOutputSent?: (result: OutputResult) => void;
}

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  workflow: WorkflowDefinition,
  triggerData: unknown,
  options: ExecutorOptions
): Promise<ExecutionResult> {
  // Initialize collected inputs from required_inputs config
  const collectedInputs = initializeRequiredInputs(
    workflow.required_inputs,
    options.collectedInputs
  );

  const state: ExecutionState = {
    id: crypto.randomUUID(),
    workflowId: workflow.name,
    automationId: workflow.name,  // Will be set by caller
    userId: '',  // Will be set by caller
    status: 'running',
    currentStepIndex: 0,
    variables: {
      trigger: triggerData,
      ...collectedInputs,
      ...(workflow.inputs?.reduce((acc, input) => {
        if (input.default !== undefined) {
          acc[input.name] = input.default;
        }
        return acc;
      }, {} as Record<string, unknown>) || {}),
    },
    collectedInputs,
    pendingInputs: [],
    triggerType: workflow.trigger.type,
    triggerData,
    startedAt: new Date(),
    log: [],
  };

  try {
    const result = await executeSteps(workflow.steps, state, options, workflow);

    // If completed successfully, send outputs
    if (result.status === 'completed' && workflow.outputs) {
      state.outputResults = await sendOutputs(workflow.outputs, state, options);
    }

    state.status = result.status;
    state.output = result.output;
    state.completedAt = new Date();

    return result;
  } catch (error) {
    state.status = 'failed';
    state.error = error instanceof Error ? error.message : String(error);
    state.completedAt = new Date();

    return {
      status: 'failed',
      error: state.error,
    };
  }
}

/**
 * Initialize required inputs from config and pre-collected values
 */
function initializeRequiredInputs(
  requiredInputs?: RequiredInputsConfig,
  preCollected?: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...preCollected };

  if (!requiredInputs) return result;

  for (const [fieldName, config] of Object.entries(requiredInputs)) {
    // Skip if already collected
    if (result[fieldName] !== undefined) continue;

    // Skip if marked as human_input (will be collected at runtime)
    if (config.human_input) continue;

    // Use pre-filled value
    if (config.value !== undefined) {
      result[fieldName] = config.value;
    }
  }

  return result;
}

/**
 * Send workflow outputs (email, slack, webhook, etc.)
 */
async function sendOutputs(
  outputs: OutputConfig[],
  state: ExecutionState,
  options: ExecutorOptions
): Promise<OutputResult[]> {
  const results: OutputResult[] = [];

  for (const output of outputs) {
    try {
      let result: OutputResult;

      switch (output.type) {
        case 'email':
          if (options.outputHandler?.sendEmail) {
            const toValue = output.to;
            const resolvedTo = Array.isArray(toValue)
              ? toValue.map(t => resolveTemplate(t, state.variables))
              : resolveTemplate(toValue, state.variables);
            result = await options.outputHandler.sendEmail({
              to: resolvedTo,
              subject: resolveTemplate(output.subject, state.variables),
              body: output.body ? resolveTemplate(output.body, state.variables) : undefined,
              template: output.template,
              data: state.variables as Record<string, unknown>,
            });
          } else {
            result = { type: 'email', success: false, error: 'Email handler not configured' };
          }
          break;

        case 'slack':
          if (options.outputHandler?.sendSlack) {
            result = await options.outputHandler.sendSlack({
              channel: resolveTemplate(output.channel, state.variables),
              message: resolveTemplate(output.message, state.variables),
              blocks: output.blocks,
            });
          } else {
            result = { type: 'slack', success: false, error: 'Slack handler not configured' };
          }
          break;

        case 'webhook':
          if (options.outputHandler?.sendWebhook) {
            result = await options.outputHandler.sendWebhook({
              url: resolveTemplate(output.url, state.variables),
              method: output.method,
              headers: output.headers,
              body: resolveValue(output.body, state.variables),
            });
          } else {
            result = { type: 'webhook', success: false, error: 'Webhook handler not configured' };
          }
          break;

        case 'push':
          if (options.outputHandler?.sendPush) {
            result = await options.outputHandler.sendPush({
              title: resolveTemplate(output.title, state.variables),
              message: resolveTemplate(output.message, state.variables),
              data: output.data,
            });
          } else {
            result = { type: 'push', success: false, error: 'Push handler not configured' };
          }
          break;

        case 'automation':
          if (options.automationTriggerHandler) {
            const triggerResult = await options.automationTriggerHandler.triggerAutomation({
              name: output.name,
              inputs: resolveValue(output.inputs, state.variables) as Record<string, unknown>,
              wait: false,
            });
            result = {
              type: 'automation',
              success: true,
              details: { executionId: triggerResult.executionId }
            };
          } else {
            result = { type: 'automation', success: false, error: 'Automation trigger handler not configured' };
          }
          break;

        default:
          result = { type: 'email', success: false, error: `Unknown output type` };
      }

      result.sentAt = new Date();
      results.push(result);
      options.onOutputSent?.(result);
    } catch (error) {
      results.push({
        type: output.type,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        sentAt: new Date(),
      });
    }
  }

  return results;
}

/**
 * Execute a list of steps
 */
async function executeSteps(
  steps: Step[],
  state: ExecutionState,
  options: ExecutorOptions,
  workflow?: WorkflowDefinition
): Promise<ExecutionResult> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    state.currentStepId = step.id;
    state.currentStepIndex = i;

    const logEntry: ExecutionLogEntry = {
      timestamp: new Date(),
      stepId: step.id,
      stepType: getStepType(step),
      status: 'started',
    };

    options.onStepStart?.(step.id, logEntry.stepType);

    try {
      // Check for missing required inputs before tool calls
      if (isToolCallStep(step)) {
        const missingInputs = await checkMissingInputs(step, state, options, workflow);
        if (missingInputs.length > 0) {
          // Add to pending inputs and pause
          state.pendingInputs.push(...missingInputs);
          state.status = 'waiting_input';
          state.pauseReason = 'missing_input';
          state.pauseMessage = `Missing required inputs: ${missingInputs.map(i => i.fieldName).join(', ')}`;

          // Send notifications for missing inputs
          for (const pending of missingInputs) {
            if (options.humanInputHandler?.requestMissingInput) {
              await options.humanInputHandler.requestMissingInput({
                fieldName: pending.fieldName,
                stepId: step.id,
                toolName: pending.toolName,
                description: pending.description,
                type: pending.type,
                channels: ['email'],
              });
              pending.notificationSent = true;
            }
            options.onMissingInput?.(pending);
          }

          logEntry.status = 'completed';
          logEntry.message = 'Waiting for missing inputs';
          state.log.push(logEntry);

          return {
            status: 'paused',
            currentStepId: step.id,
            pauseToken: state.id,
          };
        }
      }

      const result = await executeStep(step, state, options, workflow);

      // Check for early return
      if (result.status === 'completed' && 'return' in step) {
        logEntry.status = 'completed';
        logEntry.output = result.output;
        state.log.push(logEntry);
        return result;
      }

      // Check for pause (human-in-the-loop or waiting_input)
      if (result.status === 'paused' || result.status === 'waiting_input') {
        logEntry.status = 'completed';
        logEntry.message = 'Waiting for human input';
        state.log.push(logEntry);
        return result;
      }

      logEntry.status = 'completed';
      logEntry.output = result.output;
      logEntry.durationMs = Date.now() - logEntry.timestamp.getTime();
      state.log.push(logEntry);

      options.onStepComplete?.(step.id, result.output);
    } catch (error) {
      logEntry.status = 'failed';
      logEntry.error = error instanceof Error ? error.message : String(error);
      state.log.push(logEntry);

      options.onStepError?.(step.id, error instanceof Error ? error : new Error(String(error)));

      // Handle error based on step's onError setting
      const onError = step.onError || 'fail';
      if (onError === 'fail') {
        throw error;
      }
      // 'continue' - just move to next step
    }
  }

  return { status: 'completed', output: state.variables };
}

/**
 * Check for missing required inputs before executing a tool call
 */
async function checkMissingInputs(
  step: ToolCallStep,
  state: ExecutionState,
  options: ExecutorOptions,
  workflow?: WorkflowDefinition
): Promise<PendingInput[]> {
  const missing: PendingInput[] = [];

  // Get tool schema if available
  const schema = await options.toolExecutor.getToolSchema?.(step.tool);
  if (!schema?.required) return missing;

  // Check each required parameter
  for (const requiredParam of schema.required) {
    const paramValue = step.params[requiredParam];

    // If it's a variable reference, check if it exists
    if (typeof paramValue === 'string' && paramValue.startsWith('{{') && paramValue.endsWith('}}')) {
      const varName = paramValue.slice(2, -2).trim().split('.')[0];

      // Check if variable exists in context
      if (state.variables[varName] === undefined && state.collectedInputs[varName] === undefined) {
        // Check if it's configured as human_input in required_inputs
        const requiredInputConfig = workflow?.required_inputs?.[varName];

        missing.push({
          fieldName: varName,
          stepId: step.id,
          toolName: step.tool,
          description: requiredInputConfig?.description || schema.properties?.[requiredParam]?.description,
          type: requiredInputConfig?.type || schema.properties?.[requiredParam]?.type as PendingInput['type'],
          required: true,
        });
      }
    }
  }

  return missing;
}

/**
 * Execute a single step
 */
async function executeStep(
  step: Step,
  state: ExecutionState,
  options: ExecutorOptions,
  workflow?: WorkflowDefinition
): Promise<ExecutionResult> {
  if (isToolCallStep(step)) {
    return executeToolCall(step, state, options);
  } else if (isCodeStep(step)) {
    return executeCode(step, state);
  } else if (isLLMStep(step)) {
    return executeLLM(step, state, options);
  } else if (isIfStep(step)) {
    return executeIf(step, state, options, workflow);
  } else if (isForStep(step)) {
    return executeFor(step, state, options, workflow);
  } else if (isWhileStep(step)) {
    return executeWhile(step, state, options, workflow);
  } else if (isHumanStep(step)) {
    return executeHuman(step, state, options);
  } else if (isNotifyStep(step)) {
    return executeNotify(step, state, options);
  } else if (isReturnStep(step)) {
    return executeReturn(step, state);
  } else if (isTriggerAutomationStep(step)) {
    return executeTriggerAutomation(step, state, options);
  }

  return { status: 'completed' };
}

/**
 * Execute a tool call step
 */
async function executeToolCall(
  step: ToolCallStep,
  state: ExecutionState,
  options: ExecutorOptions
): Promise<ExecutionResult> {
  // Resolve parameter values
  const resolvedParams: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(step.params)) {
    resolvedParams[key] = resolveValue(value, state.variables);
  }

  const result = await options.toolExecutor.callTool(step.tool, resolvedParams);
  state.variables[step.output] = result;

  return { status: 'completed', output: result };
}

/**
 * Execute a code step
 */
async function executeCode(
  step: CodeStep,
  state: ExecutionState
): Promise<ExecutionResult> {
  // Create a sandboxed function with access to variables
  const fn = new Function(...Object.keys(state.variables), `return (${step.code})`);
  const result = fn(...Object.values(state.variables));

  state.variables[step.output] = result;

  return { status: 'completed', output: result };
}

/**
 * Execute an LLM step
 */
async function executeLLM(
  step: LLMStep,
  state: ExecutionState,
  options: ExecutorOptions
): Promise<ExecutionResult> {
  // Resolve prompt template
  const resolvedPrompt = resolveTemplate(step.llm.prompt, state.variables);
  const resolvedSystem = step.llm.system ? resolveTemplate(step.llm.system, state.variables) : undefined;

  const result = await options.llmExecutor.callLLM({
    model: step.llm.model,
    system: resolvedSystem,
    prompt: resolvedPrompt,
    format: step.llm.format,
    schema: step.llm.schema,
  });

  // Parse JSON if format is json
  const output = step.llm.format === 'json' ? JSON.parse(result) : result;
  state.variables[step.output] = output;

  return { status: 'completed', output };
}

/**
 * Execute an if step
 */
async function executeIf(
  step: IfStep,
  state: ExecutionState,
  options: ExecutorOptions,
  workflow?: WorkflowDefinition
): Promise<ExecutionResult> {
  // Evaluate condition
  const fn = new Function(...Object.keys(state.variables), `return (${step.if})`);
  const condition = fn(...Object.values(state.variables));

  if (condition) {
    return executeSteps(step.then, state, options, workflow);
  } else if (step.else) {
    return executeSteps(step.else, state, options, workflow);
  }

  return { status: 'completed' };
}

/**
 * Execute a for loop step
 */
async function executeFor(
  step: ForStep,
  state: ExecutionState,
  options: ExecutorOptions,
  workflow?: WorkflowDefinition
): Promise<ExecutionResult> {
  // Parse "item in items" syntax
  const match = step.for.match(/^(\w+)\s+in\s+(.+)$/);
  if (!match) {
    throw new Error(`Invalid for loop syntax: ${step.for}`);
  }

  const [, itemVar, iterableExpr] = match;

  // Evaluate iterable expression
  const fn = new Function(...Object.keys(state.variables), `return (${iterableExpr})`);
  const iterable = fn(...Object.values(state.variables));

  if (!Array.isArray(iterable)) {
    throw new Error(`For loop iterable is not an array: ${iterableExpr}`);
  }

  const results: unknown[] = [];
  for (let i = 0; i < iterable.length; i++) {
    state.variables[itemVar] = iterable[i];
    state.variables[`${itemVar}_index`] = i;

    const result = await executeSteps(step.do, state, options, workflow);
    results.push(result.output);

    // Check for early return or pause
    if (result.status === 'completed' && result.output !== state.variables) {
      return result;
    }
    if (result.status === 'paused' || result.status === 'waiting_input') {
      return result;
    }
  }

  return { status: 'completed', output: results };
}

/**
 * Execute a while loop step
 */
async function executeWhile(
  step: WhileStep,
  state: ExecutionState,
  options: ExecutorOptions,
  workflow?: WorkflowDefinition
): Promise<ExecutionResult> {
  const maxIterations = step.maxIterations || 100;
  let iterations = 0;

  while (iterations < maxIterations) {
    // Evaluate condition
    const fn = new Function(...Object.keys(state.variables), `return (${step.while})`);
    const condition = fn(...Object.values(state.variables));

    if (!condition) break;

    const result = await executeSteps(step.do, state, options, workflow);

    // Check for early return or pause
    if (result.status === 'completed' && result.output !== state.variables) {
      return result;
    }
    if (result.status === 'paused' || result.status === 'waiting_input') {
      return result;
    }

    iterations++;
  }

  return { status: 'completed', output: iterations };
}

/**
 * Execute a human-in-the-loop step
 */
async function executeHuman(
  step: HumanInLoopStep,
  state: ExecutionState,
  options: ExecutorOptions
): Promise<ExecutionResult> {
  if (!options.humanInputHandler) {
    throw new Error('Human input handler not configured');
  }

  const resolvedMessage = resolveTemplate(step.human.message, state.variables);

  const { value, timedOut } = await options.humanInputHandler.requestInput({
    message: resolvedMessage,
    type: step.human.type,
    choices: step.human.choices,
    timeout: step.human.timeout,
  });

  if (timedOut) {
    state.status = 'paused';
    state.pauseReason = 'human_step';
    state.pauseMessage = `Timed out waiting for input: ${resolvedMessage}`;
    return { status: 'paused', currentStepId: step.id };
  }

  state.variables[step.output] = value;

  return { status: 'completed', output: value };
}

/**
 * Execute a notify step
 */
async function executeNotify(
  step: NotifyStep,
  state: ExecutionState,
  options: ExecutorOptions
): Promise<ExecutionResult> {
  if (!options.notificationHandler) {
    console.warn('Notification handler not configured, skipping notify step');
    return { status: 'completed' };
  }

  const resolvedMessage = resolveTemplate(step.notify.message, state.variables);

  await options.notificationHandler.notify({
    channels: step.notify.channels,
    message: resolvedMessage,
    priority: step.notify.priority,
  });

  return { status: 'completed' };
}

/**
 * Execute a return step
 */
async function executeReturn(
  step: ReturnStep,
  state: ExecutionState
): Promise<ExecutionResult> {
  const output = typeof step.return === 'string'
    ? resolveValue(step.return, state.variables)
    : resolveObject(step.return as Record<string, unknown>, state.variables);

  return { status: 'completed', output };
}

// ============ HELPER FUNCTIONS ============

/**
 * Resolve a value that may contain variable references
 */
function resolveValue(value: unknown, variables: Record<string, unknown>): unknown {
  if (typeof value !== 'string') return value;

  // Check for template syntax {{variable}}
  const templateMatch = value.match(/^\{\{(.+)\}\}$/);
  if (templateMatch) {
    const expr = templateMatch[1].trim();
    const fn = new Function(...Object.keys(variables), `return (${expr})`);
    return fn(...Object.values(variables));
  }

  // Check for embedded templates
  if (value.includes('{{')) {
    return resolveTemplate(value, variables);
  }

  return value;
}

/**
 * Resolve a template string with {{variable}} placeholders
 */
function resolveTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(.+?)\}\}/g, (_, expr) => {
    const fn = new Function(...Object.keys(variables), `return (${expr.trim()})`);
    const result = fn(...Object.values(variables));
    return String(result);
  });
}

/**
 * Resolve an object with potential variable references
 */
function resolveObject(obj: Record<string, unknown>, variables: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = resolveObject(value as Record<string, unknown>, variables);
    } else {
      result[key] = resolveValue(value, variables);
    }
  }
  return result;
}

/**
 * Execute a trigger automation step
 */
async function executeTriggerAutomation(
  step: TriggerAutomationStep,
  state: ExecutionState,
  options: ExecutorOptions
): Promise<ExecutionResult> {
  if (!options.automationTriggerHandler) {
    throw new Error('Automation trigger handler not configured');
  }

  const resolvedInputs: Record<string, unknown> = {};
  if (step.trigger_automation.inputs) {
    for (const [key, value] of Object.entries(step.trigger_automation.inputs)) {
      resolvedInputs[key] = resolveValue(value, state.variables);
    }
  }

  const result = await options.automationTriggerHandler.triggerAutomation({
    name: step.trigger_automation.name,
    inputs: resolvedInputs,
    wait: step.trigger_automation.wait || false,
  });

  if (step.output) {
    state.variables[step.output] = step.trigger_automation.wait ? result.result : result.executionId;
  }

  return { status: 'completed', output: result };
}

/**
 * Get the type of a step
 */
function getStepType(step: Step): string {
  if ('tool' in step) return 'tool';
  if ('code' in step && !('if' in step) && !('while' in step)) return 'code';
  if ('llm' in step) return 'llm';
  if ('if' in step) return 'if';
  if ('for' in step) return 'for';
  if ('while' in step) return 'while';
  if ('human' in step) return 'human';
  if ('notify' in step) return 'notify';
  if ('return' in step) return 'return';
  if ('trigger_automation' in step) return 'trigger_automation';
  return 'unknown';
}

// ============ TYPE GUARDS ============

function isToolCallStep(step: Step): step is ToolCallStep {
  return 'tool' in step && typeof (step as ToolCallStep).tool === 'string';
}

function isCodeStep(step: Step): step is CodeStep {
  return 'code' in step && typeof (step as CodeStep).code === 'string' && !('if' in step) && !('while' in step);
}

function isLLMStep(step: Step): step is LLMStep {
  return 'llm' in step;
}

function isIfStep(step: Step): step is IfStep {
  return 'if' in step && 'then' in step;
}

function isForStep(step: Step): step is ForStep {
  return 'for' in step && 'do' in step;
}

function isWhileStep(step: Step): step is WhileStep {
  return 'while' in step && 'do' in step;
}

function isHumanStep(step: Step): step is HumanInLoopStep {
  return 'human' in step;
}

function isNotifyStep(step: Step): step is NotifyStep {
  return 'notify' in step;
}

function isReturnStep(step: Step): step is ReturnStep {
  return 'return' in step;
}

function isTriggerAutomationStep(step: Step): step is TriggerAutomationStep {
  return 'trigger_automation' in step;
}
