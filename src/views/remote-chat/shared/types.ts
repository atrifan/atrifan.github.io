export type ClaudeModel = "claude-opus-4-7" | "claude-sonnet-4-6" | "claude-haiku-4-5-20251001"

export type BedrockModel =
  | "us.anthropic.claude-opus-4-7"
  | "us.anthropic.claude-opus-4-6-v1"
  | "us.anthropic.claude-opus-4-5-20251101-v1:0"
  | "us.anthropic.claude-sonnet-4-6"
  | "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
  | "us.anthropic.claude-sonnet-4-20250514-v1:0"
  | "us.anthropic.claude-haiku-4-5-20251001-v1:0"
  | "us.anthropic.claude-3-5-haiku-20241022-v1:0"

export type AnyModel = ClaudeModel | BedrockModel

export const DEFAULT_MODEL: ClaudeModel = "claude-sonnet-4-6"
export const DEFAULT_BEDROCK_MODEL: BedrockModel = "us.anthropic.claude-opus-4-7"

export const MODEL_LABELS: Record<ClaudeModel, string> = {
  "claude-opus-4-7": "Opus 4.7",
  "claude-sonnet-4-6": "Sonnet 4.6",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
}

export const BEDROCK_MODEL_LABELS: Record<BedrockModel, string> = {
  "us.anthropic.claude-opus-4-7": "Claude Opus 4.7",
  "us.anthropic.claude-opus-4-6-v1": "Claude Opus 4.6",
  "us.anthropic.claude-opus-4-5-20251101-v1:0": "Claude Opus 4.5",
  "us.anthropic.claude-sonnet-4-6": "Claude Sonnet 4.6",
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0": "Claude Sonnet 4.5",
  "us.anthropic.claude-sonnet-4-20250514-v1:0": "Claude Sonnet 4",
  "us.anthropic.claude-haiku-4-5-20251001-v1:0": "Claude Haiku 4.5",
  "us.anthropic.claude-3-5-haiku-20241022-v1:0": "Claude 3.5 Haiku",
}

export const BEDROCK_MODELS: BedrockModel[] = Object.keys(BEDROCK_MODEL_LABELS) as BedrockModel[]

export function isBedrockModel(m: string): m is BedrockModel {
  return m in BEDROCK_MODEL_LABELS
}

export const PRICING: Record<ClaudeModel, { input: number; output: number }> = {
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4.0 },
}

// ── Task planning lifecycle types ────────────────────────────────────────────

export interface TaskPlanStep {
  id: number
  label: string
  status: "pending" | "running" | "done" | "skipped" | "failed"
  result?: string
  requires_confirmation?: boolean
}

export interface TaskPlan {
  id: string
  created: string
  title: string
  status: "pending" | "approved" | "running" | "paused" | "done" | "failed"
  steps: TaskPlanStep[]
  context: Record<string, unknown>
}

// ── Interactive Form types ───────────────────────────────────────────────────

export interface FormFieldText {
  type: "text"
  id: string
  label: string
  placeholder?: string
  required?: boolean
  default?: string
}

export interface FormFieldRadio {
  type: "radio"
  id: string
  label: string
  options: Array<{ value: string; label: string }>
  default?: string
}

export interface FormFieldCheckbox {
  type: "checkbox"
  id: string
  label: string
  options: Array<{ value: string; label: string }>
  default?: string[]
}

export interface FormFieldSelect {
  type: "select"
  id: string
  label: string
  options: Array<{ value: string; label: string }>
  multiple?: boolean
  default?: string | string[]
}

export type FormField = FormFieldText | FormFieldRadio | FormFieldCheckbox | FormFieldSelect

export interface FormStep {
  id: string
  title: string
  description?: string
  fields: FormField[]
}

export interface InteractiveForm {
  id: string
  title: string
  steps: FormStep[]
}

export type FormResponse = Record<string, string | string[]>

// ── Mode types (Hand Mode / Brain Mode) ─────────────────────────────────────

