export interface SseEvent {
  event: string
  data: string
}

/**
 * Разбирает поток text/event-stream по кускам. Возвращает готовые события и необработанный хвост,
 * который нужно передать со следующим куском.
 */
export function parseSseChunk(buffer: string): { events: SseEvent[], rest: string } {
  const events: SseEvent[] = []
  const normalized = buffer.replace(/\r\n?/g, '\n')
  const blocks = normalized.split('\n\n')
  const rest = blocks.pop() ?? ''
  for (const block of blocks) {
    let event = 'message'
    const data: string[] = []
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon === -1 ? line : line.slice(0, colon)
      const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
      if (field === 'event') event = value
      else if (field === 'data') data.push(value)
    }
    if (data.length) events.push({ event, data: data.join('\n') })
  }
  return { events, rest }
}
