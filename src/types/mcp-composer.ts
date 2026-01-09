/**
 * MCP Creator Types
 * Types for custom MCP server creation
 */

export type ToolType = 'NATIVE' | 'MCP' | 'REST' | 'GQL' | 'A2A';

export interface ToolSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface MCPTool {
  name: string;
  description: string;
  category: string;
  toolType?: ToolType;
  hasWidget: boolean;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
  /** Source URL for imported tools (REST, MCP, GQL, A2A) - used for favicon */
  sourceUrl?: string;
  /** Icon URL for A2A agents */
  iconUrl?: string;
}

export interface CustomMCPServer {
  id: string;
  name: string;
  /** Array of tool names included in this server */
  tools: string[];
  /** When the server was created */
  createdAt: string;
  /** When the server was last updated */
  updatedAt: string;
}

/**
 * Configuration for the default MCP server
 * Stores which tools are disabled (all tools enabled by default)
 */
export interface DefaultServerConfig {
  /** Array of tool names that are disabled */
  disabledTools: string[];
  /** When the config was last updated */
  updatedAt: string;
}

/**
 * State for the MCP composer page
 */
export interface MCPComposerState {
  /** Name of the custom MCP server */
  serverName: string;
  /** Selected tool names */
  selectedTools: string[];
  /** Search query for filtering tools */
  searchQuery: string;
  /** Selected category filter */
  selectedCategory: string;
}

/**
 * Modal types for save confirmation
 */
export type SaveModalType = 'success' | 'warning' | 'danger' | null;

/**
 * Props for the tool count warning icon
 */
export interface ToolCountWarningProps {
  count: number;
  showTooltip?: boolean;
}