export interface ActionApprovalPayload {
  actionId: string
  actionType: string
  target: string
  value?: string
  reasoning: string
  allowAlways?: boolean // show an "Always allow" option (MCP tools) → decision "allow_always"
}

export interface ReplayNetworkPayload {
  actionId: string
  actionType: string
  method: string
  url: string
  bodyPreview?: string
  reasoning: string
  originalStatus?: number
}

export interface BrainQuestion {
  id: string
  question: string
  type: "text" | "choice"
  options?: string[]
}

// ── MCP Server types ────────────────────────────────────────────────────────

export type AuthStatus = "ok" | "auth_required" | "none"

export interface OAuthConfig {
  auth_url: string
  token_url: string
  client_id: string
  scopes: string[]
  redirect_uri: string
}

export interface McpServerInfo {
  id: string
  name: string
  transport: "stdio" | "sse" | "http"
  connected: boolean
  authStatus: AuthStatus
  toolCount: number
  url?: string
  command?: string
  hasOAuth: boolean
  tokenExpiresAt?: string
  canRefresh?: boolean // a refresh_token is stored → token auto-refreshes before expiry
  enabled?: boolean // operator toggle; false → disabled (not connected, tools hidden)
  source?: string // "skill" | "user" | "marketplace"
  icon?: string | null // custom icon URL/data URI, or null when none (panel shows placeholder)
  missingSecrets?: string[] // $SECRET_ names the server needs that aren't set yet
  lastError?: string // last connect failure detail (e.g. server-side 400) — shown in the row
  config?: {
    args?: string[]
    headers?: Array<{ name: string; value: string }>
    envVars?: Array<{ name: string; value: string }>
    authType?: string
    discoveryUrl?: string
    authorizeUrl?: string
    tokenUrl?: string
    scopes?: string[]
  }
}

export interface McpToolInfo {
  serverId: string
  name: string
  description: string
}

// Authentication an operator can attach to a manually-added MCP server. Mirrors the
// native ConnectorAuthConfig: OAuth2 (with optional OIDC discovery_url to auto-fill
// endpoints) or a cli_command that prints a bearer token to stdout.
export interface McpAuthInput {
  type: "oauth2" | "cli_command"
  discovery_url?: string
  authorize_url?: string
  token_url?: string
  client_id?: string
  client_secret?: string
  scopes?: string[]
  redirect_uri?: string
  command?: string
  ttl_seconds?: number
}

// Read-only listing of a loaded skill (for the Settings "Loaded skills" view).
export interface SkillListItem {
  id: string
  name: string
  description: string
  icon?: string // URL, base64 data URI, or resolved path; falls back to robot
  autoActivate?: boolean
  pluginId?: string // set if this skill belongs to a plugin
  missingSecrets?: string[] // $SECRET_ names it references that aren't set yet
  disabled?: boolean // operator toggle; disabled → discovered but inert (MCP-parity)
  notificationChannel?: { id: string; name: string; sendAction: string } // skill registers as a NOTIFY channel
  commands?: Array<{ name: string; description: string; surfaces: string[]; prompt: string }> // skill-declared /shorthands
  settingsFile?: string // filename of a user-editable config → gear icon opens a YAML editor
  deletable?: boolean // true → under a user root/added folder → trash icon shown (built-ins protected)
}

export interface PluginListItem {
  id: string
  name: string
  description: string
  icon?: string
  skills: SkillListItem[] // the plugin's own skills, nested
  missingSecrets?: string[] // $SECRET_ names it references that aren't set yet
  disabled?: boolean // operator toggle; disabling a plugin disables all its skills
  deletable?: boolean // true → user-installed → trash icon shown (built-ins protected)
}

// One row in the headless execution queue view (running or pending).
export interface QueueJobItem {
  id: string
  kind: "schedule" | "background"
  status: "running" | "pending"
  prompt: string
  ageMs: number
  scheduleId?: string
}

export interface SecretInfo {
  id: number
  name: string
  description: string
  value: string
  created_at: string
  updated_at: string
}

// ── Multimodal message content ──────────────────────────────────────────────

