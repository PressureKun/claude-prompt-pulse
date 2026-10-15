export type AgentState = 'run' | 'ok' | 'err'

// What a lane was busy with over a stretch of time; drawn as one colored run.
export type SpanKind = 'tool' | 'mcp' | 'skill' | 'agent'

export type Span = {
  id: string
  // 'main' or the spawning Agent call's tool_use_id
  lane: string
  kind: SpanKind
  // the tool, the MCP server, or the skill
  name: string
  isError?: boolean
  t0: number
  t1?: number
}

export type AgentEntry = {
  toolUseId: string
  agentId?: string
  type: string
  description: string
  state: AgentState
  t0: number
  t1?: number
}

// Tokens a lane spent: input counts cache reads and writes too.
export type Tokens = { in: number; out: number }

export type Run = {
  startedAt: number
  endedAt?: number
  // the main turn's own duration, as the transcript's closing line shows it
  durationMs?: number
  outcome?: 'answer' | 'aborted' | 'refusal' | 'error'
  agents: AgentEntry[]
  spans: Span[]
  current?: string
  tokens: Record<string, Tokens>
  // the session's cost in USD when the turn began, and as last read
  costAtStart?: number
  costNow?: number
}

export type Prefs = {
  // the live band above the prompt
  band: boolean
  // the finished timeline under each turn in the transcript
  history: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'prompt-pulse': { run: Run | null; now: number; history: Run[]; prefs: Prefs }
  }
}
