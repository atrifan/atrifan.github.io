/**
 * Mermaid to YAML Parser
 *
 * Parses structured Mermaid diagrams back to WorkflowDefinition.
 * This enables bidirectional sync between visual editor and YAML.
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
  WorkflowInput,
  MermaidNode,
  MermaidEdge,
  ParsedMermaid,
  MermaidNodeType,
} from './types';

/**
 * Normalize a name to snake_case ID
 * "Birthday Checker" -> "birthday_checker"
 * "My Awesome Workflow!" -> "my_awesome_workflow"
 */
export function normalizeNameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '') // Remove special chars except spaces, underscores, hyphens
    .replace(/[\s-]+/g, '_')        // Replace spaces and hyphens with underscores
    .replace(/_+/g, '_')            // Collapse multiple underscores
    .replace(/^_|_$/g, '');         // Trim leading/trailing underscores
}

// Emoji to type mapping
const EMOJI_TO_TYPE: Record<string, MermaidNodeType> = {
  '▶️': 'trigger',
  '🔧': 'tool',
  '📝': 'code',
  '🧠': 'llm',
  '❓': 'if',
  '🔄': 'for',
  '🔁': 'while',
  '👤': 'human',
  '🔔': 'notify',
  '🏁': 'return',
  '✅': 'end',
};

const SEPARATOR = '━━━━━━━━━━━━━━━━━━';

/**
 * Parse a Mermaid diagram string into structured data
 */
