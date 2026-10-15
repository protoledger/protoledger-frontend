import type { AnchorRef } from '~/data/views'

/** Ссылка на байты якоря в «Обзоре записей». */
export function anchorRoute(a: Pick<AnchorRef, 'stream' | 'start' | 'end'>) {
  const cut = a.stream.lastIndexOf(':')
  return { path: '/overview', query: { conn: a.stream.slice(0, cut), dir: a.stream.slice(cut + 1), from: String(a.start), to: String(a.end) } }
}
