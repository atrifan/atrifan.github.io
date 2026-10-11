---
description: Workflow automation YAML schema, step types, and execution flow
appliesTo: ["src/lib/automation/**", "scripts/run-workflow.ts"]
alwaysApply: false
---

# Workflow Automation

YAML is the source of truth (`src/lib/automation/types.ts`). Only the local runner is left:
`npm run automation <workflow.yaml>` (`scripts/run-workflow.ts` → `executeWorkflow()` in
`src/lib/automation/executor.ts`). The `/api/ai/automations/*` routes, the runtime executor, the automation
UI and the daily cron were removed as dead code; the `automations*` tables remain.

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

Declared in YAML (`manual`, `webhook`, `cron`, `automation`), but no server route runs them now; the local
runner executes a workflow on demand. The curl snippets in `notification-templates.ts` still name the old
routes.

Not yet implemented: event triggers (use webhooks + `trigger_automation` as a workaround), approval
workflows (`requireApprovalFor` unwired).