export type MessageContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "document"; source: { type: "base64"; media_type: string; data: string }; title?: string }

export type MessageContent = string | MessageContentBlock[]

// Panel → Background (via port)
// ── Visual workflow design ─────────────────────────────────────────────────────

// One captured action (tier-1). Sent from the content-script picker to the panel.
export interface WorkflowCapture {
  action: string // CLICK|FILL|SELECT|GET_TEXT|NAVIGATE|… (suggested)
  label?: string // visible text / accessible name
  selector?: string // robust selector derived in the page
  value?: string // current value for inputs (template hint)
  textHint?: string // text used by FIND self-heal at run time
  url?: string // for NAVIGATE captures
  tag?: string // element tag
}

export interface WorkflowAction extends WorkflowCapture {
  saveAs?: string // GET_TEXT → {{var}}
  note?: string // per-action free text
}

// A test used by IF nodes and until/while loops.
export interface WorkflowCondition {
  text: string // natural-language condition
  selector?: string // element the test refers to
  exists?: boolean // true: present, false: absent
  expr?: string // e.g. "{{count}} > 0"
}

export interface WorkflowLoopSpec {
  mode: "forEach" | "until" | "while" | "times"
  maxCycles: number // required safety cap
  selector?: string // forEach: the collection
  var?: string // forEach: loop variable → {{var}}
  cond?: WorkflowCondition // until/while
  count?: string // times
}

// A step body is a tree of nodes: an action, or a control block (arbitrary nesting).
export type WorkflowNode =
  | { kind: "action"; action: WorkflowAction }
  | { kind: "if"; cond: WorkflowCondition; then: WorkflowNode[]; else?: WorkflowNode[]; note?: string }
  | { kind: "loop"; loop: WorkflowLoopSpec; body: WorkflowNode[]; note?: string }

export interface WorkflowStep {
  name: string
  note?: string
  nodes?: WorkflowNode[] // current model
  actions?: WorkflowAction[] // legacy flat model (auto-migrated on read)
}

export interface WorkflowInput {
  name: string
  type?: string
  required?: boolean
  default?: string
}

export interface WorkflowDef {
  id?: string
  name: string
  description: string
  domain: string
  start_url?: string | null
  inputs: WorkflowInput[]
  steps: WorkflowStep[]
  created?: string
  updated?: string | null
}

// Safety guardrail settings (mirror of native-host src/safety-config.ts SafetyConfig).
export interface SafetyConfig {
  maxIterations: number
  maxIterationsSubagent: number
  maxCostPerSessionUsd: number
  maxCostPerDayUsd: number
  maxCostPerWeekUsd: number
  maxCostPerMonthUsd: number
  largeResultThresholdBytes: number
  confirmConsequentialActions: boolean
  approveSkillMcpServers: boolean
  docReaderMaxSubagents: number
  docReaderChunkChars: number
  docReaderOverlapChars: number
  enableSubagents: boolean
  enableSemanticSearch: boolean
  enableSkillDb: boolean
  enableLoopResume: boolean
  enableVerifyLoop: boolean
  enableProactiveExplore: boolean
  autonomyRetryBudget: number
  enableSkillAutoAuthor: boolean
  enableThinking: boolean
  thinkingDuringTools: boolean
  thinkingBudgetTokens: number
  enableRemoteChat: boolean
}

