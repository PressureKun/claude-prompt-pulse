// Scenes for the README screenshots. Not a test of the mod: build.sh copies it
// into a scratch copy as tests/scenes.test.tsx, runs `claude plugin test`, and
// turns the trees it prints into PNGs. Every timeline here is drawn by the
// mod's own Timeline; the runs are made up so each frame shows what it should.
import { expect, mock, test } from 'claude-code/testing'

import type { AgentEntry, Run, Span, SpanKind, Tokens } from '../types'
import { Timeline } from '../hooks/register'

const COLUMNS = 165

let n = 0
function s(lane: string, kind: SpanKind, name: string, t0: number, t1?: number, isError?: boolean): Span {
  n += 1
  return { id: `s${n}`, lane, kind, name, t0, t1, isError }
}

function agent(id: string, type: string, description: string, state: AgentEntry['state'], t0: number, t1?: number): AgentEntry {
  return { toolUseId: id, agentId: `ag-${id}`, type, description, state, t0, t1 }
}

const tk = (i: number, o: number): Tokens => ({ in: i, out: o })

// Mid-turn: main waits on an MCP call, one agent done, one still going, one failed.
const live: Run = {
  startedAt: 0,
  agents: [
    agent('a1', 'Explore', 'Find hook registrations', 'ok', 4_000, 15_000),
    agent('a2', 'general-purpose', 'Look up the tracker issue', 'run', 4_100),
    agent('a3', 'Plan', 'Draft the migration plan', 'err', 4_200, 27_000),
  ],
  spans: [
    s('main', 'tool', 'Read', 1_000, 1_800),
    s('main', 'tool', 'Grep', 2_000, 2_600),
    s('main', 'skill', 'graphify', 3_000, 3_300),
    s('main', 'agent', 'Agent', 4_000, 4_050),
    s('main', 'agent', 'Agent', 4_100, 4_150),
    s('main', 'agent', 'Agent', 4_200, 4_250),
    s('a1', 'tool', 'Grep', 4_500, 5_000),
    s('a1', 'tool', 'Read', 5_200, 6_000),
    s('a1', 'tool', 'Read', 6_500, 7_200),
    s('a1', 'tool', 'Bash', 9_000, 11_000),
    s('a2', 'mcp', 'yandex-tracker', 6_000, 9_000),
    s('a2', 'mcp', 'yandex-tracker', 12_000, 14_000),
    s('a2', 'tool', 'Bash', 30_000, 31_000),
    s('a2', 'mcp', 'yandex-tracker', 48_000),
    s('a3', 'tool', 'Read', 5_000, 6_000),
    s('a3', 'tool', 'Bash', 20_000, 26_000, true),
    s('main', 'tool', 'Bash', 20_000, 23_000),
    s('main', 'tool', 'Bash', 24_000, 24_500, true),
    s('main', 'mcp', 'figma', 26_000, 38_000),
    s('main', 'mcp', 'yandex-tracker', 40_000, 41_000),
    s('main', 'tool', 'Edit', 42_000, 42_500),
    s('main', 'mcp', 'context7', 50_000),
  ],
  current: 'context7',
  tokens: { main: tk(48_200, 2_140), a1: tk(24_100, 310), a2: tk(40_300, 520), a3: tk(31_000, 410) },
  costAtStart: 1.2,
  costNow: 1.51,
}

// Two finished turns as the transcript keeps them.
const answered: Run = {
  startedAt: 0,
  endedAt: 49_000,
  durationMs: 49_000,
  outcome: 'answer',
  agents: [
    agent('b1', 'Explore', 'Scan commands dir', 'ok', 3_000, 12_000),
    agent('b2', 'Explore', 'Scan plans dir', 'ok', 3_100, 17_000),
  ],
  spans: [
    s('main', 'tool', 'Read', 500, 1_500),
    s('main', 'agent', 'Agent', 3_000, 3_050),
    s('main', 'agent', 'Agent', 3_100, 3_150),
    s('b1', 'tool', 'Bash', 4_000, 5_000),
    s('b1', 'tool', 'Bash', 7_000, 8_500),
    s('b2', 'tool', 'Glob', 4_500, 4_800),
    s('b2', 'tool', 'Read', 6_000, 9_000),
    s('main', 'tool', 'Bash', 18_000, 21_000),
    s('main', 'mcp', 'context7', 22_000, 27_000),
    s('main', 'tool', 'Edit', 30_000, 31_000),
    s('main', 'tool', 'Edit', 33_000, 34_000),
    s('main', 'tool', 'Bash', 38_000, 46_000),
  ],
  tokens: { main: tk(61_300, 3_420), b1: tk(22_900, 280), b2: tk(23_400, 300) },
  costAtStart: 0.4,
  costNow: 0.83,
}

