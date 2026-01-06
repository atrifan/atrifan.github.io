/**
 * Supabase Database Types
 *
 * DTOs for Supabase tables related to MCP connections tracking.
 * These types define the schema for:
 * - api_keys: Stores API keys linked to users
 * - mcp_connections: Stores connection logs per api_key + server_name
 * - user_preferences: Stores user preferences (time format, units, currency)
 */

import type { TimeFormat, MeasurementSystem, Currency } from './preferences';

// ============ API Keys Table ============

/**
 * API Key record in Supabase
 * Table: api_keys
 *
 * Primary key: id (uuid)
 * Unique constraint: api_key_hash (for lookups without storing plaintext)
 */
export interface ApiKeyRow {
  /** UUID primary key */
  id: string;
  /** Clerk user ID (foreign reference) */
  user_id: string;
  /** Hash of the API key (for secure lookups) */
  api_key_hash: string;
  /** Last 4 characters of API key (for display) */
  api_key_suffix: string;
  /** Optional friendly name for the API key */
  name: string | null;
  /** Server name this key is for ('default' for default server) */
  server_name: string;
  /** API key provider: 'clerk' or 'custom' */
  provider: 'clerk' | 'custom';
  /** User's plan at time of key creation */
  plan: 'free' | 'pro' | 'plus';
  /** Whether the key is active */
  is_active: boolean;
  /** When the key was created */
  created_at: string;
  /** When the key was last used */
  last_used_at: string | null;
  /** When the key was revoked (null if active) */
  revoked_at: string | null;
}

/**
 * Insert DTO for api_keys table
 */
export interface ApiKeyInsert {
  user_id: string;
  api_key_hash: string;
  api_key_suffix: string;
  name?: string;
  server_name?: string;
  provider: 'clerk' | 'custom';
  plan: 'free' | 'pro' | 'plus';
  is_active?: boolean;
}

/**
 * Update DTO for api_keys table
 */
export interface ApiKeyUpdate {
  name?: string;
  is_active?: boolean;
  last_used_at?: string;
  revoked_at?: string;
}

// ============ User Preferences Table ============

/**
 * User Preferences record in Supabase
 * Table: user_preferences
 *
 * Primary key: user_id (Clerk user ID)
 * One row per user storing their preferences.
 */
export interface UserPreferencesRow {
  /** Clerk user ID (primary key) */
  user_id: string;
  /** Time format: 12-hour or 24-hour */
  time_format: TimeFormat;
  /** Measurement system: metric or imperial */
  measurement_system: MeasurementSystem;
  /** Preferred currency */
  currency: Currency;
  /** When preferences were created */
  created_at: string;
  /** When preferences were last updated */
  updated_at: string;
}

/**
 * Insert DTO for user_preferences table
 */
export interface UserPreferencesInsert {
  user_id: string;
  time_format?: TimeFormat;
  measurement_system?: MeasurementSystem;
  currency?: Currency;
}

/**
 * Update DTO for user_preferences table
 */
export interface UserPreferencesUpdate {
  time_format?: TimeFormat;
  measurement_system?: MeasurementSystem;
  currency?: Currency;
  updated_at?: string;
}

// ============ MCP Connections Table ============

/**
 * MCP Connection record in Supabase
 * Table: mcp_connections
 * 
 * Primary key: id (uuid)
 * Composite unique constraint: (api_key_id, server_name, agent, auth_method)
 * This ensures one entry per agent:method combination per server per API key
 */
export interface McpConnectionRow {
  /** UUID primary key */
  id: string;
  /** Foreign key to api_keys.id */
  api_key_id: string;
  /** Server name ('default' for default server) */
  server_name: string;
  /** User agent string */
  agent: string;
  /** Authentication method used */
  auth_method: 'oauth' | 'header' | 'path' | 'internal';
  /** Array of up to 5 IPs that used this agent:method */
  ips: string[];
  /** When this connection was first seen */
  created_at: string;
  /** When this connection was last used */
  last_used_at: string;
  /** Total number of requests from this agent:method */
  request_count: number;
}

/**
 * Insert DTO for mcp_connections table
 */
export interface McpConnectionInsert {
  api_key_id: string;
  server_name: string;
  agent: string;
  auth_method: 'oauth' | 'header' | 'path' | 'internal';
  ips?: string[];
  request_count?: number;
}

/**
 * Update DTO for mcp_connections table
 */
export interface McpConnectionUpdate {
  ips?: string[];
  last_used_at?: string;
  request_count?: number;
}

// ============ Tools Table ============

/** Tool categories - matches TOOL_CATEGORIES in tools-definitions.ts */
export type ToolCategory = 'Health & Fitness' | 'Finance' | 'Date & Time' | 'Fun & Games' | 'Utilities' | 'Astronomy';

/** Tool types - matches TOOL_TYPES in tools-definitions.ts */
export type ToolType = 'NATIVE' | 'MCP' | 'REST' | 'GQL' | 'A2A';

/**
 * Tool definition record in Supabase
 * Table: tools
 *
 * Stores reusable tool definitions that can be linked to multiple servers.
 * NATIVE tools are system-defined, others can be user-created.
 */
