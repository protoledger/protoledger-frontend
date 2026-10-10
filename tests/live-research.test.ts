import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveResearchSource, pickExchange } from '~/data/live-research'
import { createMockContractSource } from '~/data/mock/contract'
import { createMockResearchSource } from '~/data/mock/research'
import type { ContractSource } from '~/data/source'

const SHA = 'a'.repeat(64)

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: Request | string) => {
    const url = new URL(typeof input === 'string' ? input : input.url, 'http://x')
    const body = routes[url.pathname]
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
})
