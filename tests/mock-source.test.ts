import { describe, expect, it } from 'vitest'
import { createDataSource } from '~/data'

describe('пример данных в форме контракта', () => {
  const data = createDataSource('mock')

  it('участки потока идут подряд и покрывают запрошенный диапазон', async () => {
    const { items } = await data.listConnections({ flag: 'gaps' })
    const stream = items[0]!.streams[0]!
    const res = await data.getStreamBytes(stream.id, 100, 400)
    expect(res.segments[0]!.start).toBe(100)
    expect(res.segments.at(-1)!.end).toBe(100 + res.length)
    for (let i = 1; i < res.segments.length; i++) expect(res.segments[i]!.start).toBe(res.segments[i - 1]!.end)
    const gap = res.segments.find(s => s.status === 'gap')
    expect(gap?.data).toBeNull()
    expect(gap?.frames).toEqual([])
  })

  it('кадр ссылается обратно на свой участок потока', async () => {
    const { items } = await data.listConnections({})
    const conn = items[1]!
    const res = await data.getStreamBytes(conn.streams[0]!.id, 0, 64)
    const ref = res.segments[0]!.frames[0]!
    const frame = await data.getFrame(ref.source, ref.frameNo)
    expect(frame.streamRange?.stream).toBe(conn.streams[0]!.id)
    expect(frame.streamRange?.start).toBe(0)
  })

  it('фильтр по порту', async () => {
    const { items } = await data.listConnections({ port: 443 })
    expect(items.length).toBeGreaterThan(0)
    expect(items.every(c => c.b.port === 443 || c.a.port === 443)).toBe(true)
  })
})
