-- Add AI category and ai_summarize native tool
-- This migration adds the AI category and the ai_summarize tool for AI-powered text processing

-- ============ Add AI Category ============

INSERT INTO tool_categories (name, icon, description, is_system, user_id) VALUES
  ('AI', '🤖', 'AI-powered processing and analysis tools', true, NULL)
ON CONFLICT (name) DO NOTHING;

-- ============ Insert ai_summarize Tool ============

INSERT INTO tools (
  name,
  description,
  category,
  tool_type,
  has_widget,
  invoking_message,
  invoked_message,
  input_schema,
  output_schema,
  user_id
) VALUES (
  'ai_summarize',
  'AI-powered text processing tool. Summarize, analyze, or transform text/JSON data using a lightweight AI model. Portable MCP tool that can be implemented by any AI agent. Uses aggressive defaults for cost efficiency (512 output tokens, cheapest model).',
  'AI',
  'NATIVE',
  false,
  'Processing with AI...',
  'AI processing complete',
  '{
    "type": "object",
    "properties": {
      "data": {
        "type": "string",
        "description": "The text or JSON data to process (required). Can be any text content, JSON object stringified, or structured data."
      },
      "prompt": {
        "type": "string",
        "description": "Instruction for the AI (required). Examples: \"summarize this\", \"make human friendly\", \"extract key points\", \"translate to Spanish\", \"explain in simple terms\"."
      },
      "model": {
        "type": "string",
        "description": "AI model to use (optional). Defaults to mistral/ministral-3b (cheapest). Other options depend on user plan."
      },
      "max_tokens": {
        "type": "number",
        "description": "Maximum output tokens (optional). Default: 512. Range: 1-4000."
      },
      "temperature": {
        "type": "number",
        "description": "Creativity level 0-1 (optional). Default: 0.3. Lower = more focused, higher = more creative."
      }
    },
    "required": ["data", "prompt"]
  }'::jsonb,
  '{
    "type": "object",
    "properties": {
      "response": {
        "type": "string",
        "description": "The AI-generated response"
      },
      "input_tokens": {
        "type": "number",
        "description": "Number of input tokens used"
      },
      "output_tokens": {
        "type": "number",
        "description": "Number of output tokens generated"
      },
      "cost_usd": {
        "type": "number",
        "description": "Cost in USD for this request"
      },
      "model": {
        "type": "string",
        "description": "Model used for processing"
      },
      "success": {
        "type": "boolean",
        "description": "Whether the request was successful"
      },
      "error": {
        "type": "string",
        "description": "Error message if failed"
      }
    }
  }'::jsonb,
  NULL  -- System NATIVE tool
) ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  input_schema = EXCLUDED.input_schema,
  output_schema = EXCLUDED.output_schema,
  invoking_message = EXCLUDED.invoking_message,
  invoked_message = EXCLUDED.invoked_message,
  updated_at = NOW();

-- ============ Comments ============

COMMENT ON TABLE tool_categories IS
  'Categories for organizing tools. System categories are created by migrations, user categories can be created dynamically.';

