# Workflow YAML Rules

> This document defines the YAML schema for automation workflows.
> Use this as a system prompt or IDE rules file for AI-assisted workflow creation.

## Overview

Workflows are defined in YAML format. The YAML is the **source of truth** - Mermaid diagrams are generated from it for visualization.

## Basic Structure

```yaml
id: my_workflow              # Auto-generated from name if not provided
name: "My Workflow"
description: "What this workflow does"
version: 1

trigger:
  type: manual  # or cron, webhook, event

inputs:
  - name: query
    type: string
    required: true
    description: "Search query"

steps:
  - id: step1
    tool: connector.tool_name
    params:
      param1: "value"
      param2: "{{query}}"
    output: result

constraints:
  maxToolCalls: 50
  timeout: "5m"
```

## Workflow ID

The `id` field is a unique identifier for the workflow in snake_case format.

### Naming Convention

| Name | Generated ID |
|------|--------------|
| `"Birthday Checker"` | `birthday_checker` |
| `"My Awesome Workflow!"` | `my_awesome_workflow` |
| `"Send Email - Daily Report"` | `send_email_daily_report` |
| `"API v2 Integration"` | `api_v2_integration` |

### Rules

1. **Auto-generated**: If `id` is not provided, it's generated from `name`
2. **Lowercase**: All characters are lowercased
3. **Snake case**: Spaces and hyphens become underscores
4. **Alphanumeric only**: Special characters are removed
5. **No leading/trailing underscores**: Trimmed automatically

### Example

```yaml
# These are equivalent:
id: birthday_checker
name: "Birthday Checker"

# Or just provide name (id auto-generated):
name: "Birthday Checker"
# id will be: birthday_checker
```

## Trigger Types

There are only 3 trigger types. The UI may show "pretty" schedule options (daily, weekly, etc.) but these all convert to cron expressions.

| Type | Description | Use Case |
|------|-------------|----------|
| `manual` | Triggered by user action in UI | On-demand tasks |
| `cron` | Scheduled execution | Recurring tasks (daily, weekly, etc.) |
| `webhook` | Triggered by external HTTP POST | External integrations, callbacks |

### Manual Trigger
```yaml
trigger:
  type: manual
```
Executed when user clicks "Run" in the UI or via API.

### Webhook Trigger
```yaml
trigger:
  type: webhook
```
Triggered via POST to `/api/ai/automations/{automation_id}/hook/{api_key}`.

### Cron Trigger
```yaml
trigger:
  type: cron
  schedule: "0 9 * * *"  # 9 AM daily
  timezone: "America/New_York"
```

**Trigger Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | Must be `"cron"` |
| `schedule` | string | Yes | Cron expression (5 fields) |
| `timezone` | string | No | IANA timezone (default: UTC) |

**Cron Format:** `minute hour day-of-month month day-of-week`

| Position | Field | Values | Special Characters |
|----------|-------|--------|-------------------|
| 1 | Minute | 0-59 | `*` `,` `-` `/` |
| 2 | Hour | 0-23 | `*` `,` `-` `/` |
| 3 | Day of Month | 1-31 | `*` `,` `-` `/` |
| 4 | Month | 1-12 | `*` `,` `-` `/` |
| 5 | Day of Week | 0-6 (Sun=0) | `*` `,` `-` `/` |

**Special Characters:**
- `*` = any value
- `*/n` = every n units (e.g., `*/5` = every 5)
- `n,m` = specific values (e.g., `1,15` = 1st and 15th)
- `n-m` = range (e.g., `1-5` = Monday to Friday)

**Common Schedules:**
| Schedule | Cron Expression |
|----------|-----------------|
| Every minute | `* * * * *` |
| Every 5 minutes | `*/5 * * * *` |
| Every 15 minutes | `*/15 * * * *` |
| Every 30 minutes | `*/30 * * * *` |
| Hourly | `0 * * * *` |
| Every 2 hours | `0 */2 * * *` |
| Daily at midnight | `0 0 * * *` |
| Daily at 9 AM | `0 9 * * *` |
| Daily at 6 PM | `0 18 * * *` |
| Weekdays at 9 AM | `0 9 * * 1-5` |
| Weekends at 10 AM | `0 10 * * 0,6` |
| Weekly (Monday 9 AM) | `0 9 * * 1` |
| Bi-weekly (Mon/Thu 9 AM) | `0 9 * * 1,4` |
| Monthly (1st at midnight) | `0 0 1 * *` |
| Monthly (15th at noon) | `0 12 15 * *` |
| Quarterly (1st of Jan/Apr/Jul/Oct) | `0 0 1 1,4,7,10 *` |
| Yearly (Jan 1 at midnight) | `0 0 1 1 *` |