export type PanelToWorker =
  | { type: "SEND_MESSAGE"; text: string; model: AnyModel; sessionId?: string } // text can be plain string or JSON-encoded ContentBlock[]
  | { type: "STOP_STREAM" }
  | { type: "GET_SETTINGS" }
  | { type: "SAVE_SETTINGS"; apiKey: string; model: AnyModel; awsRegion?: string; skillFolders?: string[] }
  | { type: "CLEAR_HISTORY" }
  | { type: "CLEAR_SESSION_CONTEXT"; sessionId?: string } // drop model context for the active tab, keep transcript
  | { type: "LOAD_CREDENTIAL_FROM_HOST" }
  | { type: "PROPOSALS_RESPONSE"; approved: string[]; rejected: string[]; dismissed?: boolean }
  | { type: "USER_RESPONSE"; text: string } // reply to a WAIT_FOR_USER prompt
  | { type: "PLAN_RESPONSE"; planId: string; approved: boolean }
  | { type: "MCP_LIST_SERVERS" }
  | { type: "LIST_SKILLS" }
  | { type: "SKILL_SET_ENABLED"; id: string; enabled: boolean }
  | { type: "PLUGIN_SET_ENABLED"; id: string; enabled: boolean }
  | { type: "DELETE_SKILL"; id: string }
  | { type: "DELETE_PLUGIN"; id: string }
  | { type: "OPEN_LINK"; url: string }
  | { type: "LIST_QUEUE" }
  // Deterministic /schedule read+modify (list/pause/resume/delete) — no LLM, mirrors the CLI.
  | { type: "SCHEDULE_COMMAND"; sub: string }
  | { type: "GET_SKILL_SETTINGS"; skillId: string }
  | { type: "SET_SKILL_SETTINGS"; skillId: string; content: string }
  | { type: "MCP_LIST_TOOLS" }
  | { type: "MCP_RECONNECT"; serverId?: string }
  | { type: "MCP_RESYNC"; serverId: string }
  | { type: "MCP_AUTHENTICATE"; serverId: string }
  | { type: "MCP_REFRESH_TOKEN"; serverId: string }
  | { type: "MCP_AUTH_REVOKE"; serverId: string }
  | {
      type: "MCP_ADD_SERVER"
      name: string
      transport: "stdio" | "sse" | "http"
      url?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
      authentication?: McpAuthInput
      id?: string
    }
  | { type: "MCP_DISCOVER_AUTH"; url: string }
  | { type: "GET_MCP_PROMPTS" }
  | { type: "MCP_SET_ENABLED"; serverId: string; enabled: boolean }
  | { type: "MCP_REMOVE_SERVER"; serverId: string }
  | { type: "GET_ACTIVE_TAB" }
  | { type: "NOTIFICATION_GET_CONFIG" }
  | { type: "NOTIFICATION_SET_CONFIG"; config: unknown }
  | { type: "NOTIFICATION_TEST"; channel?: string }
  | { type: "BACKGROUND_TASK"; task: string; model: AnyModel }
  | { type: "SET_TAB_HISTORY"; history: Array<{ role: string; content: string }> }
  | { type: "FORM_RESPONSE"; formId: string; data: FormResponse }
  | { type: "LOAD_TAB_CONTEXT"; query: string }
  | { type: "GET_PROVIDERS" }
  | { type: "SAVE_PROVIDER"; name: string; config: ProviderConfig }
  | { type: "GET_CONTROL_PLANE_CONFIG" }
  | { type: "VERIFY_CONTROL_PLANE" }
  | { type: "SAVE_HISTORY"; sessions: unknown }
  | { type: "LOAD_HISTORY" }
  | { type: "GET_MODES" }
  | { type: "SET_MODES"; handMode: boolean; brainMode: boolean }
  | { type: "GET_SAFETY" }
  | { type: "SET_SAFETY"; config: Partial<SafetyConfig> }
  | { type: "ACTION_APPROVAL_RESPONSE"; actionId: string; decision: "approve" | "deny" | "guide" | "queue" | "allow_always" }
  | { type: "BRAIN_QUESTIONS_RESPONSE"; questionId: string; answers: Record<string, string> }
  | { type: "GENERATE_TITLE"; sessionId: string; messages: Array<{ role: string; content: string }>; currentVersion: number }
  | { type: "GET_PENDING_INTERACTIONS" }
  | { type: "OPEN_FILE"; path: string }
  | { type: "OPEN_FOLDER"; path: string }
  | { type: "INSTALL_PACKAGE"; url: string }
  | { type: "LIST_INSTALLED" }
  | { type: "UPDATE_PACKAGE"; id: string }
  | { type: "UNINSTALL_PACKAGE"; id: string }
  | { type: "GET_STREAM_STATE"; tabId: number }
  | { type: "GET_SESSION_USAGE"; sessionId: string }
  | {
      type: "SET_ANSWER_FEEDBACK"
      sessionId: string
      seq: number
      feedback: "like" | "dislike" | null
      prompt?: string
      answer?: string
    }
  | { type: "GET_ANSWER_FEEDBACK"; sessionId: string }
  | { type: "DELETE_SESSION"; sessionId: string }
  | { type: "SECRETS_LIST" }
  | { type: "SECRETS_ADD"; name: string; description: string; value: string }
  | { type: "SECRETS_UPDATE"; name: string; description?: string; value?: string }
  | { type: "SECRETS_REMOVE"; name: string }
  | { type: "STOP_SUBAGENT"; agentId: string }
  | { type: "GET_HISTORY_SUGGESTIONS" }
  | { type: "GET_SESSION_MESSAGES"; sessionId: string }
  | { type: "WF_PICKER_START" }
  | { type: "WF_PICKER_STOP" }
  | { type: "WF_HIGHLIGHT"; selector: string }
  | { type: "LIST_WORKFLOWS"; domain?: string }
  | { type: "GET_WORKFLOW"; workflowId: string }
  | { type: "EXPORT_WORKFLOW"; workflowId: string }
  | { type: "IMPORT_WORKFLOW"; yaml: string }
  | { type: "SAVE_WORKFLOW"; workflow: WorkflowDef }
  | { type: "DELETE_WORKFLOW"; workflowId: string }
  | { type: "RUN_WORKFLOW"; workflowId: string; inputs?: Record<string, string> }

