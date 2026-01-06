/**
 * Supabase Database Types
 * 
 * DTOs for Supabase tables related to MCP connections tracking.
 * These types define the schema for:
 * - api_keys: Stores API keys linked to users
 * - mcp_connections: Stores connection logs per api_key + server_name
 */

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
  provider: 'clerk' | 'custom';
  plan: 'free' | 'pro' | 'plus';
  is_active?: boolean;
}

/**
 * Update DTO for api_keys table
 */
export interface ApiKeyUpdate {
  is_active?: boolean;
  last_used_at?: string;
  revoked_at?: string;
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
  /** Server name (empty string for default server) */
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
    };
  };
}

// ============ Helper Types ============

/**
 * Connection with API key info (for dashboard display)
 */
export interface McpConnectionWithApiKey extends McpConnectionRow {
  api_key: Pick<ApiKeyRow, 'api_key_suffix' | 'provider' | 'plan'>;
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