export interface ToolRow {
  /** UUID primary key */
  id: string;
  /** Tool name (unique identifier, e.g., "calculate_tip") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Tool category */
  category: ToolCategory;
  /** Tool type: NATIVE, MCP, REST, GQL, A2A */
  tool_type: ToolType;
  /** Whether the tool has a widget renderer */
  has_widget: boolean;
  /** Message shown while tool is executing */
  invoking_message: string;
  /** Message shown after tool completes */
  invoked_message: string;
  /** Input schema (JSON Schema) */
  input_schema: Record<string, unknown>;
  /** Output schema (JSON Schema) */
  output_schema: Record<string, unknown>;
  /** User ID (null for system NATIVE tools) */
  user_id: string | null;
  /** When the tool was created */
  created_at: string;
  /** When the tool was last updated */
  updated_at: string;
}

/**
 * Insert DTO for tools table
 */
export interface ToolInsert {
  name: string;
  description: string;
  category: ToolCategory;
  tool_type: ToolType;
  has_widget?: boolean;
  invoking_message?: string;
  invoked_message?: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  user_id?: string;
}

/**
 * Update DTO for tools table
 */
export interface ToolUpdate {
  description?: string;
  category?: ToolCategory;
  tool_type?: ToolType;
  has_widget?: boolean;
  invoking_message?: string;
  invoked_message?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  updated_at?: string;
}

// ============ Environments Table ============

/**
 * Environment record in Supabase
 * Table: environments
 *
 * Environments define external hosts for non-NATIVE tools.
 * Each environment has a name, host URL, and optional custom config.
 */
export interface EnvironmentRow {
  /** UUID primary key */
  id: string;
  /** Clerk user ID (owner) */
  user_id: string;
  /** Environment name (e.g., "Production", "Staging") */
  name: string;
  /** Host URL (e.g., "https://api.example.com") */
  host: string;
  /** Custom configuration (JSON) - auth headers, timeouts, etc. */
  custom_config: Record<string, unknown> | null;
  /** When the environment was created */
  created_at: string;
  /** When the environment was last updated */
  updated_at: string;
}

/**
 * Insert DTO for environments table
 */
export interface EnvironmentInsert {
  user_id: string;
  name: string;
  host: string;
  custom_config?: Record<string, unknown>;
}

/**
 * Update DTO for environments table
 */
export interface EnvironmentUpdate {
  name?: string;
  host?: string;
  custom_config?: Record<string, unknown>;
  updated_at?: string;
}

// ============ Server Tools Table ============

/**
 * Server Tool record in Supabase
 * Table: server_tools
 *
 * Links tools to API keys (servers) with their configuration.
 * References the tools table for tool definition.
 * Non-NATIVE tools may have environment and custom_config overrides.
 */
export interface ServerToolRow {
  /** UUID primary key */
  id: string;
  /** Foreign key to api_keys.id (the server this tool belongs to) */
  api_key_id: string;
  /** Foreign key to tools.id (the tool definition) */
  tool_id: string;
  /** Foreign key to environments.id (null for NATIVE tools) */
  environment_id: string | null;
  /** Custom configuration override for this tool instance (JSON) */
  custom_config: Record<string, unknown> | null;
  /** Whether the tool is enabled for this server */
  is_enabled: boolean;
  /** When the tool was added to this server */
  created_at: string;
  /** When the tool config was last updated */
  updated_at: string;
}

/**
 * Insert DTO for server_tools table
 */
export interface ServerToolInsert {
  api_key_id: string;
  tool_id: string;
  environment_id?: string;
  custom_config?: Record<string, unknown>;
  is_enabled?: boolean;
}

/**
 * Update DTO for server_tools table
 */
export interface ServerToolUpdate {
  environment_id?: string | null;
  custom_config?: Record<string, unknown>;
  is_enabled?: boolean;
  updated_at?: string;
}

// ============ Supabase Database Schema ============

/**
 * Full database schema type for Supabase client
 */
export interface Database {
  public: {
    Tables: {
      api_keys: {
        Row: ApiKeyRow;
        Insert: ApiKeyInsert;
        Update: ApiKeyUpdate;
      };
      mcp_connections: {
        Row: McpConnectionRow;
        Insert: McpConnectionInsert;
        Update: McpConnectionUpdate;
      };
      user_preferences: {
        Row: UserPreferencesRow;
        Insert: UserPreferencesInsert;
        Update: UserPreferencesUpdate;
      };
      tools: {
        Row: ToolRow;
        Insert: ToolInsert;
        Update: ToolUpdate;
      };
      environments: {
        Row: EnvironmentRow;
        Insert: EnvironmentInsert;
        Update: EnvironmentUpdate;
      };
      server_tools: {
        Row: ServerToolRow;
        Insert: ServerToolInsert;
        Update: ServerToolUpdate;
      };
    };
  };
}

// ============ Helper Types ============

/**
 * Connection with API key info (for dashboard display)
 */
export interface McpConnectionWithApiKey extends McpConnectionRow {
  api_key: Pick<ApiKeyRow, 'api_key_suffix' | 'name' | 'server_name' | 'plan'>;
}

/**
 * Grouped connections by server for dashboard
 */
export interface ConnectionsByServer {
  server_name: string;
  connections: McpConnectionRow[];
  total_requests: number;
  last_activity: string;
}

/**
 * Server tool with full tool definition and environment (for display)
 */
export interface ServerToolWithDetails extends ServerToolRow {
  tool: ToolRow;
  environment: Pick<EnvironmentRow, 'name' | 'host'> | null;
}

/**
 * Full server configuration (API key with its tools)
 */
export interface ServerWithTools extends ApiKeyRow {
  server_tools: ServerToolWithDetails[];
}

