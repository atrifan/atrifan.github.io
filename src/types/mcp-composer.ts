/**
 * MCP Composer Types
 * Types for custom MCP server composition
 */

export interface MCPTool {
  name: string;
  description: string;
  category: string;
  hasWidget: boolean;
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

