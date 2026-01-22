/**
 * YAML to Mermaid Converter
 * 
 * Converts a WorkflowDefinition (from YAML) to a structured Mermaid diagram.
 * The Mermaid labels contain all the data needed for bidirectional sync.
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
  TriggerConfig,
} from './types';

// Node shape mappings for different step types
const NODE_SHAPES: Record<string, { open: string; close: string }> = {
  trigger: { open: '([', close: '])' },      // Stadium shape
  tool: { open: '[/', close: '/]' },         // Parallelogram
  code: { open: '[', close: ']' },           // Rectangle
  llm: { open: '[[', close: ']]' },          // Subroutine
  if: { open: '{', close: '}' },             // Diamond
  for: { open: '{{', close: '}}' },          // Hexagon
  while: { open: '{{', close: '}}' },        // Hexagon
  human: { open: '(((', close: ')))' },      // Circle
  notify: { open: '([', close: '])' },       // Stadium
  return: { open: '([', close: '])' },       // Stadium
  end: { open: '([', close: '])' },          // Stadium
};

// Emoji prefixes for step types
const TYPE_EMOJIS: Record<string, string> = {
  trigger: '▶️',
  tool: '🔧',
  code: '📝',
  llm: '🧠',
  if: '❓',
  for: '🔄',
  while: '🔁',
  human: '👤',
  notify: '🔔',
  return: '🏁',
  end: '✅',
};

// Style colors for different step types
const TYPE_COLORS: Record<string, { fill: string; color: string }> = {
  trigger: { fill: '#f59e0b', color: '#000' },
  tool: { fill: '#3b82f6', color: '#fff' },
  code: { fill: '#8b5cf6', color: '#fff' },
  llm: { fill: '#10b981', color: '#fff' },
  if: { fill: '#f59e0b', color: '#000' },
  for: { fill: '#06b6d4', color: '#fff' },
  while: { fill: '#06b6d4', color: '#fff' },
  human: { fill: '#ec4899', color: '#fff' },
  notify: { fill: '#f97316', color: '#fff' },
  return: { fill: '#ef4444', color: '#fff' },
  end: { fill: '#6b7280', color: '#fff' },
};

const SEPARATOR = '━━━━━━━━━━━━━━━━━━';

/**
 * Convert a WorkflowDefinition to a Mermaid diagram string
 */
export function workflowToMermaid(workflow: WorkflowDefinition): string {
  const lines: string[] = ['flowchart TD'];
  const styles: string[] = [];
  const connections: string[] = [];
  
  // Add trigger node
  const triggerNode = generateTriggerNode(workflow.trigger);
  lines.push(`    ${triggerNode.id}${triggerNode.shape}"${triggerNode.label}"${triggerNode.shapeClose}`);
  styles.push(`    style ${triggerNode.id} fill:${TYPE_COLORS.trigger.fill},color:${TYPE_COLORS.trigger.color}`);
  
  // Track previous node for connections
  let prevNodeId = triggerNode.id;
  
  // Process each step
  for (let i = 0; i < workflow.steps.length; i++) {
    const step = workflow.steps[i];
    const nodeInfo = generateStepNode(step);
    
    // Add node definition
    lines.push(`    ${nodeInfo.id}${nodeInfo.shape}"${nodeInfo.label}"${nodeInfo.shapeClose}`);
    styles.push(`    style ${nodeInfo.id} fill:${nodeInfo.fill},color:${nodeInfo.color}`);
    
    // Add connection from previous node
    connections.push(`    ${prevNodeId} --> ${nodeInfo.id}`);
    
    // Handle special cases (if, for, while)
    if (isIfStep(step)) {
      const { thenConnections, elseConnections, endNodeId } = processIfStep(step, nodeInfo.id, lines, styles);
      connections.push(...thenConnections);
      connections.push(...elseConnections);
      prevNodeId = endNodeId;
    } else if (isForStep(step) || isWhileStep(step)) {
      const { bodyConnections, endNodeId } = processLoopStep(step, nodeInfo.id, lines, styles);
      connections.push(...bodyConnections);
      prevNodeId = endNodeId;
    } else {
      prevNodeId = nodeInfo.id;
    }
  }
  
  // Add end node
  const endId = 'end_node';
  lines.push(`    ${endId}${NODE_SHAPES.end.open}"${TYPE_EMOJIS.end} End"${NODE_SHAPES.end.close}`);
  styles.push(`    style ${endId} fill:${TYPE_COLORS.end.fill},color:${TYPE_COLORS.end.color}`);
  connections.push(`    ${prevNodeId} --> ${endId}`);
  
  // Combine all parts
  return [...lines, '', ...connections, '', ...styles].join('\n');
}

