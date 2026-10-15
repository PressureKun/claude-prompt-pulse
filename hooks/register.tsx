import { atom, read, update } from 'claude-code'
import type { Color, ElementTable, EngineInterface, Register, Timer, TurnUsage } from 'claude-code'

import type { AgentEntry, AgentState, Prefs, Run, Span, SpanKind, Tokens } from '../types'

const run = atom({ plugin: 'prompt-pulse', key: 'run' } as const, null)
const now = atom({ plugin: 'prompt-pulse', key: 'now' } as const, 0)
const history = atom({ plugin: 'prompt-pulse', key: 'history' } as const, [])
const prefs = atom({ plugin: 'prompt-pulse', key: 'prefs' } as const, { band: true, history: true })

const PREFS_KEY = 'prefs'
const SPIN = ['◐', '◓', '◑', '◒']
const MAX_TOOLS = 4
const MAX_MCP = 5
const MAX_AGENT_ROWS = 5
const MAX_SPANS = 400
const MAX_HISTORY = 50
const LABEL = 9
// Engine plumbing, not work on the task: kept off the counts on the right.
const QUIET = new Set(['ToolSearch', 'TaskStop', 'TaskOutput'])
// Long built-in agent types, shortened for the lane label.
const ALIAS: Record<string, string> = {
  'general-purpose': 'general',
  'statusline-setup': 'statusline',
  'claude-code-guide': 'guide',
}

// Raw colors: theme keys for tool and MCP come out near-identical in many themes.
export const KIND_COLOR: Record<SpanKind | 'err', Color> = {
  tool: '#5fafff',
  mcp: '#d75fd7',
  skill: '#ffd75f',
  agent: 'claude',
  err: 'error',
}
// Higher wins when several spans share one cell.
const PRIORITY: Record<Cell, number> = { off: -1, idle: 0, tool: 1, agent: 2, skill: 3, mcp: 4, err: 5 }

// Bookkeeping must never break the turn it observes. A finished run lives on
// in the history too, so a background agent's end reaches its drawing there.
async function edit($: EngineInterface, fn: (r: Run) => Run): Promise<void> {
  try {
    let after: Run | null = null
    await update($, run, r => (after = r === null ? r : fn(r)))
    const done = after as Run | null
    if (done !== null && done.endedAt !== undefined) {
      await update($, history, list => list.map(h => (h.startedAt === done.startedAt ? done : h)))
    }
  } catch {
    // ignore
  }
}

async function sessionCost($: EngineInterface): Promise<number | undefined> {
  try {
    return (await $.session.usage()).cost?.usd
  } catch {
    return undefined
  }
}

function setAgent(r: Run, match: (a: AgentEntry) => boolean, fn: (a: AgentEntry) => AgentEntry): Run {
  return { ...r, agents: r.agents.map(a => (match(a) ? fn(a) : a)) }
}

function finishAgent(r: Run, match: (a: AgentEntry) => boolean, state: AgentState, t: number): Run {
  return setAgent(r, a => match(a) && a.state === 'run', a => ({ ...a, state, t1: t }))
}

function addTokens(r: Run, lane: string, usage: TurnUsage | undefined): Run {
  if (usage === undefined) return r
  const was = r.tokens[lane] ?? { in: 0, out: 0 }
  const got: Tokens = {
    in: was.in + usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens,
    out: was.out + usage.output_tokens,
  }
  return { ...r, tokens: { ...r.tokens, [lane]: got } }
}

