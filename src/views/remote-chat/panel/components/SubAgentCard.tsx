import React, { useEffect, useRef } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

export interface SubAgentEntry {
  agentId: string
  subagentId: string
  name: string
  status: "running" | "done" | "error"
  turn?: number
  maxTurns?: number
  lastAction?: string
  summary?: string
  durationMs?: number
  ok?: boolean
  loopId?: string
  groupId?: string
  model?: string
  prompt?: string
  parentAgentId?: string // set when a worker spawned this one → rendered nested under the parent
  depth?: number // 1 = spawned by the orchestrator; 2 = spawned by a worker (nested)
  steps: string[]
  actions: Array<{ action: string; input: string; ok: boolean }>
}

export interface SubAgentGroup {
  groupId: string
  loopId: string
  agents: Array<{ subagentId: string; name: string }>
  done?: boolean
  results?: Array<{ subagentId: string; ok: boolean; summary: string }>
}

interface Props {
  agents: SubAgentEntry[]
  groups: SubAgentGroup[]
  onStop?: (agentId: string) => void
}

function AgentRow({ a, onStop }: { a: SubAgentEntry; onStop?: (id: string) => void }) {
  const stepsRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (stepsRef.current) stepsRef.current.scrollTop = stepsRef.current.scrollHeight
  }, [a.steps.length])
  useEffect(() => {
    if (actionsRef.current) actionsRef.current.scrollTop = actionsRef.current.scrollHeight
  }, [a.actions.length])

  return (
    <div className={`subagent-row subagent-${a.status}`}>
      <span className="subagent-icon">{a.status === "running" ? "◐" : a.ok ? "✓" : "✗"}</span>
      <span className="subagent-name">{a.name}</span>
      <span className="subagent-detail">
        {a.status === "running" && a.turn
          ? `(turn ${a.turn}/${a.maxTurns})`
          : a.status === "done" && a.durationMs
            ? `(${(a.durationMs / 1000).toFixed(1)}s)`
            : ""}
      </span>
      {a.status === "running" && onStop && (
        <button className="subagent-stop" onClick={() => onStop(a.agentId)} title="Stop sub-agent">
          &#9632;
        </button>
      )}

      {/* Model + the orchestrator's request. Collapsed by default; the request can be long so it
          scrolls inside the details body (CSS clamps width + wraps — never overflows the card). */}
      {(a.model || a.prompt) && (
        <details className="subagent-meta">
          <summary>
            {a.model && <span className="subagent-model">Model: {a.model}</span>}
            {a.prompt && (
              <span className="subagent-request-preview">
                {" "}
                · Request: {a.prompt.split("\n")[0].slice(0, 60)}
                {a.prompt.length > 60 ? "…" : ""}
              </span>
            )}
          </summary>
          {a.prompt && (
            <div className="subagent-request-full" tabIndex={0} role="group" aria-label="Sub-agent request">
              {a.prompt}
            </div>
          )}
        </details>
      )}

      {/* Live current step shown in full with formatting */}
      {a.status === "running" && a.steps.length > 0 && (
        <div className="subagent-current-step">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{a.steps[a.steps.length - 1]}</ReactMarkdown>
        </div>
      )}

      {a.steps.length > (a.status === "running" ? 1 : 0) && (
        <details className="subagent-steps-collapsed">
          <summary>
            {"▸"} {a.steps.length - (a.status === "running" ? 1 : 0)}{" "}
            {a.steps.length - (a.status === "running" ? 1 : 0) === 1 ? "step" : "steps"}
          </summary>
          <div className="subagent-steps-body" ref={stepsRef} tabIndex={0} role="group" aria-label="Sub-agent steps">
            {(a.status === "running" ? a.steps.slice(0, -1) : a.steps).map((s, i) => (
              <details key={i} className="subagent-step-item">
                <summary>
                  <span className="subagent-step-num">{i + 1}</span>
                  <span className="subagent-step-title">{s.split("\n")[0].slice(0, 80)}</span>
                </summary>
                <div className="subagent-step-full">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{s}</ReactMarkdown>
                </div>
              </details>
            ))}
          </div>
        </details>
      )}

      {a.actions.length > 0 && (
        <details className="subagent-actions-collapsed">
          <summary>
            {"▸"} {a.actions.length} {a.actions.length === 1 ? "action" : "actions"}
          </summary>
          <div className="subagent-actions-body" ref={actionsRef} tabIndex={0} role="group" aria-label="Sub-agent actions">
            {a.actions.map((act, i) => (
              <details key={i} className={`subagent-action-item ${act.ok ? "" : "failed"}`}>
                <summary>
                  <span className="subagent-action-num">{i + 1}</span>
                  <span className="subagent-action-title">
                    {act.action} {act.input.slice(0, 60)}
                    {act.input.length > 60 ? "…" : ""} → {act.ok ? "✓" : "✗"}
                  </span>
                </summary>
                <div className="subagent-action-full">
                  {act.action} {act.input} → {act.ok ? "✓" : "✗"}
                </div>
              </details>
            ))}
          </div>
        </details>
      )}

      {a.summary && <div className="subagent-summary">{a.summary}</div>}
    </div>
  )
}

