import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Job } from '~/api/types'
import { createLiveSource } from '~/data/live'

afterEach(() => vi.unstubAllGlobals())

describe('задача при обрыве потока событий', () => {
  it('поток закрылся без итога — состояние берётся запросом задачи', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: Request | string) => {
      const url = new URL(typeof input === 'string' ? input : input.url, 'http://x').pathname
      if (url.endsWith('/events')) {
        const body = 'event: progress\ndata: {"jobId":"job-1","stage":"parse","done":5,"total":10,"unit":"frames"}\n\n'
        return new Response(new Blob([body]).stream(), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
      }
      return new Response(JSON.stringify({ id: 'job-1', kind: 'import', state: 'succeeded', progress: { stage: 'done', done: 10, total: 10, unit: 'frames' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const states: Job['state'][] = []
    const finished = new Promise<void>((resolve) => {
      createLiveSource().watchJob('job-1', (job) => {
        states.push(job.state)
        if (job.state === 'succeeded') resolve()
      })
    })
    await finished
    expect(states).toEqual(['running', 'succeeded'])
  })

  it('движок не отвечает — сигнал «нет связи», потом восстановление', async () => {
    let jobCalls = 0
    vi.stubGlobal('fetch', vi.fn(async (input: Request | string) => {
      const url = new URL(typeof input === 'string' ? input : input.url, 'http://x').pathname
      if (url.endsWith('/events')) return new Response(null, { status: 502 })
      jobCalls++
      if (jobCalls === 1) return new Response(null, { status: 502 })
      return new Response(JSON.stringify({ id: 'job-2', kind: 'verify', state: 'succeeded', progress: { stage: 'done', done: 1, total: 1, unit: 'bytes' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    const link: boolean[] = []
    await new Promise<void>((resolve) => {
      createLiveSource().watchJob('job-2', (job) => { if (job.state === 'succeeded') resolve() }, ok => link.push(ok))
    })
    expect(link).toEqual([false, true])
  })
})
