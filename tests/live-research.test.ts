import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveResearchSource, hypothesisChanges, pickExchange } from '~/data/live-research'
import { createMockContractSource } from '~/data/mock/contract'
import { createMockResearchSource } from '~/data/mock/research'
import type { ContractSource } from '~/data/source'

const SHA = 'a'.repeat(64)

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: Request | string) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://x')
    const body = routes[url.pathname]
    if (body instanceof Response) return body.clone()
    if (body === undefined) return new Response(JSON.stringify({ title: 'нет', status: 404 }), { status: 404, headers: { 'Content-Type': 'application/problem+json' } })
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
}

function contractWithBytes(): ContractSource {
  const base = createMockContractSource()
  return {
    ...base,
    listSources: async () => ({ items: [{ sha256: SHA, importId: 'imp-0001', name: 'stand.pcapng', format: 'pcapng', sizeBytes: 1, status: 'ready', frameCount: 1, connectionCount: 1 }], total: 1, limit: 50, offset: 0 }),
    getStreamBytes: async (stream, from, len) => ({
      stream, from, length: len, streamLength: 100,
      segments: [{ start: from, end: from + len, status: 'data', data: btoa(String.fromCharCode(...Array.from({ length: len }, (_, i) => 0xA0 + i))), frames: [] }],
    }),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('живые модели экранов', () => {
  it('обмен: запрос — первое a→b после действия, ответ — первое b→a после запроса', async () => {
    const t = (ms: number) => new Date(Date.UTC(2026, 9, 10, 14, 0, 0, ms)).toISOString()
    stubApi({
      '/api/action-logs/log-1/actions/7/exchange': {
        action: { line: 7, time: t(500), action: 'set_param', params: { value: 21 }, result: {}, resultRaw: 'ok' },
        window: { from: t(0), to: t(1000) },
        interpretationApplied: false,
        messages: [],
        frames: [
          { source: SHA, stream: 'x:c0001:ab', frameNo: 10, time: t(100), start: 0, end: 4, duplicate: false },
          { source: SHA, stream: 'x:c0001:ba', frameNo: 11, time: t(300), start: 0, end: 3, duplicate: false },
          { source: SHA, stream: 'x:c0001:ab', frameNo: 12, time: t(510), start: 4, end: 9, duplicate: false },
          { source: SHA, stream: 'x:c0001:ba', frameNo: 13, time: t(530), start: 3, end: 6, duplicate: false },
        ],
      },
    })
    const src = createLiveResearchSource(contractWithBytes(), createMockResearchSource())
    const ex = await src.getExchange('log-1|7')
    expect(ex?.request?.title).toBe('Запрос · кадр 12 · +10 мс')
    expect(ex?.request?.bytes).toEqual(['A0', 'A1', 'A2', 'A3', 'A4'])
    expect(ex?.response?.title).toBe('Ответ · кадр 13 · +30 мс')
    expect(ex?.events.filter(e => e.kind === 'request')).toHaveLength(1)
    expect(ex?.events.find(e => e.kind === 'action')?.at).toBeCloseTo(0.5)
  })

  it('прогон: проценты, категории и сравнение с предыдущим', async () => {
    const run = (id: string, stale: boolean) => ({
      id, revision: 2, interpretationDigest: SHA, settingsDigest: SHA, corpus: { port: 5020 }, sources: [SHA], engineVersion: '0.1.0', stale, staleReasons: [],
      summary: { streams: 2, outOfScopeStreams: 1, messages: 200, messageBytes: 1000, unknownBytes: 100, counts: { matched: 150, violated: 2 }, byMessage: {}, counterexamples: 2, counterexamplesTruncated: false },
    })
    stubApi({
      '/api/runs': { items: [run('run-2', false), run('run-1', true)], total: 2, limit: 50, offset: 0 },
      '/api/runs/run-2': {
        ...run('run-2', false), streams: [],
        counterexamples: [{ anchor: { source: SHA, stream: 'x:c0001:ab', start: 4, end: 9, sha256: null }, category: 'violated', messageId: 'set_param', violations: [{ kind: 'check', id: 'crc', detail: 'crc не совпал', status: 'hypothesis' }] }],
      },
      '/api/runs/diff': { a: 'run-1', b: 'run-2', staleA: true, staleB: false, totals: { fixed: 3, regressed: 1, changed: 0, added: 0, removed: 0, unchanged: 140 }, countsA: {}, countsB: {}, items: [], total: 0, limit: 1, offset: 0 },
    })
    const v = await createLiveResearchSource(contractWithBytes(), createMockResearchSource()).getVerification()
    expect(v.run?.id).toBe('run-2')
    expect(v.totals.map(t => t.value)).toEqual(['200', '75,0%', '90,0%', '2'])
    expect(v.categories.find(c => c.key === 'violated')?.count).toBe(2)
    expect(v.categories.find(c => c.key === 'out_of_scope')?.count).toBe(1)
    expect(v.problems[0]).toMatchObject({ status: 'violation', where: 'stand.pcapng · c0001 a→b · [4, 9)', what: 'crc не совпал' })
    expect(v.diffWith).toBe('run-1')
    expect(v.diff[0]).toEqual({ label: 'Исправилось', value: '3', tone: 'good' })
    expect(v.runs.map(r => r.current)).toEqual([true, false])
  })

  it('нет интерпретации — пустая модель, а не ошибка', async () => {
    stubApi({})
    const v = await createLiveResearchSource(contractWithBytes(), createMockResearchSource()).getInterpretation()
    expect(v.rev).toBeNull()
    expect(v.yaml).toEqual([])
  })

  it('нарушения в редакторе — из последнего полного прогона ревизии', async () => {
    const head = (id: string, corpus: object) => ({
      id, revision: 3, interpretationDigest: SHA, settingsDigest: SHA, corpus, sources: [SHA], engineVersion: '0.1.0', stale: false, staleReasons: [],
      summary: { streams: 1, outOfScopeStreams: 0, messages: 1, messageBytes: 1, unknownBytes: 0, counts: {}, byMessage: {}, counterexamples: 0, counterexamplesTruncated: false },
    })
    const refuted = (n: number) => [{ id: 'H6', test: 't', verdict: 'refuted', applicable: 24, held: 24 - n, counterexamples: n }]
    stubApi({
      '/api/interpretation': { rev: 3, yaml: 'messages: []', digest: SHA },
      '/api/interpretation/preview': { items: [], total: 0, limit: 500, offset: 0 },
      '/api/runs': { items: [head('run-3', { sources: [SHA] }), head('run-2', {})], total: 2, limit: 20, offset: 0 },
      '/api/runs/run-2': { ...head('run-2', {}), streams: [], counterexamples: [], hypotheses: refuted(4) },
      '/api/runs/run-3': { ...head('run-3', { sources: [SHA] }), streams: [], counterexamples: [], hypotheses: refuted(2) },
    })
    const v = await createLiveResearchSource(contractWithBytes(), createMockResearchSource()).getInterpretation()
    expect(v.runIssues).toEqual([{ id: 'H6', label: 'опровергнута в run-2 · контрпримеров 4', runId: 'run-2' }])
  })

  it('соединения устройства: без журнала — null, а не ошибка', async () => {
    stubApi({ '/api/analysis/device-connections': new Response(JSON.stringify({ title: 'нет журнала', status: 409 }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }) })
    expect(await createLiveResearchSource(contractWithBytes(), createMockResearchSource()).getDeviceConnections()).toBeNull()
  })

  it('объясни байт: запрос со смещением в адресе', async () => {
    const body = { stream: 'x:c0001:ab', offset: 12, kind: 'data', value: 0, frames: [], message: null, fields: [], observations: [], hypotheses: [], runs: [] }
    const fetch = vi.fn(async (_input: Request) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const r = await createLiveResearchSource(contractWithBytes(), createMockResearchSource()).explainByte('x:c0001:ab', 12)
    expect(r.offset).toBe(12)
    expect(new URL(fetch.mock.calls[0]![0].url).pathname + new URL(fetch.mock.calls[0]![0].url).search).toBe('/api/streams/x%3Ac0001%3Aab/explain?offset=12')
  })

  it('заготовки: без описания или журнала — пояснение, а не ошибка', async () => {
    stubApi({ '/api/analysis/suggestions': new Response(JSON.stringify({ title: 'нет описания', status: 409 }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }) })
    const v = await createLiveResearchSource(contractWithBytes(), createMockResearchSource()).getSuggestions()
    expect(v.items).toEqual([])
    expect(v.note).toMatch(/сохранённое описание и журнал/)
  })

  it('принять заготовку: сначала наблюдение, затем гипотеза на нём', async () => {
    const calls: { path: string, body: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
      const path = new URL(input.url).pathname
      calls.push({ path, body: await input.clone().json() })
      const body = path === '/api/observations' ? { id: 'obs-7' } : { id: 'H9' }
      return new Response(JSON.stringify(body), { status: 201, headers: { 'Content-Type': 'application/json' } })
    }))
    const id = await createLiveResearchSource(contractWithBytes(), createMockResearchSource()).acceptSuggestion({
      messageId: 'set_config_req', param: 'params.enabled', matches: 12, samples: 12, field: 'enabled',
      observation: { source: SHA, stream: 'x:c0001:ab', start: 16, end: 17, comment: 'enabled = params.enabled' },
      hypothesis: { statement: 'enabled — флаг из журнала', test: 'enabled == action.params.enabled' },
    })
    expect(id).toBe('H9')
    expect(calls.map(c => c.path)).toEqual(['/api/observations', '/api/hypotheses'])
    expect(calls[1]!.body).toEqual({ statement: 'enabled — флаг из журнала', basis: ['obs-7'], test: 'enabled == action.params.enabled' })
  })

  it('действия с одинаковым временем получают разные запросы по порядку', () => {
    const t = (ms: number) => new Date(Date.UTC(2026, 9, 10, 14, 0, 0, ms)).toISOString()
    const ex = {
      action: { line: 1, time: t(100), action: 'read_param', params: {}, result: {}, resultRaw: '' },
      window: { from: t(0), to: t(1000) },
      interpretationApplied: true,
      frames: [],
      messages: [
        { source: SHA, stream: 'x:c0001:ab', start: 0, end: 8, category: 'matched' as const, messageId: null, firstTime: t(110), lastTime: t(110) },
        { source: SHA, stream: 'x:c0001:ab', start: 8, end: 16, category: 'matched' as const, messageId: null, firstTime: t(110), lastTime: t(110) },
        { source: SHA, stream: 'x:c0001:ba', start: 0, end: 12, category: 'matched' as const, messageId: null, firstTime: t(120), lastTime: t(120) },
        { source: SHA, stream: 'x:c0001:ba', start: 12, end: 24, category: 'matched' as const, messageId: null, firstTime: t(125), lastTime: t(125) },
      ],
    }
    const used = new Set<string>()
    const a = pickExchange(ex, used)
    const b = pickExchange(ex, used)
    expect([a.request?.start, a.response?.start]).toEqual([0, 0])
    expect([b.request?.start, b.response?.start]).toEqual([8, 12])
  })

  it('без описания запрос из нескольких сегментов склеивается в один ход', () => {
    const t = (ms: number) => new Date(Date.UTC(2026, 9, 10, 14, 0, 0, ms)).toISOString()
    const f = (stream: string, start: number, end: number, ms: number, frameNo: number) => ({ source: SHA, stream, start, end, time: t(ms), frameNo, duplicate: false })
    const ex = {
      action: { line: 1, time: t(100), action: 'read_param', params: {}, result: {}, resultRaw: '' },
      window: { from: t(0), to: t(1000) },
      interpretationApplied: false,
      frames: [
        f('x:c0001:ab', 0, 3, 110, 34), f('x:c0001:ab', 3, 10, 111, 36), f('x:c0001:ab', 10, 17, 112, 38),
        f('x:c0001:ba', 0, 8, 120, 40), f('x:c0001:ba', 8, 20, 121, 41),
        f('x:c0001:ab', 17, 25, 300, 50),
      ],
      messages: [],
    }
    const { request, response } = pickExchange(ex)
    expect([request?.start, request?.end, request?.frameNo, request?.lastFrameNo]).toEqual([0, 17, 34, 38])
    expect([response?.start, response?.end, response?.frameNo, response?.lastFrameNo]).toEqual([0, 20, 40, 41])
  })

  it('действия: выбранный журнал, обмены по строкам и пояснение без описания', async () => {
    const t = new Date(Date.UTC(2026, 9, 10, 14, 0, 0, 0)).toISOString()
    const logs = { items: [
      { id: 'log-0001', sha256: SHA, name: 'main.actions.csv', rows: 16, skipped: 0, errors: [], mapping: { time: 'time', action: 'action' }, firstTime: t, lastTime: t },
      { id: 'log-0002', sha256: SHA, name: 'extra.actions.csv', rows: 2, skipped: 0, errors: [], mapping: { time: 'time', action: 'action' }, firstTime: t, lastTime: t },
    ] }
    const actions = { items: [
      { line: 2, time: t, action: 'set_param', params: { value: 70000 }, result: {}, resultRaw: 'ok' },
      { line: 3, time: t, action: 'reset', params: {}, result: {}, resultRaw: '' },
    ], total: 2, limit: 200, offset: 0 }
    const msg = (stream: string) => ({ source: SHA, stream, start: 8, end: 16, messageId: 'set_param_req', category: 'matched', tsNs: 0 })
    stubApi({
      '/api/action-logs': logs,
      '/api/action-logs/log-0002/actions': actions,
      '/api/action-logs/log-0002/exchanges': { items: [
        { line: 2, action: 'set_param', tsNs: 0, state: 'paired', request: msg('x:c0001:ab'), response: msg('x:c0001:ba'), delayNs: 3, candidates: 2 },
        { line: 3, action: 'reset', tsNs: 0, state: 'not_found', request: null, response: null, delayNs: null, candidates: 0 },
      ], total: 2, limit: 200, offset: 0, paired: 1, requestOnly: 0, notFound: 1 },
    })
    const src = createLiveResearchSource(contractWithBytes(), createMockResearchSource())
    const v = await src.getActions('log-0002')
    expect(v.logs.map(l => l.name)).toEqual(['main.actions.csv', 'extra.actions.csv'])
    expect(v.log?.id).toBe('log-0002')
    expect(v.rows.map(r => [r.exchange, r.request?.label ?? null, r.candidates])).toEqual([['paired', 'set_param_req', 2], ['not_found', null, 0]])
    expect(v.exchanges).toEqual({ paired: 1, requestOnly: 0, notFound: 1, total: 2 })

    stubApi({
      '/api/action-logs': logs,
      '/api/action-logs/log-0001/actions': actions,
      '/api/action-logs/log-0001/exchanges': new Response(JSON.stringify({ title: 'нет интерпретации', status: 409 }), { status: 409, headers: { 'Content-Type': 'application/problem+json' } }),
    })
    const first = await src.getActions()
    expect(first.log?.id).toBe('log-0001')
    expect(first.exchanges).toBeNull()
    expect(first.exchangeNote).toContain('после сохранения описания')
    expect(first.rows.every(r => r.exchange === 'unknown')).toBe(true)
  })
})

describe('гипотезы в сравнении прогонов', () => {
  const h = (id: string, kind: 'fixed' | 'changed', from: 'refuted' | 'no_counterexample', ce: [number, number], app: [number, number]) =>
    ({ id, kind, from, to: 'no_counterexample' as const, counterexamplesFrom: ce[0], counterexamplesTo: ce[1], applicableFrom: app[0], applicableTo: app[1] })

  it('исправленные первыми, дальше по номеру; в строке только то, что изменилось', () => {
    const out = hypothesisChanges([
      h('H10', 'changed', 'no_counterexample', [0, 0], [41, 44]),
      h('H2', 'changed', 'no_counterexample', [0, 0], [34, 40]),
      h('H6', 'fixed', 'refuted', [2, 0], [34, 40]),
    ])
    expect(out.map(c => c.id)).toEqual(['H6', 'H2', 'H10'])
    expect(out[0]).toMatchObject({ tone: 'good', text: 'опровергнута → контрпримеров нет, контрпримеров 2 → 0, проверок 34 → 40' })
    expect(out[1]!.text).toBe('проверок 34 → 40')
  })
})