/**
 * Generate trigger node
 */
function generateTriggerNode(trigger: TriggerConfig): { id: string; shape: string; shapeClose: string; label: string } {
  const id = 'trigger';
  const shape = NODE_SHAPES.trigger.open;
  const shapeClose = NODE_SHAPES.trigger.close;
  
  let label = `${TYPE_EMOJIS.trigger} trigger: ${trigger.type}`;
  
  if (trigger.type === 'cron') {
    label += `\\n${SEPARATOR}\\n⏰ ${trigger.schedule}`;
    if (trigger.timezone) {
      label += `\\n🌍 ${trigger.timezone}`;
    }
  } else if (trigger.type === 'webhook') {
    label += `\\n${SEPARATOR}\\n🔗 ${trigger.webhook.method || 'POST'}`;
  }
  
  return { id, shape, shapeClose, label };
}

/**
 * Generate a step node
 */
function generateStepNode(step: Step): { id: string; shape: string; shapeClose: string; label: string; fill: string; color: string } {
  const id = step.id;

  if (isToolCallStep(step)) {
    return generateToolNode(step);
  } else if (isCodeStep(step)) {
    return generateCodeNode(step);
  } else if (isLLMStep(step)) {
    return generateLLMNode(step);
  } else if (isIfStep(step)) {
    return generateIfNode(step);
  } else if (isForStep(step)) {
    return generateForNode(step);
  } else if (isWhileStep(step)) {
    return generateWhileNode(step);
  } else if (isHumanStep(step)) {
    return generateHumanNode(step);
  } else if (isNotifyStep(step)) {
    return generateNotifyNode(step);
  } else if (isReturnStep(step)) {
    return generateReturnNode(step);
  }

  // Default fallback
  return {
    id,
    shape: NODE_SHAPES.code.open,
    shapeClose: NODE_SHAPES.code.close,
    label: `📦 ${id}`,
    ...TYPE_COLORS.code,
  };
}

function generateToolNode(step: ToolCallStep) {
  const [connector, toolName] = step.tool.split('.');
  const paramsPreview = Object.entries(step.params)
    .slice(0, 3)
    .map(([k, v]) => `⚙️ ${k}: ${formatValue(v)}`)
    .join('\\n');

  const label = [
    `${TYPE_EMOJIS.tool} tool: ${step.id}`,
    SEPARATOR,
    `🔌 ${connector}.${toolName}`,
    paramsPreview,
    SEPARATOR,
    `📤 ${step.output}`,
  ].join('\\n');

  return { id: step.id, shape: NODE_SHAPES.tool.open, shapeClose: NODE_SHAPES.tool.close, label, ...TYPE_COLORS.tool };
}

function generateCodeNode(step: CodeStep) {
  const codePreview = step.code.split('\n').slice(0, 2).map(l => `💻 ${l.trim().substring(0, 30)}`).join('\\n');

  const label = [
    `${TYPE_EMOJIS.code} code: ${step.id}`,
    SEPARATOR,
    codePreview,
    SEPARATOR,
    `📤 ${step.output}`,
  ].join('\\n');

  return { id: step.id, shape: NODE_SHAPES.code.open, shapeClose: NODE_SHAPES.code.close, label, ...TYPE_COLORS.code };
}