// ── Generic UI block types — emitted by skills via RENDER_BLOCK ────────────────
// Any skill can emit these. The panel renders them in the chat stream.

export interface ProposalItem {
  id: string
  label: string // row label (e.g. invoice line item name)
  current: string | null // current value (null = not set)
  proposed: string // proposed new value
  reasoning: string // why this change is suggested
  approved: boolean | null // null = pending, true = approved, false = rejected
}

export interface PlanStep {
  id: string
  label: string
  status: "pending" | "running" | "done" | "error"
  detail?: string
}

// Skills emit RENDER_BLOCK messages; the panel inserts them into the chat stream
export type RenderBlock =
  | { kind: "proposals"; title?: string; items: ProposalItem[] }
  | { kind: "plan"; title?: string; steps: PlanStep[] }
  | { kind: "table"; title?: string; columns: string[]; rows: string[][] }
  | { kind: "downloads"; title?: string; files: Array<{ name: string; path: string; type: string }> }
  | { kind: "generated-file"; file: { name: string; path: string; type: string } }
  | { kind: "chart"; title?: string; chartType: "bar" | "line" | "pie"; data: Record<string, unknown> }
  | { kind: "info"; title?: string; body: string }
  | { kind: "followups"; suggestions: string[] } // clickable next-step chips (skill-code parity with the ```followups fence)
  | { kind: "variations"; tabs: Array<{ label: string; content: string }> }
  | {
      kind: "map"
      title?: string
      center?: [number, number] // [lat, lng]
      zoom?: number
      bbox?: [number, number, number, number] // [south, west, north, east] — auto-fit
      markers?: Array<{ lat: number; lng: number; label?: string; color?: string }>
      zones?: Array<{
        polygon?: Array<[number, number]> // [[lat, lng], ...]
        geojson?: unknown // GeoJSON Feature/Geometry (Polygon/MultiPolygon)
        color?: string // stroke
        fillColor?: string
        fillOpacity?: number
        label?: string
      }>
    }

