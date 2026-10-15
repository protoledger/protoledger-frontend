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
})
