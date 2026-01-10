-- Add icon_url column to chat_connectors table
-- For storing favicon URLs for external agents and imported MCP servers

ALTER TABLE chat_connectors ADD COLUMN IF NOT EXISTS icon_url TEXT;