// Background → Panel (via port)
export type WorkerToPanel =
  | { type: "STREAM_CHUNK"; delta: string; tabId?: number | null }
  | {
      type: "SESSION_USAGE"
      sessionId?: string
      input_tokens?: number
      output_tokens?: number
      cost?: number
      context_used?: number
      context_total?: number
    }
  | { type: "ANSWER_FEEDBACK"; sessionId: string; rows: Array<{ seq: number; feedback: "like" | "dislike" }> }
  | { type: "THINKING_CHUNK"; delta: string; tabId?: number | null }
  | { type: "STREAM_VERIFY"; state?: "verifying" | "verified" | "unverified"; tabId?: number | null }
  | { type: "STREAM_DONE"; inputTokens: number; outputTokens: number; tabId?: number | null }
  | { type: "STREAM_ERROR"; error: string; tabId?: number | null }
  | { type: "STREAM_RESET"; tabId?: number | null } // mid-stream retry: clear the in-flight bubble
  | { type: "TAB_CHANGED"; tabId: number; url?: string; title?: string }
  | { type: "ACTIVE_TAB"; tabId: number; url: string; title: string }
  | { type: "SETTINGS"; apiKey: string; model: AnyModel; awsRegion?: string; skillFolders?: string[] }
  | { type: "CREDENTIAL_LOADED"; credential: string; source: string }
  | { type: "CREDENTIAL_ERROR"; error: string }
  | { type: "PAGE_SNAPSHOT"; screenshotDataUrl: string; url: string; title: string }
  | { type: "RENDER_BLOCK"; block: RenderBlock; tabId?: number } // generic UI renderer (tabId = owning tab, for gating)
  | { type: "WAIT_FOR_USER_PROMPT"; message: string } // Claude paused, needs human action
  | { type: "WAIT_FOR_USER_DONE" } // Claude resumed, clear banner
  | { type: "PLAN_CREATED"; plan: TaskPlan } // plan awaiting approval
  | { type: "PLAN_STEP_UPDATE"; planId: string; stepId: number; status: string; result?: string }
  | { type: "PLAN_COMPLETE"; planId: string; summary: string }
  | { type: "USER_MESSAGE_INJECTED"; text: string } // user sent msg during active loop
  | { type: "MCP_SERVERS"; servers: McpServerInfo[] }
  | { type: "SKILLS_LIST"; skills: SkillListItem[]; plugins: PluginListItem[] }
  | { type: "SKILL_SETTINGS"; skillId: string; settingsFile?: string; content?: string; ok: boolean; detail?: string }
  | { type: "SKILL_SETTINGS_SAVED"; ok: boolean; detail?: string }
  | { type: "SKILL_DELETED"; ok: boolean; id: string; kind: "skill" | "plugin"; detail?: string; removedMcpServerIds?: string[] }
  | { type: "QUEUE_LIST"; jobs: QueueJobItem[] }
  // Result of a deterministic /schedule command → rendered as a finished assistant bubble.
  | { type: "SCHEDULE_RESULT"; markdown: string; assistantId?: string }
  | { type: "MCP_TOOLS"; tools: McpToolInfo[] }
  | { type: "MCP_RECONNECT_RESULT"; ok: boolean; servers: McpServerInfo[] }
  | { type: "MCP_AUTH_RESULT"; serverId: string; success: boolean; error?: string; servers: McpServerInfo[] }
  | { type: "MCP_SERVER_ADDED"; ok: boolean; error?: string; servers: McpServerInfo[] }
  | { type: "MCP_SERVER_REMOVED"; ok: boolean; error?: string; servers: McpServerInfo[] }
  | { type: "MCP_PROMPTS"; prompts: Array<{ serverId: string; name: string; description?: string }> }
  | {
      type: "MCP_AUTH_DISCOVERED"
      ok: boolean
      error?: string
      issuer?: string
      authorization_endpoint?: string
      token_endpoint?: string
      registration_endpoint?: string
      scopes_supported?: string[]
      dcrSupported?: boolean
    }
  | { type: "SECRETS_DATA"; secrets: SecretInfo[] }
  | { type: "SECRETS_SAVED"; ok: boolean; error?: string; secrets: SecretInfo[] }
  | { type: "SECRETS_REMOVED"; ok: boolean; error?: string; secrets: SecretInfo[] }
  | { type: "NOTIFICATION_CONFIG"; config: unknown }
  | { type: "NOTIFICATION_SAVED" }
  | { type: "NOTIFICATION_TEST_RESULT"; ok: boolean }
  | { type: "BACKGROUND_DONE"; tabId?: number | null; title: string; result: string }
  | { type: "INTERACTIVE_FORM"; form: InteractiveForm }
  | { type: "INTERACTIVE_PROPOSALS"; title?: string; items: ProposalItem[] }
  | { type: "TAB_CONTEXT_LOADED"; tabTitle: string; tabUrl: string; messages: Array<{ role: string; content: string }> }
  | { type: "TAB_CONTEXT_NOT_FOUND"; query: string }
  | { type: "ACTIVE_PLUGIN"; pluginId: string; pluginName: string }
  | { type: "PROVIDERS_LIST"; providers: Record<string, ProviderConfig> }
  | { type: "PROVIDER_SAVED"; name: string }
  | { type: "MODES_STATE"; handMode: boolean; brainMode: boolean }
  | { type: "SAFETY_STATE"; config: SafetyConfig }
  | { type: "ACTION_APPROVAL_REQUEST"; actionId: string; action: ActionApprovalPayload }
  | { type: "REPLAY_NETWORK_APPROVAL_REQUEST"; actionId: string; action: ReplayNetworkPayload }
  | { type: "BRAIN_QUESTIONS_REQUEST"; questionId: string; questions: BrainQuestion[] }
  | { type: "ACTION_QUEUED"; actionId: string; summary: string }
  | { type: "TITLE_UPDATED"; sessionId: string; title: string; titleVersion: number }
  | {
      type: "STREAM_STATE"
      tabId: number
      streaming: boolean
      content: string
      thinking: string
      actions: string[]
      steps?: string[]
      userMessage: string
      error?: string
      renderBlocks?: RenderBlock[]
      verifyState?: "verifying" | "verified" | "unverified"
    }
  | {
      type: "SUBAGENT_STARTED"
      loopId: string
      agentId: string
      subagentId: string
      name: string
      model?: string
      prompt?: string
      parentAgentId?: string // set when a worker spawned this one (nested) — for indented rendering + stop cascade
      depth?: number // 1 = spawned by the orchestrator; 2 = spawned by a worker
    }
  | { type: "SUBAGENT_PROGRESS"; loopId: string; agentId: string; turn: number; maxTurns: number; lastAction?: string }
  | { type: "SUBAGENT_STEP"; loopId: string; agentId: string; step: string }
  | { type: "SUBAGENT_ACTION"; loopId: string; agentId: string; action: string; input: string; ok: boolean }
  | { type: "SUBAGENT_DONE"; loopId: string; agentId: string; ok: boolean; summary: string; durationMs: number }
  | { type: "SUBAGENT_GROUP_STARTED"; loopId: string; groupId: string; agents: Array<{ subagentId: string; name: string }> }
  | { type: "SUBAGENT_GROUP_DONE"; loopId: string; groupId: string; results: Array<{ subagentId: string; ok: boolean; summary: string }> }
  | {
      type: "USAGE_UPDATE"
      cost?: number
      inputTokens?: number
      outputTokens?: number
      provider?: string
      contextUsed?: number
      contextTotal?: number
    }
  | { type: "WORKFLOWS_LIST"; workflows: WorkflowDef[]; error?: string }
  | { type: "WORKFLOW"; workflow: WorkflowDef | null; error?: string }
  | { type: "WORKFLOW_EXPORTED"; yaml: string; filename: string; workflowId: string; error?: string }
  | { type: "WORKFLOW_IMPORTED"; imported: Array<{ id: string; name: string }>; errors: string[] }
  | { type: "WORKFLOW_SAVED"; workflow: WorkflowDef | null; error?: string }
  | { type: "WORKFLOW_DELETED"; workflowId: string }
  | { type: "WF_ELEMENT_PICKED"; capture: WorkflowCapture; tabId?: number }
  | { type: "WF_NAVIGATED"; url: string; tabId?: number }

