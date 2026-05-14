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
  /** Plaintext API key (for internal use - automation, tool execution) */
  api_key: string | null;
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
  /** Device name this key is associated with */
  device_name: string;
}

/**
 * Insert DTO for api_keys table
 */
export interface ApiKeyInsert {
  user_id: string;
  api_key_hash: string;
  api_key_suffix: string;
  api_key?: string; // Plaintext key for internal use
  name?: string;
  server_name?: string;
  device_name?: string;
  provider: 'clerk' | 'custom';
  plan: 'free' | 'pro' | 'plus';
  is_active?: boolean;
}

/**
 * Update DTO for api_keys table
 */
export interface ApiKeyUpdate {
  name?: string;
  device_name?: string;
  is_active?: boolean;
  last_used_at?: string;
  revoked_at?: string;
}

// ============ Device Heartbeats Table ============

export interface DeviceHeartbeatRow {
  id: string;
  api_key_id: string;
  user_id: string;
  device_name: string;
  hostname: string | null;
  platform: string | null;
  arch: string | null;
  model: string | null;
  extension_id: string | null;
  tokens_today_input: number;
  tokens_today_output: number;
  schedules_count: number;
  active_tasks_count: number;
  skills_loaded: number;
  mcp_servers_connected: number;
  ip_address: string | null;
  updated_at: string;
  created_at: string;
}

export interface DeviceHeartbeatInsert {
  api_key_id: string;
  user_id: string;
  device_name: string;
  hostname?: string;
  platform?: string;
  arch?: string;
  model?: string;
  extension_id?: string;
  tokens_today_input?: number;
  tokens_today_output?: number;
  schedules_count?: number;
  active_tasks_count?: number;
  skills_loaded?: number;
  mcp_servers_connected?: number;
  ip_address?: string;
}

export interface DeviceHeartbeatUpdate {
  hostname?: string;
  platform?: string;
  arch?: string;
  model?: string;
  extension_id?: string;
  tokens_today_input?: number;
  tokens_today_output?: number;
  schedules_count?: number;
  active_tasks_count?: number;
  skills_loaded?: number;
  mcp_servers_connected?: number;
  ip_address?: string;
  updated_at?: string;
}

// ============ User Preferences Table ============

/**
 * User Preferences record in Supabase
 * Table: user_preferences
 *
 * Primary key: user_id (Clerk user ID)
 * One row per user storing their preferences.
 */
/**
 * Chat/Automation context-specific settings
 */
export interface ContextSettings {
  /** Enable reasoning/thinking mode */
  enableReasoning?: boolean;
  /** Send chat history to AI */
  sendHistory?: boolean;
  /** Enable history memory (semantic search) */
  historyMemoryEnabled?: boolean;
  /** Default model ID */
  defaultModel?: string;
}

export interface UserPreferencesRow {
  /** Clerk user ID (primary key) */
  user_id: string;
  /** Time format: 12-hour or 24-hour */
  time_format: TimeFormat;
  /** Measurement system: metric or imperial */
  measurement_system: MeasurementSystem;
  /** Preferred currency */
  currency: Currency;
  /** Chat page settings */
  chat_settings?: ContextSettings;
  /** Automation page settings */
  automation_settings?: ContextSettings;
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
  chat_settings?: ContextSettings;
  automation_settings?: ContextSettings;
}

/**
 * Update DTO for user_preferences table
 */