function generateLLMNode(step: LLMStep) {
  const promptPreview = step.llm.prompt.substring(0, 40).replace(/\n/g, ' ');

  const label = [
    `${TYPE_EMOJIS.llm} llm: ${step.id}`,
    SEPARATOR,
    step.llm.model ? `🤖 ${step.llm.model}` : '',
    `📝 ${promptPreview}...`,
    SEPARATOR,
    `📤 ${step.output}`,
  ].filter(Boolean).join('\\n');

  return { id: step.id, shape: NODE_SHAPES.llm.open, shapeClose: NODE_SHAPES.llm.close, label, ...TYPE_COLORS.llm };
}

function generateIfNode(step: IfStep) {
  const conditionPreview = step.if.substring(0, 30);

  const label = [
    `${TYPE_EMOJIS.if} if: ${step.id}`,
    SEPARATOR,
    `💻 ${conditionPreview}`,
  ].join('\\n');

  return { id: step.id, shape: NODE_SHAPES.if.open, shapeClose: NODE_SHAPES.if.close, label, ...TYPE_COLORS.if };
}

function generateForNode(step: ForStep) {
  const label = [
    `${TYPE_EMOJIS.for} for: ${step.id}`,
    SEPARATOR,
    `🔄 ${step.for}`,
  ].join('\\n');

  return { id: step.id, shape: NODE_SHAPES.for.open, shapeClose: NODE_SHAPES.for.close, label, ...TYPE_COLORS.for };
}

function generateWhileNode(step: WhileStep) {
  const conditionPreview = step.while.substring(0, 30);

  const label = [
    `${TYPE_EMOJIS.while} while: ${step.id}`,
    SEPARATOR,
    `💻 ${conditionPreview}`,
    step.maxIterations ? `🔢 max: ${step.maxIterations}` : '',
  ].filter(Boolean).join('\\n');

  return { id: step.id, shape: NODE_SHAPES.while.open, shapeClose: NODE_SHAPES.while.close, label, ...TYPE_COLORS.while };
}

function generateHumanNode(step: HumanInLoopStep) {
  const label = [
    `${TYPE_EMOJIS.human} human: ${step.id}`,
    SEPARATOR,
    `💬 ${step.human.message.substring(0, 30)}...`,
    `📋 ${step.human.type}`,
    SEPARATOR,
    `📤 ${step.output}`,
  ].join('\\n');

  return { id: step.id, shape: NODE_SHAPES.human.open, shapeClose: NODE_SHAPES.human.close, label, ...TYPE_COLORS.human };
}

function generateNotifyNode(step: NotifyStep) {
  const label = [
    `${TYPE_EMOJIS.notify} notify: ${step.id}`,
    SEPARATOR,
    `📢 ${step.notify.channels.join(', ')}`,
    `💬 ${step.notify.message.substring(0, 30)}...`,
  ].join('\\n');

  return { id: step.id, shape: NODE_SHAPES.notify.open, shapeClose: NODE_SHAPES.notify.close, label, ...TYPE_COLORS.notify };
}

function generateReturnNode(step: ReturnStep) {
  const returnPreview = typeof step.return === 'string'
    ? step.return.substring(0, 30)
    : JSON.stringify(step.return).substring(0, 30);

  const label = [
    `${TYPE_EMOJIS.return} return: ${step.id}`,
    SEPARATOR,
    `📤 ${returnPreview}`,
  ].join('\\n');

  return { id: step.id, shape: NODE_SHAPES.return.open, shapeClose: NODE_SHAPES.return.close, label, ...TYPE_COLORS.return };
}