export type InteractionBlock =
  | { kind: "plan"; plan: TaskPlan; resolved?: "approved" | "rejected" | "expired" }
  | { kind: "form"; form: InteractiveForm; resolved?: "submitted" | "expired" }
  | { kind: "approval"; action: ActionApprovalPayload; resolved?: "approve" | "guide" | "queue" | "expired" }
  | { kind: "replay-network"; payload: ReplayNetworkPayload; resolved?: "approve" | "deny" | "expired" }
  | { kind: "brain-questions"; questionId: string; questions: BrainQuestion[]; resolved?: "answered" | "expired" }
  | { kind: "proposals"; title?: string; items: ProposalItem[]; resolved?: "submitted" | "dismissed" | "expired" }

export interface ChatEntry {
  id: string
  role: "user" | "assistant"
  content: string
  thinking?: string
  streaming?: boolean
  error?: boolean // render as a failed turn (red flag + retry affordance)
  interrupted?: boolean // user stopped the loop — render a red "Agent Interrupted by User…" notice

  renderBlock?: RenderBlock
  // Render blocks emitted by skill code DURING this assistant turn (e.g. MAP_SEARCH),
  // rendered inside the bubble under the answer text. Distinct from `renderBlock`
  // (a standalone entry), which is only used when no stream was active.
  renderBlocks?: RenderBlock[]
  interactionBlock?: InteractionBlock
  actions?: string[]
  steps?: string[]
  // Answer self-check state — a transient footer chip on THIS assistant bubble. "verifying"
  // while the silent claim-check runs, "verified" (permanent ✓) once it passes. The "unverified"
  // path never lingers on the bubble: the host collapses that answer to a step and continues the
  // loop, so a lasting ✗ chip isn't rendered here (see agent.ts emitVerify + ChatBubble chip).
  verifyState?: "verifying" | "verified" | "unverified"
  // User's like/dislike grade on this assistant answer (persisted to the DB for later grading).
  feedback?: "like" | "dislike" | null
}