// mcp__plugin_figma_figma__get_x → figma, mcp__claude_ai_Sentry__y → Sentry
export function mcpServer(tool: string): string {
  const server = tool.split('__')[1] ?? tool
  return server.replace(/^plugin_([^_]+)_.*$/, '$1').replace(/^claude_ai_/, '')
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export function tokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function usd(n: number): string {
  return n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`
}

function kindOf(tool: string): SpanKind {
  if (tool.startsWith('mcp__')) return 'mcp'
  if (tool === 'Skill') return 'skill'
  if (tool === 'Agent') return 'agent'
  return 'tool'
}

function pad(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n)
}

export type Cell = SpanKind | 'err' | 'idle' | 'off'

// The time axis, not linear: cut at every moment something started or ended,
// each piece as wide as log(its length) plus a floor, so a two-minute wait
// shrinks and an instant call still gets a cell of its own. Shared by every
// lane, so what ran side by side lines up. Returns width + 1 cell edges.
const LOG_UNIT_MS = 500
const MIN_PIECE = 0.6

export function axis(points: number[], from: number, to: number, width: number): number[] {
  const cuts = [...new Set([from, to, ...points.filter(t => t > from && t < to)])].sort((x, y) => x - y)
  const weights = cuts.slice(1).map((t, i) => Math.log1p((t - (cuts[i] ?? t)) / LOG_UNIT_MS) + MIN_PIECE)
  const total = weights.reduce((sum, w) => sum + w, 0)
  const edges: number[] = [from]
  let piece = 0
  let before = 0
  for (let k = 1; k < width; k++) {
    const target = (k * total) / width
    while (piece < weights.length - 1 && before + (weights[piece] ?? 0) < target) {
      before += weights[piece] ?? 0
      piece += 1
    }
    const t0 = cuts[piece] ?? from
    const t1 = cuts[piece + 1] ?? to
    const share = Math.min(1, Math.max(0, (target - before) / (weights[piece] ?? 1)))
    edges.push(t0 + (t1 - t0) * share)
  }
  edges.push(to)
  return edges
}

// Where the axis is cut: every start and end, an instant call widened to 1ms
// so it gets a piece of its own.
export function pointsOf(spans: Span[], agents: { t0: number; t1?: number }[]): number[] {
  return [
    ...spans.flatMap(s => (s.t1 === undefined ? [s.t0] : [s.t0, Math.max(s.t1, s.t0 + 1)])),
    ...agents.flatMap(a => (a.t1 === undefined ? [a.t0] : [a.t0, a.t1])),
  ]
}

export function linear(from: number, to: number, width: number): number[] {
  return Array.from({ length: width + 1 }, (_, k) => from + ((to - from) * k) / width)
}

// One cell per pair of edges: the busiest kind in it, idle while the lane is
// alive, or nothing outside the lane's life.
export function cells(spans: Span[], lane: string, edges: number[], life: [number, number]): Cell[] {
  const to = edges[edges.length - 1] ?? 0
  const own = spans.filter(s => s.lane === lane)
  const out: Cell[] = []
  for (let i = 0; i < edges.length - 1; i++) {
    const a = edges[i] ?? 0
    const b = Math.max(edges[i + 1] ?? a, a + 1)
    if (life[1] <= a || life[0] >= b) {
      out.push('off')
      continue
    }
    let best: Cell = 'idle'
    for (const s of own) {
      const kind: Cell = s.isError ? 'err' : s.kind
      if (s.t0 < b && Math.max(s.t1 ?? to, s.t0 + 1) > a && PRIORITY[kind] > PRIORITY[best]) {
        best = kind
      }
    }
    out.push(best)
  }
  return out
}

// What a lane did, grouped: tools by name, MCP by server, skills, errors.
export type Tally = {
  total: number
  tools: [string, number][]
  mcp: [string, number][]
  skills: string[]
  errors: number
}

export function tally(spans: Span[], lane: string): Tally {
  const tools = new Map<string, number>()
  const mcp = new Map<string, number>()
  const skills: string[] = []
  let total = 0
  let errors = 0
  for (const s of spans) {
    if (s.lane !== lane || s.kind === 'agent' || QUIET.has(s.name)) continue
    total += 1
    if (s.isError) errors += 1
    if (s.kind === 'tool') tools.set(s.name, (tools.get(s.name) ?? 0) + 1)
    else if (s.kind === 'mcp') mcp.set(s.name, (mcp.get(s.name) ?? 0) + 1)
    else if (!skills.includes(s.name)) skills.push(s.name)
  }
  const byCount = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])
  return { total, tools: byCount(tools), mcp: byCount(mcp), skills, errors }
}

function counted(entries: [string, number][], limit: number): string {
  const shown = entries.slice(0, limit).map(([k, n]) => (n > 1 ? `${k}×${n}` : k))
  const rest = entries.length - limit
  return shown.join(' ') + (rest > 0 ? ` +${rest}` : '')
}

// The lanes of one run: main first, then each subagent, on one shared axis.
// Drawn live above the prompt and, once the turn is over, under its line in
// the transcript.
export function Timeline(el: Pick<ElementTable, 'Box' | 'Text'>, r: Run, t: number, columns: number) {
  const { Box, Text } = el
  const isDone = r.endedAt !== undefined
  const end = Math.max(r.endedAt ?? t, ...r.agents.map(a => a.t1 ?? t))
  const width = Math.max(10, Math.min(40, columns - 60))
  const edges = axis(pointsOf(r.spans, r.agents), r.startedAt, end, width)

  const bar = (lane: string, life: [number, number]) => {
    const runs: { cell: Cell; n: number }[] = []
    for (const c of cells(r.spans, lane, edges, life)) {
      const last = runs[runs.length - 1]
      if (last !== undefined && last.cell === c) last.n += 1
      else runs.push({ cell: c, n: 1 })
    }
    return (
      <Text>
        <Text dimColor>▕</Text>
        {runs.map(x =>
          x.cell === 'off' ? (
            <Text>{' '.repeat(x.n)}</Text>
          ) : x.cell === 'idle' ? (
            <Text dimColor>{'━'.repeat(x.n)}</Text>
          ) : (
            <Text color={KIND_COLOR[x.cell]}>{'█'.repeat(x.n)}</Text>
          ),
        )}
        <Text dimColor>▏</Text>
      </Text>
    )
  }

  // The right-hand side of a lane: count, tools, MCP, skills, errors, each in
  // its bar color, then what it spent.
  const chips = (lane: string, tail?: string) => {
    const x = tally(r.spans, lane)
    const tk = r.tokens[lane]
    return (
      <Text>
        <Text dimColor>{`${x.total}× `}</Text>
        {x.tools.length > 0 ? <Text color={KIND_COLOR.tool}>{`${counted(x.tools, MAX_TOOLS)} `}</Text> : null}
        {x.mcp.length > 0 ? <Text color={KIND_COLOR.mcp}>{`⬡ ${counted(x.mcp, MAX_MCP)} `}</Text> : null}
        {x.skills.length > 0 ? <Text color={KIND_COLOR.skill}>{`✦ ${x.skills.join(' ')} `}</Text> : null}
        {x.errors > 0 ? <Text color={KIND_COLOR.err}>{`⚠ ${x.errors} `}</Text> : null}
        {tk !== undefined ? <Text dimColor>{`↑${tokens(tk.in)} ↓${tokens(tk.out)} `}</Text> : null}
        {tail !== undefined ? <Text dimColor>{tail}</Text> : null}
      </Text>
    )
  }

  const ms = r.durationMs ?? (r.endedAt ?? t) - r.startedAt
  const mainMark = !isDone ? SPIN[Math.floor(ms / 1000) % SPIN.length] : r.outcome === 'answer' ? '✓' : '✗'
  const mainColor: Color = !isDone ? 'claude' : r.outcome === 'answer' ? 'success' : 'error'
  const cost = r.costNow !== undefined && r.costAtStart !== undefined ? r.costNow - r.costAtStart : undefined
  const mainTail = [
    cost !== undefined ? usd(cost) : undefined,
    !isDone && r.current !== undefined ? `▸ ${r.current}` : undefined,
  ]
    .filter(s => s !== undefined)
    .join(' ')

  const agents = r.agents.slice(0, MAX_AGENT_ROWS)
  const hidden = r.agents.length - agents.length

  return (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text color={mainColor} bold>{`${mainMark} `}</Text>
        <Text bold>{pad('main', LABEL)}</Text>
        {bar('main', [r.startedAt, r.endedAt ?? t])}
        <Text bold>{` ${elapsed(ms).padStart(6)} `}</Text>
        {chips('main', mainTail === '' ? undefined : mainTail)}
      </Text>
      {agents.map((a, i) => {
        const isLast = i === agents.length - 1 && hidden === 0
        const mark = a.state === 'run' ? SPIN[Math.floor((t - a.t0) / 1000) % SPIN.length] : a.state === 'ok' ? '✓' : '✗'
        const color: Color = a.state === 'run' ? 'claude' : a.state === 'ok' ? 'success' : 'error'
        return (
          <Text wrap="truncate-end">
            <Text dimColor>{isLast ? '└' : '├'}</Text>
            <Text color={color}>{mark}</Text>
            <Text color={KIND_COLOR.agent}>{pad(ALIAS[a.type] ?? a.type, LABEL)}</Text>
            {bar(a.toolUseId, [a.t0, a.t1 ?? t])}
            <Text>{` ${elapsed((a.t1 ?? t) - a.t0).padStart(6)} `}</Text>
            {chips(a.toolUseId, `· ${a.description}`)}
          </Text>
        )
      })}
      {hidden > 0 ? <Text dimColor>{`└ +${hidden} more agents`}</Text> : null}
    </Box>
  )
}

let ticker: Timer | undefined

function hasLive(r: Run | null): boolean {
  return r !== null && (r.endedAt === undefined || r.agents.some(a => a.state === 'run'))
}

// One tick a second: moves the clock the bars read, reads the session's cost,
// and settles background agents whose end no turn.complete reported.
function ensureTicker($: EngineInterface): void {
  if (ticker !== undefined) return
  ticker = $.clock.every(1000, () => {
    void (async () => {
      const t = await $.clock.now()
      await update($, now, () => t)
      const r = await read($, run)
      if (r === null) return
      if (r.endedAt === undefined) {
        const cost = await sessionCost($)
        if (cost !== undefined) await edit($, cur => ({ ...cur, costNow: cost }))
      }
      if (r.agents.some(a => a.state === 'run' && a.agentId !== undefined)) {
        const list = await $.agent.list()
        const status = new Map(list.map(a => [a.id, a.status]))
        await edit($, cur =>
          cur.agents.reduce((acc, a) => {
            const s = a.agentId === undefined ? undefined : status.get(a.agentId)
            if (s === 'completed' || s === 'idle') return finishAgent(acc, x => x.toolUseId === a.toolUseId, 'ok', t)
            if (s === 'failed' || s === 'killed') return finishAgent(acc, x => x.toolUseId === a.toolUseId, 'err', t)
            return acc
          }, cur),
        )
      }
      if (!hasLive(await read($, run))) {
        ticker?.cancel()
        ticker = undefined
      }
    })().catch(() => undefined)
  })
}

async function setPrefs($: EngineInterface, fn: (p: Prefs) => Prefs): Promise<Prefs> {
  let after: Prefs = { band: true, history: true }
  await update($, prefs, p => (after = fn(p)))
  await $.store.set(PREFS_KEY, after)
  return after
}

export function describePrefs(p: Prefs): string {
  return `prompt-pulse: band ${p.band ? 'on' : 'off'}, history ${p.history ? 'on' : 'off'}`
}

const USAGE = 'Usage: /pulse [on|off|toggle] · /pulse history [on|off] · /pulse status'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    try {
      const saved = (await $.store.get(PREFS_KEY)) as Partial<Prefs> | undefined
      if (saved !== undefined && saved !== null) {
        await update($, prefs, p => ({ ...p, ...saved }))
      }
      await $.command.register({
        name: 'pulse',
        description: 'Show or hide the prompt-pulse timeline (band above the prompt, history in the transcript)',
        argumentHint: '[on|off|toggle|history on|off|status]',
      })
    } catch {
      // ignore
    }
    return next(e)
  })

  on('command.run', { command: 'pulse' }, async ($, e) => {
    const words = e.args.trim().toLowerCase().split(/\s+/).filter(w => w !== '')
    const [first, second] = words
    const flag = (w: string | undefined, was: boolean) => (w === 'on' ? true : w === 'off' ? false : !was)

    if (first === undefined || first === 'on' || first === 'off' || first === 'toggle') {
      return { text: describePrefs(await setPrefs($, p => ({ ...p, band: flag(first, p.band) }))) }
    }
    if (first === 'history' && (second === undefined || second === 'on' || second === 'off')) {
      return { text: describePrefs(await setPrefs($, p => ({ ...p, history: flag(second, p.history) }))) }
    }
    if (first === 'status') {
      return { text: describePrefs(await read($, prefs)) }
    }
    return { text: USAGE }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) {
      const id = e.agentId
      await edit($, r => setAgent(r, a => a.agentId === id, a => ({ ...a, state: 'run', t1: undefined })))
      return next(e)
    }
    const t = await $.clock.now()
    const cost = await sessionCost($)
    try {
      await update($, now, () => t)
      await update($, run, prev => ({
        startedAt: t,
        // background agents outlive the turn that started them
        agents: (prev?.agents ?? []).filter(a => a.state === 'run').map(a => ({ ...a, t0: t })),
        spans: [],
        tokens: {},
        costAtStart: cost,
        costNow: cost,
      }))
    } catch {
      // ignore
    }
    ensureTicker($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const reason = e.reason
    const usage = e.usage
    const t = await $.clock.now()
    if (e.agentId !== undefined) {
      const id = e.agentId
      await edit($, r => {
        const lane = r.agents.find(a => a.agentId === id)?.toolUseId
        const out = lane === undefined ? r : addTokens(r, lane, usage)
        return finishAgent(out, a => a.agentId === id, reason === 'answer' ? 'ok' : 'err', t)
      })
      return next(e)
    }
    const res = await next(e)
    const cost = await sessionCost($)
    const durationMs = e.durationMs
    try {
      let done: Run | null = null
      await update($, run, r =>
        (done =
          r === null
            ? r
            : {
                ...addTokens(r, 'main', usage),
                endedAt: t,
                durationMs,
                outcome: reason,
                current: undefined,
                costNow: cost ?? r.costNow,
              }),
      )
      const finished = done as Run | null
      if (finished !== null) {
        await update($, history, list => [...list, finished].slice(-MAX_HISTORY))
      }
    } catch {
      // ignore
    }
    return res
  })

  on('agent.spawn', async ($, e, next) => {
    const t = await $.clock.now()
    const entry: AgentEntry = {
      toolUseId: e.tool_use_id,
      type: e.subagentType,
      description: e.description,
      state: 'run',
      t0: t,
    }
    await edit($, r => ({ ...r, agents: [...r.agents, entry] }))
    ensureTicker($)
    const res = await next(e)
    if (res.deny !== undefined) {
      await edit($, r => ({ ...r, agents: r.agents.filter(a => a.toolUseId !== entry.toolUseId || a.agentId !== undefined) }))
    } else if (res.agentId !== undefined) {
      const id = res.agentId
      await edit($, r =>
        setAgent(r, a => a.toolUseId === entry.toolUseId && a.agentId === undefined, a => ({ ...a, agentId: id })),
      )
    }
    return res
  })

  on('tool.call', async ($, e, next) => {
    const tool = e.tool
    const agentId = e.agentId
    const id = e.tool_use_id
    const kind = kindOf(tool)
    const name =
      kind === 'mcp' ? mcpServer(tool) : kind === 'skill' ? String((e as { skill?: unknown }).skill ?? '?') : tool
    const t = await $.clock.now()

    await edit($, r => {
      const lane = agentId === undefined ? 'main' : r.agents.find(a => a.agentId === agentId)?.toolUseId
      if (lane === undefined) return r
      return {
        ...r,
        spans: [...r.spans, { id, lane, kind, name, t0: t }].slice(-MAX_SPANS),
        current: lane === 'main' && kind !== 'agent' ? name : r.current,
      }
    })

    const res = await next(e)
    const failed = res.deny !== undefined || res.isError === true
    const t1 = await $.clock.now()
    const status = tool === 'Agent' ? (res.result as { status?: unknown } | undefined)?.status : undefined

    await edit($, r => {
      let out: Run = {
        ...r,
        current: agentId === undefined && r.current === name ? undefined : r.current,
        spans: r.spans.map(s => (s.id === id ? { ...s, t1, isError: failed || undefined } : s)),
      }
      if (tool === 'Agent' && (failed || status === 'completed')) {
        out = finishAgent(out, a => a.toolUseId === id, failed ? 'err' : 'ok', t1)
      }
      return out
    })
    return res
  })

  // Live, above the prompt: while the turn runs or an agent it started is
  // still going; after that only when the history does not hold it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const p = await read($, prefs)
    const r = await read($, run)
    if (!p.band || r === null) return next(e)
    if (!hasLive(r) && p.history) return next(e)
    const t = Math.max(await read($, now), r.startedAt)
    return Timeline($.ui.resolve(e), r, t, e.props.bodyColumns + 5)
  })

  // In the transcript: the finished timeline under the turn's closing line,
  // matched by the duration that line shows.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const line = await next(e)
    const p = await read($, prefs)
    if (!p.history) return line
    const list = await read($, history)
    const ms = e.props.durationMs
    const r = [...list].reverse().find(h => h.durationMs !== undefined && Math.abs(h.durationMs - ms) < 1500)
    if (r === undefined) return line
    const t = Math.max(await read($, now), r.endedAt ?? r.startedAt)
    const el = $.ui.resolve(e)
    const { Box } = el
    return (
      <Box flexDirection="column">
        {line}
        {Timeline(el, r, t, e.viewport?.columns ?? 120)}
      </Box>
    )
  })
}