export function parseMermaid(mermaidCode: string): ParsedMermaid {
  const nodes: MermaidNode[] = [];
  const edges: MermaidEdge[] = [];

  // Remove flowchart directive and clean up
  const lines = mermaidCode.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('flowchart') && !l.startsWith('style'));

  for (const line of lines) {
    // Try to parse as edge first (nodeA --> nodeB or nodeA -->|label| nodeB)
    const edgeMatch = line.match(/^(\w+)\s*(?:-->|-.->)\s*(?:\|([^|]+)\|\s*)?(\w+)$/);
    if (edgeMatch) {
      edges.push({
        from: edgeMatch[1],
        to: edgeMatch[3],
        label: edgeMatch[2] || undefined,
      });
      continue;
    }

    // Try to parse as node - handle all Mermaid shapes
    // Shapes: [/"/], ([""]), [[""]], {""}, {{""}}, (((""))), [""]
    const nodePatterns = [
      // Parallelogram (tool): nodeId[/"content"/]
      /^(\w+)\[\/\"(.+?)\"\/\]$/s,
      // Stadium (trigger/notify/return): nodeId(["content"])
      /^(\w+)\(\[\"(.+?)\"\]\)$/s,
      // Subroutine (llm): nodeId[["content"]]
      /^(\w+)\[\[\"(.+?)\"\]\]$/s,
      // Diamond (if): nodeId{"content"}
      /^(\w+)\{\"(.+?)\"\}$/s,
      // Hexagon (for/while): nodeId{{"content"}}
      /^(\w+)\{\{\"(.+?)\"\}\}$/s,
      // Circle (human): nodeId((("content")))
      /^(\w+)\(\(\(\"(.+?)\"\)\)\)$/s,
      // Rectangle (code/default): nodeId["content"]
      /^(\w+)\[\"(.+?)\"\]$/s,
    ];

    let matched = false;
    for (const pattern of nodePatterns) {
      const nodeMatch = line.match(pattern);
      if (nodeMatch) {
        const id = nodeMatch[1];
        const content = nodeMatch[2];
        const node = parseNodeContent(id, content);
        if (node) {
          nodes.push(node);
        }
        matched = true;
        break;
      }
    }

    // If no pattern matched, try a more lenient approach for malformed nodes
    if (!matched && line.includes('"')) {
      const lenientMatch = line.match(/^(\w+)[\[\(\{]+[\/\[]*\"(.+?)\"[\]\/\)\}]+$/s);
      if (lenientMatch) {
        const id = lenientMatch[1];
        const content = lenientMatch[2];
        const node = parseNodeContent(id, content);
        if (node) {
          nodes.push(node);
        }
      }
    }
  }

  return { nodes, edges };
}

/**
 * Parse node content (the label) into structured data
 */
function parseNodeContent(id: string, content: string): MermaidNode | null {
  // Unescape newlines
  const lines = content.split('\\n').map(l => l.trim()).filter(l => l && l !== SEPARATOR);
  
  if (lines.length === 0) return null;
  
  const header = lines[0];
  
  // Determine type from emoji
  let type: MermaidNodeType = 'code';
  for (const [emoji, nodeType] of Object.entries(EMOJI_TO_TYPE)) {
    if (header.includes(emoji)) {
      type = nodeType;
      break;
    }
  }
  
  const node: MermaidNode = {
    id,
    type,
    label: content,
    inputs: [],
    params: {},
    outputs: [],
  };

  // Parse body lines based on type
  for (const line of lines.slice(1)) {
    if (line.startsWith('📥')) {
      // Input reference
      const input = decodeMermaidEscapes(line.replace('📥', '').trim());
      node.inputs.push(input);
    } else if (line.startsWith('⚙️')) {
      // Parameter
      const paramMatch = line.replace('⚙️', '').trim().match(/^(\w+):\s*(.+)$/);
      if (paramMatch) {
        node.params[paramMatch[1]] = parseValue(paramMatch[2]);
      }
    } else if (line.startsWith('💻')) {
      // Code
      node.code = (node.code || '') + decodeMermaidEscapes(line.replace('💻', '').trim()) + '\n';
    } else if (line.startsWith('📝')) {
      // Prompt
      node.prompt = decodeMermaidEscapes(line.replace('📝', '').trim());
    } else if (line.startsWith('📤')) {
      // Output - may contain variable references
      const outputStr = decodeMermaidEscapes(line.replace('📤', '').trim());
      // For return nodes, parse as key: value pairs
      if (type === 'return') {
        const match = outputStr.match(/^(\w+):\s*(.+)$/);
        if (match) {
          node.outputs!.push({ key: match[1], value: match[2] });
        }
      } else {
        // For other nodes, just store the output variable name
        node.output = outputStr;
      }
    } else if (line.startsWith('🔌')) {
      // Tool reference (for tool nodes)
      node.params['_tool'] = line.replace('🔌', '').trim();
    } else if (line.startsWith('🔄')) {
      // For loop expression
      node.condition = decodeMermaidEscapes(line.replace('🔄', '').trim());
    } else if (line.startsWith('⏰')) {
      // Cron schedule
      node.params['schedule'] = line.replace('⏰', '').trim();
    } else if (line.startsWith('🌍')) {
      // Timezone
      node.params['timezone'] = line.replace('🌍', '').trim();
    } else if (line.startsWith('📢')) {
      // Notify channels
      node.params['channels'] = line.replace('📢', '').trim().split(',').map(s => s.trim());
    } else if (line.startsWith('💬')) {
      // Message
      node.params['message'] = decodeMermaidEscapes(line.replace('💬', '').trim());
    } else if (line.startsWith('📋')) {
      // Human input type
      node.params['inputType'] = line.replace('📋', '').trim();
    } else if (line.startsWith('🤖')) {
      // Model
      node.params['model'] = line.replace('🤖', '').trim();
    }
  }
  
  // Clean up code
  if (node.code) {
    node.code = node.code.trim();
  }

  return node;
}

/**
 * Decode Mermaid-escaped special characters back to original
 * Curly braces are escaped as #123; and #125; to avoid Mermaid parsing issues
 */
function decodeMermaidEscapes(str: string): string {
  return str.replace(/#123;/g, '{').replace(/#125;/g, '}');
}

/**
 * Parse a value string into appropriate type
 */
function parseValue(valueStr: string): unknown {
  // First, decode escaped curly braces from Mermaid
  const trimmed = decodeMermaidEscapes(valueStr).trim();

  // Variable reference
  if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) {
    return trimmed;
  }

  // Quoted string
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Array (simple comma-separated)
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1).split(',').map(s => s.trim());
    }
  }

  // Object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

/**
 * Schedule configuration for workflow
 */
export interface ScheduleConfig {
  scheduleType: string;
  hour?: number;
  minute?: number;
  days?: number[];
  monthDays?: number[];
  weeklyFrequency?: number;
  cronExpression?: string;
}

/**
 * Convert parsed Mermaid back to WorkflowDefinition
 */
export function mermaidToWorkflow(
  parsed: ParsedMermaid,
  existingWorkflow?: Partial<WorkflowDefinition>,
  scheduleConfig?: ScheduleConfig
): WorkflowDefinition {
  const { nodes, edges } = parsed;

  // Find trigger node
  const triggerNode = nodes.find(n => n.type === 'trigger');

  // Determine trigger from schedule config or parsed node
  let trigger: TriggerConfig;
  if (scheduleConfig) {
    trigger = scheduleConfigToTrigger(scheduleConfig);
  } else if (triggerNode) {
    trigger = parseTriggerNode(triggerNode);
  } else {
    trigger = { type: 'manual' as const };
  }

  // Parse inputs from trigger node
  let inputs = existingWorkflow?.inputs;
  if (triggerNode && triggerNode.inputs && triggerNode.inputs.length > 0) {
    inputs = parseInputsFromTriggerNode(triggerNode);
  }

  // Build adjacency list for ordering
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, []);
    }
    adjacency.get(edge.from)!.push(edge.to);
  }

  // Order nodes by traversing from trigger
  const orderedSteps: Step[] = [];
  const visited = new Set<string>();

  function traverse(nodeId: string) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (node && node.type !== 'trigger' && node.type !== 'end') {
      const step = nodeToStep(node, edges);
      if (step) {
        orderedSteps.push(step);
      }
    }

    // Follow edges
    const nextNodes = adjacency.get(nodeId) || [];
    for (const nextId of nextNodes) {
      traverse(nextId);
    }
  }

  // Start from trigger
  if (triggerNode) {
    traverse(triggerNode.id);
  }

  const name = existingWorkflow?.name || 'Untitled Workflow';

  return {
    id: existingWorkflow?.id || normalizeNameToId(name),
    name,
    description: existingWorkflow?.description,
    version: existingWorkflow?.version || 1,
    trigger,
    inputs,
    steps: orderedSteps,
    constraints: existingWorkflow?.constraints,
    tools: existingWorkflow?.tools,
  };
}

/**
 * Parse inputs from trigger node
 * Format: "name*: type = default" or "name: type"
 */
function parseInputsFromTriggerNode(node: MermaidNode): WorkflowInput[] {
  const inputs: WorkflowInput[] = [];

  for (const inputStr of node.inputs) {
    // Parse format: "name*: type = default" or "name: type"
    const match = inputStr.match(/^(\w+)(\*)?:\s*(\w+)(?:\s*=\s*(.+))?$/);
    if (match) {
      const input: WorkflowInput = {
        name: match[1],
        type: match[3] as 'string' | 'number' | 'boolean' | 'object' | 'array',
        required: match[2] === '*',
      };
      if (match[4]) {
        input.default = parseValue(match[4]);
      }
      inputs.push(input);
    }
  }

  return inputs;
}

/**
 * Convert schedule config to TriggerConfig
 */
function scheduleConfigToTrigger(config: ScheduleConfig): TriggerConfig {
  const { scheduleType, hour = 9, minute = 0, days = [1], monthDays = [1], cronExpression } = config;

  switch (scheduleType) {
    case 'manual':
      return { type: 'manual' };

    case 'daily':
      return {
        type: 'cron',
        schedule: `${minute} ${hour} * * *`,
      };

    case 'weekly':
      return {
        type: 'cron',
        schedule: `${minute} ${hour} * * ${days.length > 0 ? days.join(',') : '1'}`,
      };

    case 'monthly':
      return {
        type: 'cron',
        schedule: `${minute} ${hour} ${monthDays.length > 0 ? monthDays.join(',') : '1'} * *`,
      };

    case 'cron':
      return {
        type: 'cron',
        schedule: cronExpression || '0 9 * * 1',
      };

    case 'webhook':
      return {
        type: 'webhook',
        webhook: {
          method: 'POST',
        },
      };

    default:
      return { type: 'manual' };
  }
}

/**
 * Parse trigger node to TriggerConfig
 */
function parseTriggerNode(node: MermaidNode): TriggerConfig {
  const schedule = node.params['schedule'] as string | undefined;
  const timezone = node.params['timezone'] as string | undefined;

  if (schedule) {
    return {
      type: 'cron',
      schedule,
      timezone,
    };
  }

  // Check label for type hints
  if (node.label.includes('webhook')) {
    return {
      type: 'webhook',
      webhook: {
        method: 'POST',
      },
    };
  }

  return { type: 'manual' };
}

/**
 * Convert a MermaidNode to a Step
 */
function nodeToStep(node: MermaidNode, edges: MermaidEdge[]): Step | null {
  switch (node.type) {
    case 'tool':
      return nodeToToolStep(node);
    case 'code':
      return nodeToCodeStep(node);
    case 'llm':
      return nodeToLLMStep(node);
    case 'if':
      return nodeToIfStep(node, edges);
    case 'for':
      return nodeToForStep(node, edges);
    case 'while':
      return nodeToWhileStep(node, edges);
    case 'human':
      return nodeToHumanStep(node);
    case 'notify':
      return nodeToNotifyStep(node);
    case 'return':
      return nodeToReturnStep(node);
    default:
      return null;
  }
}

function nodeToToolStep(node: MermaidNode): ToolCallStep {
  const tool = (node.params['_tool'] as string) || 'unknown.tool';
  const { _tool, ...params } = node.params;

  return {
    id: node.id,
    tool,
    params,
    output: node.output || 'result',
  };
}

function nodeToCodeStep(node: MermaidNode): CodeStep {
  return {
    id: node.id,
    code: node.code || '',
    output: node.output || 'result',
  };
}

function nodeToLLMStep(node: MermaidNode): LLMStep {
  return {
    id: node.id,
    llm: {
      model: node.params['model'] as string | undefined,
      prompt: node.prompt || '',
    },
    output: node.output || 'result',
  };
}

function nodeToIfStep(node: MermaidNode, edges: MermaidEdge[]): IfStep {
  // Find yes/no branches from edges
  const yesEdge = edges.find(e => e.from === node.id && e.label === 'yes');
  const noEdge = edges.find(e => e.from === node.id && e.label === 'no');

  return {
    id: node.id,
    if: node.code || node.condition || 'true',
    then: [], // Would need recursive parsing for nested steps
    else: noEdge ? [] : undefined,
  };
}

function nodeToForStep(node: MermaidNode, edges: MermaidEdge[]): ForStep {
  return {
    id: node.id,
    for: node.condition || 'item in items',
    do: [], // Would need recursive parsing
  };
}

function nodeToWhileStep(node: MermaidNode, edges: MermaidEdge[]): WhileStep {
  return {
    id: node.id,
    while: node.code || node.condition || 'true',
    do: [], // Would need recursive parsing
    maxIterations: node.params['maxIterations'] as number | undefined,
  };
}

function nodeToHumanStep(node: MermaidNode): HumanInLoopStep {
  return {
    id: node.id,
    human: {
      message: (node.params['message'] as string) || 'Please provide input',
      type: (node.params['inputType'] as 'confirm' | 'text' | 'choice') || 'confirm',
    },
    output: node.output || 'humanInput',
  };
}

function nodeToNotifyStep(node: MermaidNode): NotifyStep {
  return {
    id: node.id,
    notify: {
      channels: (node.params['channels'] as ('email' | 'slack' | 'push' | 'ui')[]) || ['ui'],
      message: (node.params['message'] as string) || '',
    },
  };
}

function nodeToReturnStep(node: MermaidNode): ReturnStep {
  // Build return object from outputs array
  if (node.outputs && node.outputs.length > 0) {
    const returnObj: Record<string, unknown> = {};
    for (const { key, value } of node.outputs) {
      returnObj[key] = value;
    }
    return {
      id: node.id,
      return: returnObj,
    };
  }

  // Fallback to single output
  return {
    id: node.id,
    return: node.output || {},
  };
}

/**
 * Generate human-readable description of a cron expression
 */
function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return '';

  const [minute, hour, day, month, weekday] = parts;
  const descriptions: string[] = [];

  // Time
  if (hour !== '*' && minute !== '*') {
    const h = parseInt(hour);
    const m = parseInt(minute);
    const timeStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    descriptions.push(`at ${timeStr}`);
  }

  // Days of week
  if (weekday !== '*') {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days = weekday.split(',').map(d => {
      if (d.includes('-')) {
        const [start, end] = d.split('-').map(Number);
        return `${dayNames[start]}-${dayNames[end]}`;
      }
      return dayNames[parseInt(d)] || d;
    });
    descriptions.push(`on ${days.join(', ')}`);
  }

  // Days of month
  if (day !== '*') {
    const days = day.split(',');
    if (days.length <= 3) {
      descriptions.push(`on day ${days.join(', ')}`);
    } else {
      descriptions.push(`on ${days.length} days of the month`);
    }
  }

  // Month
  if (month !== '*') {
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const months = month.split(',').map(m => monthNames[parseInt(m)] || m);
    descriptions.push(`in ${months.join(', ')}`);
  }

  return descriptions.length > 0 ? `Runs ${descriptions.join(' ')}` : '';
}

/**
 * Serialize WorkflowDefinition to YAML string
 */
export function workflowToYamlString(workflow: WorkflowDefinition): string {
  const lines: string[] = [];

  // Auto-generate id from name if not provided
  const id = workflow.id || normalizeNameToId(workflow.name);

  lines.push(`id: ${id}`);
  lines.push(`name: "${workflow.name}"`);
  if (workflow.description) {
    lines.push(`description: "${workflow.description}"`);
  }
  if (workflow.version) {
    lines.push(`version: ${workflow.version}`);
  }

  lines.push('');
  lines.push('trigger:');
  lines.push(`  type: ${workflow.trigger.type}`);
  if (workflow.trigger.type === 'cron') {
    lines.push(`  schedule: "${workflow.trigger.schedule}"`);
    if (workflow.trigger.timezone) {
      lines.push(`  timezone: "${workflow.trigger.timezone}"`);
    }
    // Add human-readable description of the cron
    const cronDesc = describeCron(workflow.trigger.schedule || '');
    if (cronDesc) {
      lines.push(`  # ${cronDesc}`);
    }
  } else if (workflow.trigger.type === 'webhook') {
    lines.push(`  method: ${workflow.trigger.webhook?.method || 'POST'}`);
  }

  if (workflow.inputs && workflow.inputs.length > 0) {
    lines.push('');
    lines.push('inputs:');
    for (const input of workflow.inputs) {
      lines.push(`  - name: ${input.name}`);
      lines.push(`    type: ${input.type}`);
      if (input.required !== undefined) {
        lines.push(`    required: ${input.required}`);
      }
      if (input.description) {
        lines.push(`    description: "${input.description}"`);
      }
    }
  }

  lines.push('');
  lines.push('steps:');
  for (const step of workflow.steps) {
    lines.push(...stepToYamlLines(step, 2));
  }

  if (workflow.constraints) {
    lines.push('');
    lines.push('constraints:');
    if (workflow.constraints.maxToolCalls) {
      lines.push(`  maxToolCalls: ${workflow.constraints.maxToolCalls}`);
    }
    if (workflow.constraints.timeout) {
      lines.push(`  timeout: "${workflow.constraints.timeout}"`);
    }
  }

  return lines.join('\n');
}

function stepToYamlLines(step: Step, indent: number): string[] {
  const prefix = ' '.repeat(indent);
  const lines: string[] = [];

  lines.push(`${prefix}- id: ${step.id}`);

  if ('tool' in step) {
    const toolStep = step as ToolCallStep;
    lines.push(`${prefix}  tool: ${toolStep.tool}`);
    lines.push(`${prefix}  params:`);
    for (const [key, value] of Object.entries(toolStep.params)) {
      lines.push(`${prefix}    ${key}: ${formatYamlValue(value)}`);
    }
    lines.push(`${prefix}  output: ${toolStep.output}`);
  } else if ('code' in step && !('if' in step) && !('while' in step)) {
    const codeStep = step as CodeStep;
    lines.push(`${prefix}  code: |`);
    for (const codeLine of codeStep.code.split('\n')) {
      lines.push(`${prefix}    ${codeLine}`);
    }
    lines.push(`${prefix}  output: ${codeStep.output}`);
  } else if ('llm' in step) {
    const llmStep = step as LLMStep;
    lines.push(`${prefix}  llm:`);
    if (llmStep.llm.model) {
      lines.push(`${prefix}    model: ${llmStep.llm.model}`);
    }
    if (llmStep.llm.system) {
      lines.push(`${prefix}    system: "${llmStep.llm.system}"`);
    }
    lines.push(`${prefix}    prompt: "${llmStep.llm.prompt}"`);
    lines.push(`${prefix}  output: ${llmStep.output}`);
  } else if ('if' in step) {
    const ifStep = step as IfStep;
    lines.push(`${prefix}  if: ${ifStep.if}`);
    lines.push(`${prefix}  then:`);
    for (const thenStep of ifStep.then) {
      lines.push(...stepToYamlLines(thenStep, indent + 4));
    }
    if (ifStep.else && ifStep.else.length > 0) {
      lines.push(`${prefix}  else:`);
      for (const elseStep of ifStep.else) {
        lines.push(...stepToYamlLines(elseStep, indent + 4));
      }
    }
  } else if ('for' in step) {
    const forStep = step as ForStep;
    lines.push(`${prefix}  for: ${forStep.for}`);
    lines.push(`${prefix}  do:`);
    for (const doStep of forStep.do) {
      lines.push(...stepToYamlLines(doStep, indent + 4));
    }
  } else if ('while' in step) {
    const whileStep = step as WhileStep;
    lines.push(`${prefix}  while: ${whileStep.while}`);
    if (whileStep.maxIterations) {
      lines.push(`${prefix}  maxIterations: ${whileStep.maxIterations}`);
    }
    lines.push(`${prefix}  do:`);
    for (const doStep of whileStep.do) {
      lines.push(...stepToYamlLines(doStep, indent + 4));
    }
  } else if ('human' in step) {
    const humanStep = step as HumanInLoopStep;
    lines.push(`${prefix}  human:`);
    lines.push(`${prefix}    message: "${humanStep.human.message}"`);
    lines.push(`${prefix}    type: ${humanStep.human.type}`);
    if (humanStep.human.choices) {
      lines.push(`${prefix}    choices: [${humanStep.human.choices.map(c => `"${c}"`).join(', ')}]`);
    }
    lines.push(`${prefix}  output: ${humanStep.output}`);
  } else if ('notify' in step) {
    const notifyStep = step as NotifyStep;
    lines.push(`${prefix}  notify:`);
    lines.push(`${prefix}    channels: [${notifyStep.notify.channels.join(', ')}]`);
    lines.push(`${prefix}    message: "${notifyStep.notify.message}"`);
  } else if ('return' in step) {
    const returnStep = step as ReturnStep;
    lines.push(`${prefix}  return: ${formatYamlValue(returnStep.return)}`);
  }

  return lines;
}

function formatYamlValue(value: unknown): string {
  if (typeof value === 'string') {
    if (value.startsWith('{{') && value.endsWith('}}')) {
      return value;
    }
    return `"${value}"`;
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

