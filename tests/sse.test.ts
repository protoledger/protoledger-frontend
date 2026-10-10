import { describe, expect, it } from 'vitest'
import { parseSseChunk } from '~/utils/sse'

describe('parseSseChunk', () => {
  it('разбирает события и оставляет незавершённый хвост', () => {
    const { events, rest } = parseSseChunk('event: progress\ndata: {"done":1}\n\nevent: state\ndata: {"st')
    expect(events).toEqual([{ event: 'progress', data: '{"done":1}' }])
    expect(rest).toBe('event: state\ndata: {"st')
  })

  it('склеивает многострочные data, пропускает комментарии и понимает CRLF', () => {
    const { events } = parseSseChunk(': ping\r\ndata: a\r\ndata: b\r\n\r\n')
    expect(events).toEqual([{ event: 'message', data: 'a\nb' }])
  })
})