// Render an agent and, indented beneath it, any agents it spawned (parentAgentId === a.agentId),
// recursively. A coordinator worker that SPAWN_SUBAGENTs capability skills shows them nested.
function AgentSubtree({
  a,
  childrenOf,
  onStop,
  depth,
}: {
  a: SubAgentEntry
  childrenOf: Map<string, SubAgentEntry[]>
  onStop?: (id: string) => void
  depth: number
}) {
  const kids = childrenOf.get(a.agentId) ?? []
  return (
    <>
      <AgentRow a={a} onStop={onStop} />
      {kids.length > 0 && (
        <div className="subagent-children" role="group" aria-label={`Sub-agents spawned by ${a.name}`}>
          {kids.map((k) => (
            <AgentSubtree key={k.agentId} a={k} childrenOf={childrenOf} onStop={onStop} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  )
}

export function SubAgentCard({ agents, groups, onStop }: Props) {
  if (agents.length === 0) return null

  const groupedAgentIds = new Set(groups.flatMap((g) => agents.filter((a) => a.groupId === g.groupId).map((a) => a.agentId)))

  // Index children by parent for nested rendering. An agent is a "child" only if its parent is
  // present in this list; otherwise it's a top-level row (defensive against a missing parent).
  const byId = new Map(agents.map((a) => [a.agentId, a]))
  const childrenOf = new Map<string, SubAgentEntry[]>()
  for (const a of agents) {
    if (a.parentAgentId && byId.has(a.parentAgentId)) {
      const arr = childrenOf.get(a.parentAgentId) ?? []
      arr.push(a)
      childrenOf.set(a.parentAgentId, arr)
    }
  }
  const isChild = (a: SubAgentEntry) => !!(a.parentAgentId && byId.has(a.parentAgentId))
  // Ungrouped, top-level (non-child) agents; children render nested under them.
  const ungroupedRoots = agents.filter((a) => !groupedAgentIds.has(a.agentId) && !isChild(a))

  return (
    <div className="subagent-card">
      <div className="subagent-header">Sub-agents</div>

      {/* Grouped agents */}
      {groups.map((g) => {
        const groupAgents = agents.filter((a) => a.groupId === g.groupId)
        if (groupAgents.length === 0) return null
        const doneCount = groupAgents.filter((a) => a.status !== "running").length
        const allDone = doneCount === groupAgents.length
        return (
          <div key={g.groupId} className={`subagent-group ${allDone ? "subagent-group-done" : ""}`}>
            <div className="subagent-group-header">
              <span className="subagent-group-icon">{allDone ? "✓" : "◐"}</span>
              <span>Parallel ({groupAgents.length})</span>
              <span className="subagent-group-progress">
                {doneCount}/{groupAgents.length} done
              </span>
            </div>
            {groupAgents.map((a) => (
              <AgentSubtree key={a.agentId} a={a} childrenOf={childrenOf} onStop={onStop} depth={1} />
            ))}
          </div>
        )
      })}

      {/* Ungrouped agents (with nested children) */}
      {ungroupedRoots.map((a) => (
        <AgentSubtree key={a.agentId} a={a} childrenOf={childrenOf} onStop={onStop} depth={1} />
      ))}
    </div>
  )
}
