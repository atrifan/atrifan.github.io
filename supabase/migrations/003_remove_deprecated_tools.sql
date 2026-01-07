-- Remove deprecated tools: calculate_sleep, generate_password, calculate_risk
-- These tools are being removed from the MCP server
-- Note: sleep_calculator remains as the proper sleep tool

-- First, remove any server_tools references (foreign key constraint)
DELETE FROM server_tools 
WHERE tool_id IN (
  SELECT id FROM tools 
  WHERE name IN ('calculate_sleep', 'generate_password', 'calculate_risk')
);

-- Then remove the tools themselves
DELETE FROM tools 
WHERE name IN ('calculate_sleep', 'generate_password', 'calculate_risk');