const aborted: Run = {
  startedAt: 0,
  endedAt: 12_000,
  durationMs: 12_000,
  outcome: 'aborted',
  agents: [],
  spans: [
    s('main', 'tool', 'Read', 800, 1_400),
    s('main', 'tool', 'Bash', 2_000, 2_600, true),
    s('main', 'tool', 'Bash', 4_000, 11_500),
  ],
  tokens: { main: tk(18_700, 640) },
  costAtStart: 0.83,
  costNow: 0.9,
}

// The turn is over but agents it sent to the background still run.
const background: Run = {
  startedAt: 0,
  endedAt: 31_000,
  durationMs: 31_000,
  outcome: 'answer',
  agents: [
    agent('c1', 'Explore', 'Map the API layer', 'ok', 2_000, 22_000),
    agent('c2', 'general-purpose', 'Run the e2e suite', 'run', 2_100),
    agent('c3', 'Explore', 'Find dead exports', 'ok', 2_200, 40_000),
    agent('c4', 'general-purpose', 'Bump dependencies', 'run', 2_300),
    agent('c5', 'Plan', 'Plan the cache rewrite', 'ok', 2_400, 35_000),
    agent('c6', 'Explore', 'Collect TODOs', 'ok', 2_500, 18_000),
  ],
  spans: [
    s('main', 'tool', 'Read', 500, 1_200),
    ...['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((_, i) => s('main', 'agent', 'Agent', 2_000 + i * 100, 2_050 + i * 100)),
    s('c1', 'tool', 'Grep', 3_000, 4_000),
    s('c1', 'tool', 'Read', 6_000, 9_000),
    s('c1', 'tool', 'Read', 12_000, 15_000),
    s('c2', 'tool', 'Bash', 4_000, 58_000),
    s('c3', 'tool', 'Grep', 3_500, 5_000),
    s('c3', 'tool', 'Bash', 20_000, 30_000),
    s('c4', 'tool', 'Bash', 5_000, 12_000),
    s('c4', 'mcp', 'context7', 14_000, 20_000),
    s('c4', 'tool', 'Edit', 40_000, 41_000),
    s('c4', 'tool', 'Bash', 50_000),
    s('c5', 'tool', 'Read', 4_000, 10_000),
    s('c6', 'tool', 'Grep', 3_000, 6_000),
    s('main', 'tool', 'Bash', 24_000, 28_000),
  ],
  tokens: {
    main: tk(30_100, 1_200),
    c1: tk(25_500, 330),
    c2: tk(14_200, 150),
    c3: tk(28_000, 400),
    c4: tk(33_100, 610),
    c5: tk(19_800, 900),
    c6: tk(12_700, 120),
  },
  costAtStart: 2.1,
  costNow: 2.74,
}

// A two-minute wait next to calls that took a second or less.
const axis: Run = {
  startedAt: 0,
  endedAt: 128_000,
  durationMs: 128_000,
  outcome: 'answer',
  agents: [],
  spans: [
    s('main', 'tool', 'Read', 500, 1_200),
    s('main', 'tool', 'Bash', 1_500, 2_500),
    s('main', 'mcp', 'chrome-devtools', 3_000, 123_000),
    s('main', 'skill', 'run', 123_500, 123_500),
    s('main', 'tool', 'Bash', 124_000, 124_600, true),
    s('main', 'tool', 'Bash', 125_000, 126_500),
    s('main', 'tool', 'Edit', 127_000, 127_400),
  ],
  tokens: { main: tk(52_000, 1_900) },
  costAtStart: 3,
  costNow: 3.22,
}

const SCENES: Record<string, { run: Run; t: number }> = {
  live: { run: live, t: 52_000 },
  answered: { run: answered, t: 49_000 },
  aborted: { run: aborted, t: 12_000 },
  background: { run: background, t: 61_000 },
  axis: { run: axis, t: 128_000 },
}

const BAND = {
  plugin: 'prompt-pulse',
  surface: 'terminal',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: COLUMNS - 5, scroll: { offset: 0, bodyRows: 11 }, view: {} },
} as const

test('scenes', async ($, on) => {
  mock.store(on)
  let scene = SCENES.live
  // With no turn started the mod passes the band down; this hook, beneath it,
  // draws the scene with the mod's own Timeline.
  on('ui.render', ($, e) => Timeline($.ui.resolve(e), scene.run, scene.t, COLUMNS))

  for (const [name, sc] of Object.entries(SCENES)) {
    scene = sc
    const ui = await $.ui.mount(BAND)
    const tree = await ui.drawn()
    expect(tree).toMatchObject({ type: 'Box' })
    console.log(`@@SCENE ${name} ${JSON.stringify(tree)}`)
    await ui.unmount()
  }

  const commands: [string, string][] = []
  for (const args of ['status', 'history off', 'off', 'on', 'history on', 'help']) {
    const res = await $.command.run({
      command: 'pulse',
      args,
      origin: { kind: 'composer' },
      presentation: { isFullscreen: false, columns: COLUMNS },
    })
    commands.push([args, String(res.text)])
  }
  console.log(`@@COMMANDS ${JSON.stringify(commands)}`)
})
