/**
 * Automation Workflow Library
 * 
 * This module provides tools for creating, parsing, and executing
 * automation workflows defined in YAML format.
 */

// Types
export * from './types';

// YAML to Mermaid conversion
export { workflowToMermaid } from './yaml-to-mermaid';

// Mermaid to YAML parsing
export {
  parseMermaid,
  mermaidToWorkflow,
  workflowToYamlString
} from './mermaid-to-yaml';

// Workflow executor
export {
  executeWorkflow,
  type ToolExecutor,
  type LLMExecutor,
  type HumanInputHandler,
  type NotificationHandler,
  type ExecutorOptions,
} from './executor';