// Process if step branches
function processIfStep(
  step: IfStep,
  nodeId: string,
  lines: string[],
  styles: string[]
): { thenConnections: string[]; elseConnections: string[]; endNodeId: string } {
  const thenConnections: string[] = [];
  const elseConnections: string[] = [];

  // Process then branch
  let thenPrevId = nodeId;
  for (const thenStep of step.then) {
    const nodeInfo = generateStepNode(thenStep);
    lines.push(`    ${nodeInfo.id}${nodeInfo.shape}"${nodeInfo.label}"${nodeInfo.shapeClose}`);
    styles.push(`    style ${nodeInfo.id} fill:${nodeInfo.fill},color:${nodeInfo.color}`);

    if (thenPrevId === nodeId) {
      thenConnections.push(`    ${nodeId} -->|yes| ${nodeInfo.id}`);
    } else {
      thenConnections.push(`    ${thenPrevId} --> ${nodeInfo.id}`);
    }
    thenPrevId = nodeInfo.id;
  }

  // Process else branch if exists
  let elsePrevId = nodeId;
  if (step.else && step.else.length > 0) {
    for (const elseStep of step.else) {
      const nodeInfo = generateStepNode(elseStep);
      lines.push(`    ${nodeInfo.id}${nodeInfo.shape}"${nodeInfo.label}"${nodeInfo.shapeClose}`);
      styles.push(`    style ${nodeInfo.id} fill:${nodeInfo.fill},color:${nodeInfo.color}`);

      if (elsePrevId === nodeId) {
        elseConnections.push(`    ${nodeId} -->|no| ${nodeInfo.id}`);
      } else {
        elseConnections.push(`    ${elsePrevId} --> ${nodeInfo.id}`);
      }
      elsePrevId = nodeInfo.id;
    }
  }

  // Create merge point
  const mergeId = `${nodeId}_merge`;
  lines.push(`    ${mergeId}(( ))`);
  styles.push(`    style ${mergeId} fill:#374151,color:#fff`);

  thenConnections.push(`    ${thenPrevId} --> ${mergeId}`);
  if (step.else && step.else.length > 0) {
    elseConnections.push(`    ${elsePrevId} --> ${mergeId}`);
  } else {
    elseConnections.push(`    ${nodeId} -->|no| ${mergeId}`);
  }

  return { thenConnections, elseConnections, endNodeId: mergeId };
}

// Process loop steps (for/while)
function processLoopStep(
  step: ForStep | WhileStep,
  nodeId: string,
  lines: string[],
  styles: string[]
): { bodyConnections: string[]; endNodeId: string } {
  const bodyConnections: string[] = [];
  const doSteps = 'for' in step ? step.do : step.do;

  let prevId = nodeId;
  for (const bodyStep of doSteps) {
    const nodeInfo = generateStepNode(bodyStep);
    lines.push(`    ${nodeInfo.id}${nodeInfo.shape}"${nodeInfo.label}"${nodeInfo.shapeClose}`);
    styles.push(`    style ${nodeInfo.id} fill:${nodeInfo.fill},color:${nodeInfo.color}`);

    if (prevId === nodeId) {
      bodyConnections.push(`    ${nodeId} -->|loop| ${nodeInfo.id}`);
    } else {
      bodyConnections.push(`    ${prevId} --> ${nodeInfo.id}`);
    }
    prevId = nodeInfo.id;
  }

  // Loop back
  bodyConnections.push(`    ${prevId} -.->|next| ${nodeId}`);

  return { bodyConnections, endNodeId: nodeId };
}

// Helper to format parameter values for display
function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    if (value.startsWith('{{') && value.endsWith('}}')) {
      return value;  // Variable reference
    }
    return `'${value.substring(0, 20)}${value.length > 20 ? '...' : ''}'`;
  }
  return String(value);
}

// Type guards
function isToolCallStep(step: Step): step is ToolCallStep {
  return 'tool' in step && typeof (step as ToolCallStep).tool === 'string';
}

function isCodeStep(step: Step): step is CodeStep {
  return 'code' in step && typeof (step as CodeStep).code === 'string';
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

