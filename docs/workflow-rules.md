# Workflow YAML Rules

> This document defines the YAML schema for automation workflows.
> Use this as a system prompt or IDE rules file for AI-assisted workflow creation.

## Overview

Workflows are defined in YAML format. The YAML is the **source of truth** - Mermaid diagrams are generated from it for visualization.

## Basic Structure

```yaml
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

## Trigger Types

### Manual Trigger
```yaml
trigger:
  type: manual
```

### Cron Trigger
```yaml
trigger:
  type: cron
  schedule: "0 9 * * *"  # 9 AM daily
  timezone: "America/New_York"
```

**Cron Format:** `minute hour day-of-month month day-of-week`
- `*` = any value
- `*/5` = every 5 units
- `1,15` = specific values
- `1-5` = range

**Common Schedules:**
| Schedule | Cron Expression |
|----------|-----------------|
| Every minute | `* * * * *` |
| Every 5 minutes | `*/5 * * * *` |
| Hourly | `0 * * * *` |
| Daily at 9 AM | `0 9 * * *` |
| Weekly (Monday 9 AM) | `0 9 * * 1` |
| Monthly (1st at midnight) | `0 0 1 * *` |
| Yearly (Jan 1 at midnight) | `0 0 1 1 *` |

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

## Required Inputs

Pre-configure required input values. Fields can be:
- **Pre-filled** with actual values
- **Marked sensitive** for vault storage
- **Set to human_input** for runtime collection

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

## Webhook Trigger Endpoint

Every automation has a webhook endpoint that can be used to trigger it:

```
POST /api/ai/automations/{automation_id}/hook/{api_key}
```

**Path Parameters:**
- `automation_id`: UUID of the automation to trigger
- `api_key`: Your API key for authentication (validates ownership)

**Headers:**
- `Content-Type: application/json`

**Body:**
```json
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
  "execution_id": "run-uuid",
  "status": "running",
  "message": "Automation triggered successfully"
}
```

**Response (waiting for input):**
```json
{
  "execution_id": "run-uuid",
  "status": "waiting_input",
  "message": "Automation requires input before proceeding",
  "input_url": "/automation/{id}/running/{runId}/input",
  "missing_inputs": [
    {"name": "customer_email", "type": "string", "description": "Customer email"}
  ]
}
```

### Internal Calls (Automation-to-Automation)

When triggering from within another automation, use the `x-internal-call: true` header to bypass API key validation:

```yaml
# In trigger_automation block, the system automatically:
# 1. Adds x-internal-call: true header
# 2. Uses the execution context's user_id for ownership validation
```

### Cron Calls

Vercel Cron jobs use `x-cron-secret` header with `CRON_SECRET` env var for authentication.

---

## Human-in-the-Loop & Input Exceptions

When an automation requires input that isn't available:

1. **Execution pauses** with status `waiting_input`
2. **Notifications sent** via all detected notification tools (email, Slack, push)
3. **User receives link** to `/automation/{id}/running/{runId}/input`
4. **User provides input** via the web form
5. **Execution resumes** automatically

### Notification Message Format

```
🤖 Automation "{name}" requires your input

The following fields are needed to continue:
- {field1}: {description}
- {field2}: {description}

Click here to provide input: {input_url}

Run ID: {execution_id}
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

