-- Backfill icon_url on chat_connectors from linked a2a_agents
-- This ensures existing connectors have the icon_url from their agent

UPDATE chat_connectors cc
SET icon_url = a.icon_url
FROM a2a_agents a
WHERE cc.a2a_agent_id = a.id
  AND cc.icon_url IS NULL
  AND a.icon_url IS NOT NULL;

