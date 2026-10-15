import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLiveResearchSource } from '~/data/live-research'
import { createMockContractSource } from '~/data/mock/contract'
import { createMockResearchSource } from '~/data/mock/research'

type Call = { method: string, url: string, body: unknown }

function record(reply: (c: Call) => Response) {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: Request) => {
    const text = await input.clone().text()
    const u = new URL(input.url)
    const c = { method: input.method, url: u.pathname + u.search, body: text ? JSON.parse(text) : null }
    calls.push(c)
    return reply(c)
  }))
  return calls
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': status < 300 ? 'application/json' : 'application/problem+json' } })
const live = () => createLiveResearchSource(createMockContractSource(), createMockResearchSource())

afterEach(() => vi.unstubAllGlobals())

describe('новые запросы к движку', () => {
  it('сравнение наборов: a и b — sha256 записей', async () => {
    const calls = record(() => json({ a: {}, b: {}, types: [], fields: [], timing: [], summary: [], incomplete: false }))
    await live().compareCaptures(['a1'], ['b1', 'b2'])
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/interpretation/compare', body: { a: ['a1'], b: ['b1', 'b2'] } })
  })

  it('сообщения прогона: фильтры в адресе, пустые не передаются', async () => {
    const calls = record(() => json({ items: [], total: 0, limit: 100, offset: 0 }))
    await live().getRunItems('run-0002', { category: 'violated', offset: 100 })
    expect(calls[0]!.url).toBe('/api/runs/run-0002/items?limit=100&offset=100&category=violated')
  })

  it('пары запрос→ответ: соединение и страница в теле', async () => {
    const calls = record(() => json({ items: [], total: 0, limit: 100, offset: 0, stats: { exchanges: 0, certain: 0, ordered: 0, ambiguous: 0, unanswered: 0, unsolicited: 0 } }))
    await live().getExchangePairs('3f5a1c0d:c0001', 100)
    expect(calls[0]).toMatchObject({ url: '/api/exchanges', body: { connection: '3f5a1c0d:c0001', limit: 100, offset: 100 } })
  })

  it('удалить наблюдение с гипотезой — ошибка движка доходит до экрана', async () => {
    record(() => json({ title: 'На наблюдение ссылается гипотеза H1', status: 409 }, 409))
    await expect(live().deleteObservation('obs-1')).rejects.toThrow()
  })

  it('закрыть вопрос с ответом', async () => {
    const calls = record(() => json({ id: 'q-1', text: 'x', status: 'closed', answer: 'режим работы' }))
    expect(await live().updateQuestion('q-1', { status: 'closed', answer: 'режим работы' })).toBe(true)
    expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/questions/q-1', body: { status: 'closed', answer: 'режим работы' } })
  })

  it('удаление отвечает 204 без тела — это успех', async () => {
    record(() => new Response(null, { status: 204 }))
    expect(await live().deleteQuestion('q-2')).toBe(true)
    expect(await live().deleteObservation('obs-3')).toBe(true)
  })

  it('поправка часов — полное значение в теле, ответ — новая запись журнала', async () => {
    const calls = record(() => json({ id: 'log-0002', sha256: 'a', name: 'j.csv', rows: 1, skipped: 0, errors: [], mapping: {}, firstTime: null, lastTime: null }))
    expect(await live().applyClockOffset('log-0001', 5000)).toBe('log-0002')
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/action-logs/log-0001/clock-offset', body: { clockOffsetMs: 5000 } })
  })

  it('сохранение описания и «Применить как фрейминг» передают ревизию, от которой правка', async () => {
    const calls = record(c => (c.method !== 'GET'
      ? json({ rev: 5, digest: 'd', created: true })
      : c.url.startsWith('/api/interpretation/revisions') ? json({ items: [{ rev: 4, digest: 'd', createdAt: '2026-10-10T14:00:00Z' }] }) : json({ rev: 4, digest: 'd', yaml: 'format: protoledger/interpretation@1\nmessages: []\n' })))
    await live().saveInterpretation('format: protoledger/interpretation@1\n', 3)
    expect(calls[0]).toMatchObject({ method: 'PUT', body: { baseRev: 3 } })
    await live().applyFraming({ kind: 'length_prefixed', length: { at: 2, type: 'u16be', adjust: 8 }, status: 'hypothesis' })
    expect(calls.at(-1)).toMatchObject({ method: 'PUT', body: { baseRev: 4 } })
  })
})