**Common Timezones:**
| Region | Timezone |
|--------|----------|
| US Eastern | `America/New_York` |
| US Central | `America/Chicago` |
| US Mountain | `America/Denver` |
| US Pacific | `America/Los_Angeles` |
| UK | `Europe/London` |
| Central Europe | `Europe/Paris` |
| India | `Asia/Kolkata` |
| Japan | `Asia/Tokyo` |
| Australia | `Australia/Sydney` |
| UTC | `UTC` |

### Webhook Trigger
```yaml
trigger:
  type: webhook
  webhook:
    method: POST
    auth:
      type: api_key
      apiKey:
        header: X-API-Key
    inputSchema:
      type: object
      properties:
        orderId:
          type: string
      required: [orderId]
```

### Event Trigger
```yaml
trigger:
  type: event
  event:
    name: "order.created"
    filter: "event.data.amount > 100"
```

### Automation Trigger
Triggered when another automation completes or reaches a specific step.

```yaml
trigger:
  type: automation
  from: "Order Processing"  # Name of triggering automation
  on: complete  # or step
  # step: processPayment  # If on: step
```

## Workflow Inputs

There are **two formats** for defining workflow inputs. Use the appropriate format based on your use case:

### Format Comparison

| Format | Use Case | Prompts User at Runtime |
|--------|----------|-------------------------|
| `inputs:` (array) | **Primary format** for user-provided values | Yes, if `required: true` and no `default` |
| `required_inputs:` (object) | Pre-configured values, secrets, sensitive data | Only if `human_input: true` and no `value` |

### `inputs:` Array Format (Recommended)

**Use this format for workflow inputs that users provide when running the workflow.**

```yaml
inputs:
  - name: query
    type: string
    required: true
    description: "Search query to execute"

  - name: limit
    type: number
    required: false
    default: 10
    description: "Maximum number of results"

  - name: options
    type: object
    required: false
    default: { includeMetadata: true }
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Input variable name |
| `type` | string | No | `string`, `number`, `boolean`, `object`, `array` (default: `string`) |
| `required` | boolean | No | If `true`, user must provide value (default: `false`) |
| `default` | any | No | Default value if not provided |
| `description` | string | No | Help text shown in UI |

**Behavior:**
- If `required: true` and no `default`: User is prompted before execution
- If `required: false` or has `default`: Uses default value if not provided

### `required_inputs:` Object Format (Advanced)

**Use this format for pre-configured values, secrets, and sensitive data.**

```yaml
required_inputs:
  api_key:
    value: "sk-..."
    sensitive: true  # Stored in vault, masked in UI

  customer_email:
    human_input: true  # Requested at runtime
    description: "Customer email for notification"
    type: string

  threshold:
    value: 100
    type: number
```

**Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `value` | any | Pre-configured value (not prompted) |
| `sensitive` | boolean | If `true`, value is masked in UI and stored securely |
| `human_input` | boolean | If `true` and no `value`, user is prompted at runtime |
| `type` | string | Value type for validation |
| `description` | string | Help text shown when prompting |

**Missing Required Inputs:** If a tool step requires an input that isn't available in context or pre-configured, the workflow pauses and sends a notification (email/slack) requesting the input. This is automatic human-in-the-loop error handling.

## Outputs

Workflows deliver results via notifications, not JSON returns. Configure outputs:

```yaml
outputs:
  - type: email
    to: "{{customer_email}}"
    subject: "Order {{orderId}} Processed"
    body: "Your order has been processed. Summary: {{summary}}"

  - type: slack
    channel: "#orders"
    message: "Order {{orderId}} completed: {{summary}}"

  - type: webhook
    url: "https://api.example.com/callback"
    method: POST
    body:
      orderId: "{{orderId}}"
      status: "completed"

  - type: automation
    name: "Send Invoice"  # Trigger another automation
    inputs:
      orderId: "{{orderId}}"
      amount: "{{total}}"
```

## Step Types

### Tool Call Step
Calls an MCP tool from a connector.

```yaml
- id: search
  tool: brave-search.web_search
  params:
    query: "{{userQuery}}"
    count: 10
  output: searchResults
  onError: continue  # or fail, retry
