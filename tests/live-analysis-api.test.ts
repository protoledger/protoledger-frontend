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
})
