import { describe, expect, it, vi } from 'vitest'
import type { Connection } from '~/api/types'
import { collectConnections } from '~/data/connections'

const conn = (i: number) => ({ id: `x:c${i}` }) as Connection

describe('collectConnections', () => {
  it('идёт по страницам до конца или до предела и сообщает общее число', async () => {
    const listConnections = vi.fn(async ({ limit = 50, offset = 0 }: { limit?: number, offset?: number }) => {
      const total = 1200
      const items = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => conn(offset + i))
      return { items, total, limit, offset }
    })
    const all = await collectConnections({ listConnections }, 5000)
    expect(all.items).toHaveLength(1200)
    expect(all.items.at(-1)?.id).toBe('x:c1199')
    const capped = await collectConnections({ listConnections }, 700)
    expect(capped).toMatchObject({ total: 1200 })
    expect(capped.items).toHaveLength(700)
  })
})