```

### Code Step
Inline JavaScript/TypeScript expression.

```yaml
- id: filter
  code: |
    searchResults.filter(r => r.score > 0.7).slice(0, 5)
  output: topResults
```

### LLM Step
Calls an AI model.

```yaml
- id: summarize
  llm:
    model: "openai/gpt-4o-mini"
    system: "You are a helpful assistant"
    prompt: "Summarize these results: {{topResults}}"
    format: text  # or json
  output: summary
```

For structured output:
```yaml
- id: extract
  llm:
    prompt: "Extract entities from: {{text}}"
    format: json
    schema:
      type: object
      properties:
        entities:
          type: array
          items:
            type: object
            properties:
              name: { type: string }
              type: { type: string }
  output: entities
```

### Conditional Step
```yaml
- id: checkEmpty
  if: topResults.length === 0
  then:
    - id: noResults
      return: { status: "empty", message: "No results found" }
  else:
    - id: processResults
      code: topResults.map(r => r.title)
      output: titles
```

### For Loop Step
```yaml
- id: processEach
  for: item in items
  do:
    - id: processItem
      tool: processor.process
      params:
        data: "{{item}}"
      output: processed
```

### While Loop Step
```yaml
- id: pollUntilReady
  while: status !== 'ready'
  maxIterations: 10
  do:
    - id: checkStatus
      tool: api.get_status
      params:
        id: "{{jobId}}"
      output: status
    - id: wait
      code: await new Promise(r => setTimeout(r, 1000))
      output: _
```

### Human-in-the-Loop Step
```yaml
- id: approval
  human:
    message: "Approve this action? Amount: ${{amount}}"
    type: confirm  # or text, choice
    choices: ["Approve", "Reject", "Escalate"]
    timeout: 3600  # seconds
    notify: [email, slack]
  output: decision
```

### Notify Step
```yaml
- id: alert
  notify:
    channels: [email, slack, push]
    message: "Order {{orderId}} processed successfully"
    priority: high  # or low, normal
```

### Return Step
```yaml
- id: done
  return:
    status: "success"
    data: "{{processedData}}"
    timestamp: "{{new Date().toISOString()}}"
```

### Trigger Automation Step
Trigger another automation from within a workflow.

```yaml
- id: startInvoicing
  trigger_automation:
    name: "Generate Invoice"
    inputs:
      orderId: "{{orderId}}"
      amount: "{{total}}"
    wait: false  # Don't wait for completion (default)
  output: invoiceExecution  # Execution ID if wait=false
```

With wait (synchronous):
```yaml
- id: getApproval
  trigger_automation:
    name: "Manager Approval"
    inputs:
      request: "{{request}}"
    wait: true  # Wait for completion
  output: approvalResult
```

### Delay Step
Pause execution for a specified number of seconds.

```yaml
- id: waitBeforeRetry
  delay: 5  # Wait 5 seconds
```

Use cases:
- Rate limiting between API calls
- Waiting for external processes
- Polling intervals

### Set Variable Step
Explicitly set a variable value. Useful for initializing counters, flags, or computed values.

```yaml
- id: initCounter
  set: counter
  value: 0

- id: setFlag
  set: isProcessed
  value: true

- id: computeValue
  set: fullName
  value: "{{firstName}} {{lastName}}"
```

### Stop Step
Stop execution immediately. Can be triggered programmatically or used to handle cancellation.

```yaml
- id: cancelExecution
  stop:
    reason: "User requested cancellation"
    status: cancelled  # or completed (default: cancelled)
```

Use cases:
- Graceful cancellation from external hooks
- Early termination on critical errors
- User-initiated stops

### Wait For Variable Step
Pause execution until a variable is set via external PUT request. Useful for waiting on external callbacks, approvals, or long-running processes.

```yaml
- id: waitForApproval
  wait_for:
    variable: approvalStatus  # Variable to wait for
    timeout: 3600  # Timeout in seconds (default: 3600 = 1 hour)
    pollInterval: 5  # Poll interval in seconds (default: 5)
    condition: "approvalStatus === 'approved'"  # Optional condition
  output: approvalResult
