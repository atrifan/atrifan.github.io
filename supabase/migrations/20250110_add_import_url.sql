-- Add import_url column to a2a_agents table
-- This stores the original URL used to import the agent (e.g., the website URL)
-- while agent_url stores the A2A endpoint URL from the agent card

ALTER TABLE a2a_agents ADD COLUMN IF NOT EXISTS import_url TEXT;

-- Comment
COMMENT ON COLUMN a2a_agents.import_url IS 
  'The original URL used to import the agent (may differ from agent_url which is the A2A endpoint)';