// Is this an assistant bubble with NOTHING worth keeping — no text, thinking, actions, steps, or
// any block? Used to prune a leftover blank streaming bubble WITHOUT discarding a mid-loop bubble
// that has already accumulated steps/actions (the bug where injecting a prompt mid-turn wiped the
// previous bubble's "N steps"/"N actions"). A bubble is droppable ONLY if every signal is empty.
export function isEmptyAssistantBubble(m: ChatEntry): boolean {
  return (
    m.role === "assistant" &&
    !m.content &&
    !m.thinking &&
    !m.actions?.length &&
    !m.steps?.length &&
    !m.interactionBlock &&
    !m.renderBlock &&
    !m.renderBlocks?.length
  )
}

export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cost: number
}

export function calcCost(model: AnyModel, input: number, output: number): number {
  const p = PRICING[model as ClaudeModel]
  if (!p) return 0 // Bedrock billed via AWS
  return (input * p.input + output * p.output) / 1_000_000
}

// ── Multi-provider types ────────────────────────────────────────────────────

export type ProviderType = "anthropic" | "bedrock" | "openai" | "google" | "mistral" | "kimi" | "vercel" | "managed" | "llamacpp" | "ollama"
export type ModelRole = "orchestrator" | "coding" | "profile" | "skills"

export interface ProviderModels {
  orchestrator: string
  coding: string
  profile: string
  skills: string
}

export interface ProviderConfig {
  type: ProviderType
  apiKey: string
  models: ProviderModels
  baseUrl?: string
  region?: string
  // For gateway-style providers (vercel/managed/llamacpp/ollama): the fixed model list
  // from the gateways table, sent by the native host on GET_PROVIDERS.
  supportedModels?: string[]
  // For the ollama gateway: which of its models is the vision sidecar (captions
  // screenshots for a text-only orchestrator). Surfaced so the UI can mark it.
  visionModel?: string
}

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  anthropic: "Claude",
  bedrock: "AWS Bedrock",
  openai: "OpenAI",
  google: "Google",
  mistral: "Mistral",
  kimi: "Kimi",
  vercel: "Vercel Gateway",
  managed: "Tulzo Managed",
  llamacpp: "llama.cpp",
  ollama: "Ollama",
}