```

**Fields:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `variable` | string | Yes | Variable name to wait for |
| `timeout` | number | No | Timeout in seconds (default: 3600) |
| `pollInterval` | number | No | Poll interval in seconds (default: 5) |
| `condition` | string | No | JS condition to check (e.g., `"status === 'done'"`) |

**External Variable Update:**
External systems can set variables via PUT request:
```
PUT /api/ai/automations/{automation_id}/executions/{run_id}/variables
Content-Type: application/json

{
  "variables": {
    "approvalStatus": "approved",
    "approvedBy": "manager@example.com"
  }
}
```

Use cases:
- Waiting for external webhook callbacks
- Human approval workflows
- Long-running external process completion
- Polling for third-party API status changes

## Variable References

Use `{{variable}}` syntax to reference variables:

```yaml
params:
  # Simple variable
  query: "{{userInput}}"

  # Nested property
  name: "{{user.profile.name}}"

  # Array access
  first: "{{items[0]}}"

  # Expression
  count: "{{items.length}}"

  # Template string
  message: "Hello {{user.name}}, you have {{items.length}} items"
```

## Inputs

Define workflow inputs for webhooks and manual triggers:

```yaml
inputs:
  - name: query
    type: string
    required: true
    description: "Search query"

  - name: limit
    type: number
    required: false
    default: 10

  - name: options
    type: object
    required: false
    default: { includeMetadata: true }
```

**Types:** `string`, `number`, `boolean`, `object`, `array`

## Constraints

```yaml
constraints:
  # Maximum tool calls per execution
  maxToolCalls: 50

  # Execution timeout
  timeout: "5m"  # or "60s", "1h"

  # Tools requiring human approval
  requireApprovalFor:
    - "payment.charge"
    - "email.send_bulk"
```

## Error Handling

Each step can specify error behavior:

```yaml
- id: riskyStep
  tool: external.api_call
  params: { ... }
  output: result
  onError: continue  # continue to next step

- id: criticalStep
  tool: payment.charge
  params: { ... }
  output: receipt
  onError: fail  # stop workflow (default)

- id: flakeyStep
  tool: network.request
  params: { ... }
  output: response
  onError: retry  # retry with backoff
```

## Complete Example

```yaml
name: "Daily News Digest"
description: "Fetches news, summarizes, and sends email digest"
version: 1

trigger:
  type: cron
  schedule: "0 8 * * *"
  timezone: "America/New_York"

inputs:
  - name: topics
    type: array
    default: ["AI", "Technology", "Business"]

steps:
  - id: fetchNews
    tool: brave-search.web_search
    params:
      query: "{{topics.join(' OR ')}} news today"
      count: 20
    output: articles

  - id: filterRecent
    code: |
      articles.filter(a => {
        const date = new Date(a.publishedAt);
        const yesterday = new Date(Date.now() - 86400000);
        return date > yesterday;
      })
    output: recentArticles

  - id: checkEmpty
    if: recentArticles.length === 0
    then:
      - id: noNews
        notify:
          channels: [slack]
          message: "No recent news found for topics: {{topics}}"

      - id: exitEarly
        return: { status: "no_news" }

  - id: summarize
    llm:
      model: "openai/gpt-4o-mini"
      prompt: |
        Create a brief digest of these news articles:
        {{JSON.stringify(recentArticles, null, 2)}}

        Format as HTML email with sections per topic.
      format: text
    output: digest

  - id: sendEmail
    tool: email.send
    params:
      to: "{{process.env.DIGEST_EMAIL}}"
      subject: "Daily News Digest - {{new Date().toLocaleDateString()}}"
      html: "{{digest}}"
    output: emailResult

  - id: complete
    return:
      status: "success"
      articleCount: "{{recentArticles.length}}"
      sentTo: "{{process.env.DIGEST_EMAIL}}"

constraints:
  maxToolCalls: 30
  timeout: "2m"
```

---

## Automation Execution API

### Authentication

All execution endpoints support two authentication methods:

1. **Clerk Session** (for UI/browser calls) - Automatic via cookies
2. **API Key** (for external/programmatic calls):
   - `Authorization: Bearer <api_key>` header
   - `X-API-Key: <api_key>` header

The API key is validated by hashing and looking up in the `api_keys` table, then verifying the user owns the automation.

### API Endpoints Overview

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/ai/automations/{id}/hook/{api_key}` | API key in path | Start automation (webhook) |
| GET | `/api/ai/automations/{id}/executions` | Session/API key | List all executions |
| GET | `/api/ai/automations/{id}/executions/{instance_id}` | Session/API key | Get execution status |
| DELETE | `/api/ai/automations/{id}/executions/{instance_id}` | Session/API key | Stop/cancel execution |
| DELETE | `/api/ai/automations/{id}/executions/{instance_id}?hard=true` | Session/API key | Delete execution |
| POST | `/api/ai/automations/{id}/executions/{instance_id}/input` | Session/API key | Submit input to unblock |
| PUT | `/api/ai/automations/{id}/executions/{instance_id}/variables` | Session/API key | Update variables |
| GET | `/api/ai/automations/{id}/executions/{instance_id}/variables` | Session/API key | Get current variables |
| GET | `/api/ai/automations/{id}/executions/{instance_id}/logs` | Session/API key | Get execution logs |

