// Pure helper: merge MCP-server prompts into the composer's ghost-autocomplete
// suggestions. Kept here (shared, tested) so the panel and any other caller compute
// identical suggestions. A server prompt is surfaced as its `name`, decorated with
// its `[serverId]`, so the operator sees which live server offers it. Matching is by
// name / description / serverId against the typed prefix (case-insensitive).

export interface McpPromptSuggestion {
  serverId: string
  name: string
  description?: string
}

// Returns suggestion strings for the given prefix. Each is "<name>  [serverId]" so it
// renders as a normal ghost line but is visibly attributed. Blank/short prefix → [].
export function mcpPromptGhostMatches(prefix: string, prompts: McpPromptSuggestion[]): string[] {
  const q = prefix.trim().toLowerCase()
  if (q.length < 2) return []
  return prompts
    .filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q) || p.serverId.toLowerCase().includes(q),
    )
    .map((p) => `${p.name}  [${p.serverId}]`)
}
