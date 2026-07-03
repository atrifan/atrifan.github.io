---
description: Workflow automation YAML schema, step types, and execution flow
appliesTo: ["src/lib/automation/**", "app/api/ai/automations/**", "scripts/**"]
alwaysApply: false
---

# Workflow Automation

YAML is the source of truth (`src/lib/automation/types.ts`). Parsed → `executeWorkflow()` →
`runtime-executor.ts` → `tool-executor-service.ts` → MCP client, with logs in `automation_logs`.

## Schema

```yaml
name: my-workflow
trigger:
  type: cron|webhook|manual|automation
  schedule: "0 10 * * *"          # cron only
required_inputs:
  api_key: { value: "...", sensitive: true }
  query:   { human_input: true, description: "Search query" }
steps:
  - id: search
    tool: brave-search.web_search
    params: { query: "{{inputs.query}}" }
    output: results
  - id: analyze
    llm: { model: mistral/ministral-3b, prompt: "Summarize: {{results}}" }
    output: summary
  - id: notify
    notify: { channels: [email, push], message: "{{summary}}" }
outputs:
  - type: email
    to: "{{user.email}}"
    subject: "Results"
    body: "{{summary}}"
```

## Step types

`tool:`, `llm:`, `code:` (JS expr), `if:`, `for:`/`while:`, `human:` (approval), `delay:`, `notify:`,
`trigger_automation:` (chain), `wait_for:` (external variable).

## Triggers

Manual (button), webhook (`/api/ai/automations/[name]/hook/[apiKey]`), cron (Vercel cron →
`/api/ai/automations/cron`), automation chain.

Not yet implemented: event triggers (use webhooks + `trigger_automation` as a workaround), approval
workflows (`requireApprovalFor` unwired).