### Start Automation (Webhook)

```
POST /api/ai/automations/{automation_id}/hook/{api_key}
Content-Type: application/json

{
  "inputs": {
    "field1": "value1",
    "field2": "value2"
  }
}
```

**Response (success):**
```json
{
  "execution_id": "instance-uuid",
  "status": "running",
  "message": "Automation triggered successfully"
}
```

**Response (waiting for input):**
```json
{
  "execution_id": "instance-uuid",
  "status": "waiting_input",
  "message": "Automation requires input before proceeding",
  "input_url": "/automation/{automation_id}/running/{instance_id}/input",
  "missing_inputs": [
    {"name": "customer_email", "type": "string", "description": "Customer email"}
  ]
}
```

### Stop Execution

```
DELETE /api/ai/automations/{automation_id}/executions/{instance_id}
```

Sets status to `cancelled`. The executor polls for this and stops processing.

**Response:**
```json
{
  "success": true,
  "execution": { "id": "instance-uuid", "status": "cancelled" }
}
```

### Submit Input (Unblock waiting_input)

When an execution is in `waiting_input` status, submit the required inputs to resume:

```bash
curl -X POST "https://yourapp.com/api/ai/automations/{automation_id}/executions/{instance_id}/input" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "customer_email": "user@example.com",
      "approved": true
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "execution": { "id": "instance-uuid", "status": "running" },
  "message": "Inputs received, execution resumed"
}
```

### Update Variables (for wait_for step)

When an execution is polling for a variable (via `wait_for` step), set the variable externally:

```bash
curl -X PUT "https://yourapp.com/api/ai/automations/{automation_id}/executions/{instance_id}/variables" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "approvalStatus": "approved",
      "approvedBy": "manager@example.com"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "execution": { "id": "instance-uuid", "status": "running" },
  "variables": { "approvalStatus": "approved", "approvedBy": "manager@example.com" }
}
```

### Get Current Variables

Check current execution variables:

```bash
curl -X GET "https://yourapp.com/api/ai/automations/{automation_id}/executions/{instance_id}/variables" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### UI Input Page

Users can provide input via web form at:
```
/automation/{automation_id}/running/{instance_id}/input
```

This page shows:
- Automation name and status
- List of required inputs with descriptions
- Form fields for each input
- Timeout countdown (5 minutes)
- Submit button

### Internal Calls (Automation-to-Automation)

When triggering from within another automation, use the `x-internal-call: true` header to bypass API key validation.

### Cron Calls

Vercel Cron jobs use `x-cron-secret` header with `CRON_SECRET` env var for authentication.

---

## Human-in-the-Loop & Input Exceptions

When an automation requires input that isn't available:

1. **Execution pauses** with status `waiting_input`
2. **Notifications sent** via configured channels (email, Slack, push)
3. **User receives link** to `/automation/{automation_id}/running/{instance_id}/input`
4. **User provides input** via web form or API
5. **Execution resumes** automatically

### ⏱️ Timeout Behavior

**IMPORTANT:** Executions waiting for user input have a **5-minute timeout**.

| Wait Type | Timeout | Behavior |
|-----------|---------|----------|
| `waiting_input` (missing inputs) | 5 minutes | Exits with `timeout_user_input` error |
| `wait_for` (variable polling) | 5 minutes (default) | Exits with `timeout_wait_for` error |
| `human` step (approval) | 5 minutes | Exits with `timeout_approval` error |

After timeout, the execution status changes to `failed` with an appropriate error message.

### Notification Message Templates

#### Input Required Notification

```
🤖 Automation "{automation_name}" requires your input

Run ID: {execution_id}
Status: Waiting for input

The following fields are needed to continue:
{missing_inputs_list}

