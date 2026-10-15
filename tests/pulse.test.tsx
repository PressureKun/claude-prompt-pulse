import { describe, expect, mock, test } from 'claude-code/testing'

import { axis, cells, elapsed, linear, mcpServer, pointsOf, tokens, usd } from '../hooks/register'

const BAND = {
  plugin: 'prompt-pulse',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

describe('helpers', () => {
  test('a long wait shrinks and an instant call keeps a cell', async () => {
    // 1s tool, 120s mcp wait, then an instant skill and a 1s tool
    const spans = [
      { id: 'a', lane: 'main', kind: 'tool' as const, name: 'Bash', t0: 0, t1: 1_000 },
      { id: 'b', lane: 'main', kind: 'mcp' as const, name: 'chrome', t0: 1_000, t1: 121_000 },
      { id: 'c', lane: 'main', kind: 'skill' as const, name: 'x', t0: 121_000, t1: 121_000 },
      { id: 'd', lane: 'main', kind: 'tool' as const, name: 'ls', isError: true, t0: 121_500, t1: 122_500 },
    ]
    const edges = axis(pointsOf(spans, []), 0, 122_500, 20)
    expect(edges.length).toBe(21)
    const cs = cells(spans, 'main', edges, [0, 122_500])
    expect(cs.filter(c => c === 'mcp').length).toBeLessThan(14)
    expect(cs.filter(c => c === 'tool').length).toBeGreaterThan(1)
    expect(cs).toContain('skill')
    expect(cs).toContain('err')
  })

  test('mcp server names are short', async () => {
    expect(mcpServer('mcp__plugin_figma_figma__get_screenshot')).toBe('figma')
    expect(mcpServer('mcp__claude_ai_Sentry__authenticate')).toBe('Sentry')
    expect(mcpServer('mcp__context7__query-docs')).toBe('context7')
  })

  test('tokens and cost format', async () => {
    expect(tokens(950)).toBe('950')
    expect(tokens(12_345)).toBe('12k')
    expect(tokens(4_321)).toBe('4.3k')
    expect(tokens(2_500_000)).toBe('2.5M')
    expect(usd(0.004)).toBe('<$0.01')
    expect(usd(0.4234)).toBe('$0.42')
  })

  test('elapsed formats', async () => {
    expect(elapsed(4200)).toBe('4s')
    expect(elapsed(125000)).toBe('2m05s')
  })

  test('cells place spans on the timeline', async () => {
    const spans = [
      { id: 'a', lane: 'main', kind: 'tool' as const, name: 'Read', t0: 0, t1: 20 },
      { id: 'b', lane: 'main', kind: 'mcp' as const, name: 'figma', t0: 50, t1: 60 },
      { id: 'c', lane: 'x', kind: 'tool' as const, name: 'Bash', isError: true, t0: 0, t1: 100 },
    ]
    expect(cells(spans, 'main', linear(0, 100, 10), [0, 100])).toEqual([
      'tool', 'tool', 'idle', 'idle', 'idle', 'mcp', 'idle', 'idle', 'idle', 'idle',
    ])
    expect(cells(spans, 'main', linear(0, 100, 10), [30, 70])).toEqual([
      'off', 'off', 'off', 'idle', 'idle', 'mcp', 'idle', 'off', 'off', 'off',
    ])
  })
})

test('band shows lanes, tools, mcp, skills and the outcome', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  const ui0 = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui0.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await ui0.unmount()

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/a' })
  await clock.advance(8_000)
  await $.tool.call({ tool: 'Read', file_path: '/b' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await clock.advance(10_000)
  await $.tool.call({ tool: 'mcp__plugin_figma_figma__whoami' })
  await clock.advance(10_000)
  await $.tool.call({ tool: 'Skill', skill: 'graphify' })
  await clock.advance(14_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const texts = (await ui.findAll({ type: 'Text' })).map(x => x.text)
  expect(texts.some(s => s.includes('█'))).toBe(true)
  expect(texts.some(s => /main\s+▕.*▏\s+42s 5× Read×2 Bash ⬡ figma ✦ graphify/.test(s))).toBe(true)
  expect(texts.some(s => /thinking/.test(s))).toBe(false)
  await ui.unmount()

  const usage = { model: 'm', input_tokens: 1000, output_tokens: 300, cache_read_input_tokens: 11_000, cache_creation_input_tokens: 0 }
  await $.turn.complete({ turnId: 't1', reason: 'answer', answer: 'done', durationMs: 42_000, isAborted: false, usage })

  // history on: the band steps aside, the transcript line carries the timeline
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await band.unmount()

  const line = await $.ui.mount({
    plugin: 'prompt-pulse',
    surface: 'terminal',
    component: 'TurnDuration',
    props: { word: 'Baked', durationMs: 42_000 },
  })
  const rows = (await line.findAll({ type: 'Text' })).map(x => x.text)
  expect(rows).toContain('engine')
  expect(rows.some(s => /✓ main\s+▕.*▏\s+42s 5× .*↑12k ↓300/.test(s))).toBe(true)
  await line.unmount()

  // history off: the band shows the finished run again
  const off = await $.command.run({
    command: 'pulse',
    args: 'history off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  expect(off.text).toBe('prompt-pulse: band on, history off')
  const again = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await again.find({ type: 'Text', text: '✓ ' })).toBeDefined()
  await again.unmount()

  const hidden = await $.command.run({
    command: 'pulse',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  expect(hidden.text).toBe('prompt-pulse: band off, history off')
  const none = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await none.find({ type: 'Text', text: 'engine' })).toBeDefined()
  await none.unmount()
})