export interface UserPreferencesUpdate {
  time_format?: TimeFormat;
  measurement_system?: MeasurementSystem;
  currency?: Currency;
  chat_settings?: ContextSettings;
  automation_settings?: ContextSettings;
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
export type ToolType = 'NATIVE' | 'MCP' | 'REST' | 'GQL' | 'A2A' | 'RAG';

/**
 * Tool definition record in Supabase
 * Table: tools
 *
 * Stores reusable tool definitions that can be linked to multiple servers.
 * NATIVE tools are system-defined, others can be user-created.
 */
/** MCP Tool Annotations (per MCP spec) */
export interface ToolAnnotations {
  /** If true, the tool does not modify state (GET, query) */
  readOnlyHint?: boolean;
  /** If true, the tool may perform destructive operations (DELETE, PUT, PATCH) */
  destructiveHint?: boolean;
  /** If true, the tool may have side effects beyond its primary function */
  idempotentHint?: boolean;
  /** If true, the tool interacts with external entities */
  openWorldHint?: boolean;
}

export interface ToolRow {
  /** UUID primary key */
  id: string;
  /** Tool name (unique identifier, e.g., "calculate_tip") */
  name: string;
  /** Human-readable description */
  description: string;
  /** Primary tool category (backward compatibility) */
  category: ToolCategory;
  /** All categories this tool belongs to */
  categories: string[];
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
  /** MCP tool annotations (readOnlyHint, destructiveHint, etc.) */
  annotations: ToolAnnotations | null;
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
  categories?: string[];
  tool_type: ToolType;
  has_widget?: boolean;
  invoking_message?: string;
  invoked_message?: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  annotations?: ToolAnnotations;
  user_id?: string;
}

/**
 * Update DTO for tools table
 */
export interface ToolUpdate {
  name?: string;
  description?: string;
  category?: ToolCategory;
  categories?: string[];
  tool_type?: ToolType;
  has_widget?: boolean;
  invoking_message?: string;
  invoked_message?: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
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
  /** Clerk user ID who owns this server-tool link */
  user_id: string;
  /** Server name (matches api_keys.server_name) */
  server_name: string;
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
  user_id: string;
  server_name: string;
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

// ============ REST API Specs Table ============

/** Authorization types for REST APIs */
export type RestAuthType = 'none' | 'bearer' | 'api_key' | 'basic' | 'custom' | 'oauth2';

/** OAuth2 configuration stored in auth_config JSONB */
export interface OAuth2AuthConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  scopes: string;
  use_dcr: boolean;
  client_id: string;
  client_secret: string;
  registration_endpoint: string;
}

/** Spec format */
export type SpecFormat = 'json' | 'yaml';

/**
 * REST API Spec record in Supabase
 * Table: rest_api_specs
 *
 * Stores OpenAPI/Swagger specifications for REST API tool groups.
 */
export interface RestApiSpecRow {
  /** UUID primary key */
  id: string;
  /** Clerk user ID (owner) */
  user_id: string;
  /** User-defined server/API name */
  server_name: string;
  /** Base URL for API calls (e.g., https://httpbin.org) */
  host: string;
  /** Original swagger spec as JSON */
  swagger_spec: Record<string, unknown>;
  /** Original format: json or yaml */
  spec_format: SpecFormat;
  /** OpenAPI version (e.g., '3.0.0', '2.0') */
  openapi_version: string | null;
  /** API title from spec */
  api_title: string | null;
  /** API description from spec */
  api_description: string | null;
  /** API version from spec */
  api_version: string | null;
  /** Default headers for all requests */
  default_headers: Record<string, string>;
  /** Authorization type */
  auth_type: RestAuthType | null;
  /** Authorization config */
  auth_config: Record<string, unknown>;
  /** Source URL for URL-based imports */
  source_url: string | null;
  /** Raw spec text (before parsing) */
  raw_spec: string | null;
  /** Import method: paste or url */
  import_method: 'paste' | 'url' | null;
  /** Favicon URL fetched from source */
  favicon_url: string | null;
  /** When the spec was created */
  created_at: string;
  /** When the spec was last updated */
  updated_at: string;
}

/**
 * Insert DTO for rest_api_specs table
 */
export interface RestApiSpecInsert {
  user_id: string;
  server_name: string;
  host: string;
  swagger_spec: Record<string, unknown>;
  spec_format?: SpecFormat;
  openapi_version?: string;
  api_title?: string;
  api_description?: string;
  api_version?: string;
  default_headers?: Record<string, string>;
  auth_type?: RestAuthType;
  auth_config?: Record<string, unknown>;
  source_url?: string;
  raw_spec?: string;
  import_method?: 'paste' | 'url';
  favicon_url?: string;
}

/**
 * Update DTO for rest_api_specs table
 */
export interface RestApiSpecUpdate {
  server_name?: string;
  host?: string;
  swagger_spec?: Record<string, unknown>;
  default_headers?: Record<string, string>;
  auth_type?: RestAuthType;
  auth_config?: Record<string, unknown>;
  updated_at?: string;
}

// ============ REST API Endpoints Table ============

/** HTTP methods for REST endpoints */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Query parameter definition */
export interface QueryParamDef {
  name: string;
  required: boolean;
  type: string;
  description?: string;
}

/**
 * REST API Endpoint record in Supabase
 * Table: rest_api_endpoints
 *
 * Individual endpoints extracted from swagger specs.
 */
export interface RestApiEndpointRow {
  /** UUID primary key */
  id: string;
  /** Foreign key to rest_api_specs.id */
  spec_id: string;
  /** Foreign key to tools.id */
  tool_id: string;
  /** Operation ID from swagger */
  operation_id: string;
  /** HTTP method */
  http_method: HttpMethod;
  /** URL path (e.g., /users/{id}) */
  path: string;
  /** Headers specific to this endpoint */
  headers: Record<string, string>;
  /** Request content type */
  request_content_type: string;
  /** Response content type */
  response_content_type: string;
  /** Path parameter names */
  path_params: string[];
  /** Query parameter definitions */
  query_params: QueryParamDef[];
  /** Header parameter names */
  header_params: string[];
  /** When the endpoint was created */
  created_at: string;
  /** When the endpoint was last updated */
  updated_at: string;
}

/**
 * Insert DTO for rest_api_endpoints table
 */
export interface RestApiEndpointInsert {
  spec_id: string;
  tool_id: string;
  operation_id: string;
  http_method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  request_content_type?: string;
  response_content_type?: string;
  path_params?: string[];
  query_params?: QueryParamDef[];
  header_params?: string[];
}

/**
 * Update DTO for rest_api_endpoints table
 */
export interface RestApiEndpointUpdate {
  headers?: Record<string, string>;
  request_content_type?: string;
  response_content_type?: string;
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
      rest_api_specs: {
        Row: RestApiSpecRow;
        Insert: RestApiSpecInsert;
        Update: RestApiSpecUpdate;
      };
      rest_api_endpoints: {
        Row: RestApiEndpointRow;
        Insert: RestApiEndpointInsert;
        Update: RestApiEndpointUpdate;
      };
      graphql_specs: {
        Row: GraphQLSpecRow;
        Insert: GraphQLSpecInsert;
        Update: GraphQLSpecUpdate;
      };
      graphql_operations: {
        Row: GraphQLOperationRow;
        Insert: GraphQLOperationInsert;
        Update: GraphQLOperationUpdate;
      };
      graphql_environments: {
        Row: GraphQLEnvironmentRow;
        Insert: GraphQLEnvironmentInsert;
        Update: never;
      };
      mcp_servers: {
        Row: MCPServerRow;
        Insert: MCPServerInsert;
        Update: MCPServerUpdate;
      };
      mcp_server_tools: {
        Row: MCPServerToolRow;
        Insert: MCPServerToolInsert;
        Update: MCPServerToolUpdate;
      };
      a2a_agents: {
        Row: A2AAgentRow;
        Insert: A2AAgentInsert;
        Update: A2AAgentUpdate;
      };
      device_heartbeats: {
        Row: DeviceHeartbeatRow;
        Insert: DeviceHeartbeatInsert;
        Update: DeviceHeartbeatUpdate;
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

/**
 * REST API spec with endpoints (for display)
 */
export interface RestApiSpecWithEndpoints extends RestApiSpecRow {
  endpoints: RestApiEndpointWithTool[];
}

/**
 * REST API endpoint with tool details (for display)
 */
export interface RestApiEndpointWithTool extends RestApiEndpointRow {
  tool: ToolRow;
}

// ============ GraphQL Specs Table ============

/** GraphQL operation types */
export type GraphQLOperationType = 'query' | 'mutation' | 'subscription';

/** GraphQL argument definition */
export interface GraphQLArgumentDef {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
}

/**
 * GraphQL Spec record in Supabase
 * Table: graphql_specs
 */
export interface GraphQLSpecRow {
  /** UUID primary key */
  id: string;
  /** Clerk user ID (owner) */
  user_id: string;
  /** User-defined server/API name */
  server_name: string;
  /** Base URL for GraphQL endpoint */
  host: string;
  /** GraphQL introspection result as JSON */
  schema_json: Record<string, unknown>;
  /** Raw SDL if available */
  schema_sdl: string | null;
  /** API title */
  api_title: string | null;
  /** API description */
  api_description: string | null;
  /** Source URL (GraphQL endpoint) - kept for backwards compat */
  source_url: string;
  /** Default headers for all requests */
  default_headers: Record<string, string>;
  /** Authorization type */
  auth_type: RestAuthType;
  /** Authorization configuration */
  auth_config: Record<string, unknown>;
  /** When the spec was created */
  created_at: string;
  /** When the spec was last updated */
  updated_at: string;
}

/**
 * Insert DTO for graphql_specs table
 */
export interface GraphQLSpecInsert {
  user_id: string;
  server_name: string;
  host: string;
  schema_json: Record<string, unknown>;
  schema_sdl?: string;
  api_title?: string;
  api_description?: string;
  source_url: string;
  default_headers?: Record<string, string>;
  auth_type?: RestAuthType;
  auth_config?: Record<string, unknown>;
}

/**
 * Update DTO for graphql_specs table
 */
export interface GraphQLSpecUpdate {
  server_name?: string;
  host?: string;
  api_title?: string;
  api_description?: string;
  default_headers?: Record<string, string>;
  auth_type?: RestAuthType;
  auth_config?: Record<string, unknown>;
  updated_at?: string;
}

// ============ GraphQL Operations Table ============

/**
 * GraphQL Operation record in Supabase
 * Table: graphql_operations
 */
export interface GraphQLOperationRow {
  /** UUID primary key */
  id: string;
  /** Foreign key to graphql_specs.id */
  spec_id: string;
  /** Foreign key to tools.id */
  tool_id: string;
  /** Operation name */
  operation_name: string;
  /** Operation type: query, mutation, subscription */
  operation_type: GraphQLOperationType;
  /** The GraphQL operation string */
  operation_string: string;
  /** Arguments extracted from schema */
  arguments: GraphQLArgumentDef[];
  /** Return type name */
  return_type: string | null;
  /** Return type kind (SCALAR, OBJECT, LIST, etc.) */
  return_type_kind: string | null;
  /** Description from schema */
  description: string | null;
  /** When the operation was created */
  created_at: string;
  /** When the operation was last updated */
  updated_at: string;
}

/**
 * Insert DTO for graphql_operations table
 */
export interface GraphQLOperationInsert {
  spec_id: string;
  tool_id: string;
  operation_name: string;
  operation_type: GraphQLOperationType;
  operation_string: string;
  arguments?: GraphQLArgumentDef[];
  return_type?: string;
  return_type_kind?: string;
  description?: string;
}

/**
 * Update DTO for graphql_operations table
 */
export interface GraphQLOperationUpdate {
  description?: string;
  updated_at?: string;
}

// ============ GraphQL Environments Table ============

/**
 * GraphQL Environment link record
 * Table: graphql_environments
 */
export interface GraphQLEnvironmentRow {
  id: string;
  spec_id: string;
  environment_id: string;
  created_at: string;
}

export interface GraphQLEnvironmentInsert {
  spec_id: string;
  environment_id: string;
}

// ============ GraphQL Helper Types ============

/**
 * GraphQL spec with operations (for display)
 */
export interface GraphQLSpecWithOperations extends GraphQLSpecRow {
  operations: GraphQLOperationWithTool[];
}

/**
 * GraphQL operation with tool details (for display)
 */
export interface GraphQLOperationWithTool extends GraphQLOperationRow {
  tool: ToolRow;
}

// ============ MCP Servers Table ============

/** MCP Server auth types */
export type MCPServerAuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';

/**
 * MCP Server record in Supabase
 * Table: mcp_servers
 *
 * Stores external MCP server configurations that users import
 */
export interface MCPServerRow {
  /** UUID primary key */
  id: string;
  /** Clerk user ID (owner) */
  user_id: string;
  /** Normalized server name (used in tool names) */
  server_name: string;
  /** Display name for the server */
  display_name: string;
  /** MCP server URL (HTTP endpoint) */
  source_url: string;
  /** Environment name for this server */
  environment_name: string;
  /** Authentication type */
  auth_type: MCPServerAuthType;
  /** Authentication configuration (encrypted credentials) */
  auth_config: Record<string, unknown>;
  /** Default headers to send with every request */
  default_headers: Record<string, string>;
  /** Category for imported tools */
  category: string;
  /** Server metadata from initialize response */
  server_info: Record<string, unknown>;
  /** When the server was created */
  created_at: string;
  /** When the server was last updated */
  updated_at: string;
}

/**
 * Insert DTO for mcp_servers table
 */
export interface MCPServerInsert {
  user_id: string;
  server_name: string;
  display_name: string;
  source_url: string;
  environment_name?: string;
  auth_type?: MCPServerAuthType;
  auth_config?: Record<string, unknown>;
  default_headers?: Record<string, string>;
  category?: string;
  server_info?: Record<string, unknown>;
}

/**
 * Update DTO for mcp_servers table
 */
export interface MCPServerUpdate {
  display_name?: string;
  source_url?: string;
  environment_name?: string;
  auth_type?: MCPServerAuthType;
  auth_config?: Record<string, unknown>;
  default_headers?: Record<string, string>;
  category?: string;
  server_info?: Record<string, unknown>;
  updated_at?: string;
}

// ============ MCP Server Tools Table ============

/**
 * MCP Server Tool record in Supabase
 * Table: mcp_server_tools
 *
 * Links imported tools to their source MCP server
 */
export interface MCPServerToolRow {
  /** UUID primary key */
  id: string;
  /** Foreign key to mcp_servers.id */
  mcp_server_id: string;
  /** Foreign key to tools.id */
  tool_id: string;
  /** Original tool name from the external server */
  original_name: string;
  /** Original description from the external server */
  original_description: string | null;
  /** Whether this tool supports widgets */
  has_widget: boolean;
  /** Whether this tool is enabled */
  is_enabled: boolean;
  /** When the tool was imported */
  created_at: string;
}

/**
 * Insert DTO for mcp_server_tools table
 */
export interface MCPServerToolInsert {
  mcp_server_id: string;
  tool_id: string;
  original_name: string;
  original_description?: string;
  has_widget?: boolean;
  is_enabled?: boolean;
}

/**
 * Update DTO for mcp_server_tools table
 */
export interface MCPServerToolUpdate {
  is_enabled?: boolean;
}

// ============ MCP Server Helper Types ============

/**
 * MCP Server with tools (for display)
 */
export interface MCPServerWithTools extends MCPServerRow {
  tools: MCPServerToolWithDetails[];
}

/**
 * MCP Server tool with tool details (for display)
 */
export interface MCPServerToolWithDetails extends MCPServerToolRow {
  tool: ToolRow;
}

// ============ A2A Agents Table ============

/** A2A Agent authentication types */
export type A2AAgentAuthType = 'none' | 'api_key' | 'bearer' | 'basic' | 'oauth2';

/**
 * A2A Agent record in Supabase
 * Table: a2a_agents
 *
 * Stores A2A (Agent-to-Agent) protocol agents imported by users
 */
export interface A2AAgentRow {
  /** UUID primary key */
  id: string;
  /** Clerk user ID (owner) */
  user_id: string;
  /** Normalized agent name (used in tool names) */
  agent_name: string;
  /** Display name for the agent */
  display_name: string;
  /** Agent URL (A2A endpoint URL from agent card) */
  agent_url: string;
  /** Import URL (original URL used to import the agent) */
  import_url: string | null;
  /** Environment name for this agent */
  environment_name: string;
  /** Full agent card JSON from .well-known/agent.json */
  agent_card: Record<string, unknown>;
  /** Agent version from agent card */
  version: string | null;
  /** Protocol version from agent card */
  protocol_version: string | null;
  /** Agent description */
  description: string | null;
  /** Icon URL from agent card or favicon fallback */
  icon_url: string | null;
  /** Tags/categories from agent card */
  tags: string[];
  /** Category for the tool */
  category: string;
  /** Authentication type */
  auth_type: A2AAgentAuthType;
  /** Authentication configuration */
  auth_config: Record<string, unknown>;
  /** Default headers to send with every request */
  default_headers: Record<string, string>;
  /** Input schema for the agent tool */
  input_schema: Record<string, unknown>;
  /** Output schema for the agent tool */
  output_schema: Record<string, unknown>;
  /** Whether this agent supports widgets (always false) */
  has_widget: boolean;
  /** When the agent was created */
  created_at: string;
  /** When the agent was last updated */
  updated_at: string;
}

/**
 * Insert DTO for a2a_agents table
 */
export interface A2AAgentInsert {
  user_id: string;
  agent_name: string;
  display_name: string;
  agent_url: string;
  import_url?: string;
  environment_name?: string;
  agent_card?: Record<string, unknown>;
  version?: string;
  protocol_version?: string;
  description?: string;
  icon_url?: string;
  tags?: string[];
  category?: string;
  auth_type?: A2AAgentAuthType;
  auth_config?: Record<string, unknown>;
  default_headers?: Record<string, string>;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  has_widget?: boolean;
}

/**
 * Update DTO for a2a_agents table
 */
export interface A2AAgentUpdate {
  display_name?: string;
  agent_url?: string;
  environment_name?: string;
  agent_card?: Record<string, unknown>;
  version?: string;
  protocol_version?: string;
  description?: string;
  icon_url?: string;
  tags?: string[];
  category?: string;
  auth_type?: A2AAgentAuthType;
  auth_config?: Record<string, unknown>;
  default_headers?: Record<string, string>;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  updated_at?: string;
}

// ============ OAuth Tokens Table ============

/**
 * OAuth Token record in Supabase
 * Table: oauth_tokens
 *
 * Stores OAuth access and refresh tokens for server connections.
 */
export interface OAuthTokenRow {
  /** UUID primary key */
  id: string;
  /** Clerk user ID (owner) */
  user_id: string;

  /** Reference to REST API spec (polymorphic - only one should be set) */
  rest_api_spec_id: string | null;
  /** Reference to GraphQL spec */
  graphql_spec_id: string | null;
  /** Reference to MCP server */
  mcp_server_id: string | null;
  /** Reference to A2A agent */
  a2a_agent_id: string | null;
  /** Reference to RAG */
  rag_id: string | null;

  /** Hash of OAuth provider (token_endpoint + client_id) for token sharing */
  oauth_provider_hash: string | null;

  /** The OAuth access token */
  access_token: string;
  /** The OAuth refresh token */
  refresh_token: string | null;
  /** Token type (usually 'Bearer') */
  token_type: string;
  /** OAuth scopes */
  scope: string | null;

  /** When the access token expires */
  access_token_expires_at: string | null;
  /** When the refresh token expires */
  refresh_token_expires_at: string | null;

  /** OpenID Connect ID token */
  id_token: string | null;

  /** When the token was created */
  created_at: string;
  /** When the token was last updated */
  updated_at: string;
}

/**
 * Insert DTO for oauth_tokens table
 */
export interface OAuthTokenInsert {
  user_id: string;
  rest_api_spec_id?: string | null;
  graphql_spec_id?: string | null;
  mcp_server_id?: string | null;
  a2a_agent_id?: string | null;
  rag_id?: string | null;
  oauth_provider_hash?: string | null;
  access_token: string;
  refresh_token?: string | null;
  token_type?: string;
  scope?: string | null;
  access_token_expires_at?: string | null;
  refresh_token_expires_at?: string | null;
  id_token?: string | null;
}

/**
 * Update DTO for oauth_tokens table
 */
export interface OAuthTokenUpdate {
  access_token?: string;
  refresh_token?: string | null;
  token_type?: string;
  scope?: string | null;
  access_token_expires_at?: string | null;
  refresh_token_expires_at?: string | null;
  id_token?: string | null;
}

/** Server type for OAuth token lookup */
export type OAuthServerType = 'rest_api' | 'graphql' | 'mcp' | 'a2a' | 'rag';

// ============ Automation Tables ============

/** Automation status enum */
export type AutomationStatus = 'draft' | 'active' | 'paused' | 'archived';

/** Schedule type enum */
export type ScheduleType = 'manual' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'cron';

/** Last run status for display */
export type LastRunStatus = 'success' | 'warning' | 'error' | null;

/** Execution status */
export type ExecutionStatus = 'pending' | 'waiting_input' | 'running' | 'paused' | 'completed' | 'failed';

/** Log level */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Automation record in Supabase
 * Table: automations
 */
export interface AutomationRow {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  category: string;
  flow_definition: { nodes: unknown[]; edges: unknown[] };
  mermaid_diagram: string | null;
  yaml_definition: string | null;
  typescript_code: string | null;
  workflow_version: number;
  model_id: string;
  personality_ids: string[];
  schedule_type: ScheduleType;
  schedule_config: Record<string, unknown>;
  trigger_config: Record<string, unknown>;
  cron_expression: string | null;
  required_inputs: Record<string, RequiredInputConfig>;
  output_config: OutputConfigItem[];
  next_run_at: string | null;
  status: AutomationStatus;
  last_run_status: LastRunStatus;
  last_run_at: string | null;
  last_run_message: string | null;
  total_runs: number;
  successful_runs: number;
  total_tokens_used: number;
  created_at: string;
  updated_at: string;
}

/** Required input configuration */
export interface RequiredInputConfig {
  value?: unknown;
  sensitive?: boolean;
  human_input?: boolean;
  description?: string;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
}

/** Output configuration item */
export interface OutputConfigItem {
  type: 'email' | 'slack' | 'webhook' | 'push' | 'automation';
  [key: string]: unknown;
}

/**
 * Insert DTO for automations table
 */
export interface AutomationInsert {
  user_id: string;
  name: string;
  display_name?: string;
  description?: string;
  category?: string;
  flow_definition?: { nodes: unknown[]; edges: unknown[] };
  mermaid_diagram?: string;
  yaml_definition?: string;
  typescript_code?: string;
  workflow_version?: number;
  model_id?: string;
  personality_ids?: string[];
  schedule_type?: ScheduleType;
  schedule_config?: Record<string, unknown>;
  trigger_config?: Record<string, unknown>;
  cron_expression?: string;
  required_inputs?: Record<string, RequiredInputConfig>;
  output_config?: OutputConfigItem[];
  next_run_at?: string;
  status?: AutomationStatus;
}

/**
 * Update DTO for automations table
 */
export interface AutomationUpdate {
  name?: string;
  display_name?: string;
  description?: string;
  category?: string;
  flow_definition?: { nodes: unknown[]; edges: unknown[] };
  mermaid_diagram?: string;
  yaml_definition?: string;
  typescript_code?: string;
  workflow_version?: number;
  model_id?: string;
  personality_ids?: string[];
  schedule_type?: ScheduleType;
  schedule_config?: Record<string, unknown>;
  trigger_config?: Record<string, unknown>;
  cron_expression?: string;
  required_inputs?: Record<string, RequiredInputConfig>;
  output_config?: OutputConfigItem[];
  next_run_at?: string;
  status?: AutomationStatus;
  last_run_status?: LastRunStatus;
  last_run_at?: string;
  last_run_message?: string;
}

/**
 * Automation execution record
 * Table: automation_executions
 */
export interface AutomationExecutionRow {
  id: string;
  automation_id: string;
  user_id: string;
  status: ExecutionStatus;
  trigger_type: string;
  triggered_by: string | null;
  collected_inputs: Record<string, unknown>;
  pending_inputs: PendingInputItem[];
  current_step: string | null;
  context: Record<string, unknown>;
  output_results: OutputResultItem[];
  error: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

/** Pending input item */
export interface PendingInputItem {
  fieldName: string;
  stepId?: string;
  toolName?: string;
  description?: string;
  type?: string;
  required: boolean;
}

/** Output result item */
export interface OutputResultItem {
  type: string;
  success: boolean;
  sentAt?: string;
  error?: string;
  details?: Record<string, unknown>;
}

/**
 * Insert DTO for automation_executions table
 */
export interface AutomationExecutionInsert {
  automation_id: string;
  user_id: string;
  trigger_type: string;
  triggered_by?: string;
  collected_inputs?: Record<string, unknown>;
  pending_inputs?: PendingInputItem[];
  status?: ExecutionStatus;
}

/**
 * Update DTO for automation_executions table
 */
export interface AutomationExecutionUpdate {
  status?: ExecutionStatus;
  current_step?: string;
  collected_inputs?: Record<string, unknown>;
  pending_inputs?: PendingInputItem[];
  context?: Record<string, unknown>;
  output_results?: OutputResultItem[];
  error?: string;
  completed_at?: string;
}

/**
 * Automation log entry
 * Table: automation_logs
 */
export interface AutomationLogRow {
  id: string;
  execution_id: string;
  automation_id: string;
  timestamp: string;
  level: LogLevel;
  step_id: string | null;
  step_name: string | null;
  message: string;
  data: Record<string, unknown> | null;
  status: string | null;
  duration_ms: number | null;
}

/**
 * Insert DTO for automation_logs table
 */
export interface AutomationLogInsert {
  execution_id: string;
  automation_id: string;
  level?: LogLevel;
  step_id?: string;
  step_name?: string;
  message: string;
  data?: Record<string, unknown>;
  status?: string;
  duration_ms?: number;
}

/**
 * Human input request record
 * Table: automation_human_requests
 */
export interface AutomationHumanRequestRow {
  id: string;
  execution_id: string;
  automation_id: string;
  user_id: string;
  request_type: 'input' | 'approval' | 'choice';
  field_name: string | null;
  message: string | null;
  choices: unknown[] | null;
  notification_channels: string[];
  notification_sent: boolean;
  response: string | null;
  responded_at: string | null;
  expires_at: string | null;
  created_at: string;
}

/**
 * Insert DTO for automation_human_requests table
 */
export interface AutomationHumanRequestInsert {
  execution_id: string;
  automation_id: string;
  user_id: string;
  request_type: 'input' | 'approval' | 'choice';
  field_name?: string;
  message?: string;
  choices?: unknown[];
  notification_channels?: string[];
  expires_at?: string;
}

/**
 * Update DTO for automation_human_requests table
 */
export interface AutomationHumanRequestUpdate {
  notification_sent?: boolean;
  response?: string;
  responded_at?: string;
}