⏱️ This request will timeout in 5 minutes.

📝 Provide input via UI:
{input_url}

🔧 Or via API (curl):
curl -X POST "{api_base_url}/api/ai/automations/{automation_id}/executions/{execution_id}/input" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "{field_name}": "{value}"
    }
  }'
```

#### Wait For Variable Notification

```
⏳ Automation "{automation_name}" is waiting for external event

Run ID: {execution_id}
Status: Waiting for variable "{variable_name}"

The automation is polling for variable "{variable_name}" to be set.

⏱️ This will timeout in {timeout_seconds} seconds.

🔧 Set the variable via API:
curl -X PUT "{api_base_url}/api/ai/automations/{automation_id}/executions/{execution_id}/variables" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{
    "variables": {
      "{variable_name}": {value}
    }
  }'
```

#### Human Approval Notification

```
👤 Automation "{automation_name}" requires your approval

Run ID: {execution_id}
Step: {step_id}

{approval_message}

⏱️ This request will timeout in 5 minutes.

📝 Respond via UI:
{approval_url}

🔧 Or via API:
# Approve
curl -X POST "{api_base_url}/api/ai/automations/{automation_id}/executions/{execution_id}/input" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"approved": true}}'

# Reject
curl -X POST "{api_base_url}/api/ai/automations/{automation_id}/executions/{execution_id}/input" \
  -H "Authorization: Bearer {api_key}" \
  -H "Content-Type: application/json" \
  -d '{"inputs": {"approved": false, "reason": "Rejected by user"}}'
```

#### Timeout Notification

```
⚠️ Automation "{automation_name}" timed out

Run ID: {execution_id}
Status: Failed
Error: {timeout_type}

The automation was waiting for {wait_description} but no response was received within 5 minutes.

The execution has been marked as failed. You can:
- View logs: {logs_url}
- Retry: {retry_url}
```

### Configuring Input Requirements

```yaml
required_inputs:
  # Pre-filled value (no prompt needed)
  api_key:
    value: "sk-..."
    sensitive: true

  # Always prompt user at runtime
  customer_email:
    human_input: true
    description: "Customer email for notification"
    type: string

  # Optional with default
  threshold:
    value: 100
    type: number
```

---

## Notification Tools

Notification tools are **auto-detected** from your connectors based on tool names and descriptions containing keywords like:
- **Email**: `email`, `mail`, `send_email`
- **Slack**: `slack`, `post_message`, `channel`
- **Push**: `push`, `notification`, `mobile`
- **SMS**: `sms`, `text_message`
- **Webhook**: `webhook`, `http_post`, `callback`

These tools are automatically used for:
- Human-in-the-loop input requests
- Error notifications
- Workflow output delivery

### Using Notifications in Workflows

```yaml
# In outputs section
outputs:
  - type: email
    tool: email-connector.send_email
    to: "{{customer_email}}"
    subject: "Order {{orderId}} Processed"
    body: "{{summary}}"

  - type: slack
    tool: slack-connector.post_message
    channel: "#orders"
    message: "Order {{orderId}} completed"

# In notify step
steps:
  - id: alert
    notify:
      channels: [email, slack]  # Uses detected tools
      message: "Urgent: {{alert_message}}"
      priority: high
```

---

## Execution States

| Status | Description |
|--------|-------------|
| `pending` | Execution created, not yet started |
| `running` | Actively executing steps |
| `waiting_input` | Paused, waiting for human input |
| `paused` | Manually paused by user |
| `completed` | Successfully finished |
| `failed` | Error occurred |
| `cancelled` | Cancelled by user |

---

## Cron Scheduling

> **Note:** Cron triggers are implemented via Vercel Cron Jobs. The cron expression is stored in the automation and Vercel handles the scheduling.

Common cron expressions:
| Schedule | Expression |
|----------|------------|
| Every minute | `* * * * *` |
| Every 5 minutes | `*/5 * * * *` |
| Hourly | `0 * * * *` |
| Daily at 9 AM | `0 9 * * *` |
| Weekly Monday 9 AM | `0 9 * * 1` |
| Monthly 1st at midnight | `0 0 1 * *` |

---

## Available Tools

> The following tools are available from your active connectors.
> Use the format `connector.tool_name` in your workflow steps.

<!-- TOOLS_SECTION_START -->
*Tools will be dynamically inserted here based on active connectors.*
<!-- TOOLS_SECTION_END -->

