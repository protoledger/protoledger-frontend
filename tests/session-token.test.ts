import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiClient, readSessionToken, resetSessionTokenForTests } from '~/api/client'

function setMeta(content: string | null) {
  document.head.querySelector('meta[name="protoledger-token"]')?.remove()
  if (content === null) return
  const meta = document.createElement('meta')
  meta.name = 'protoledger-token'
  meta.content = content
  document.head.append(meta)
}

afterEach(() => {
  setMeta(null)
  resetSessionTokenForTests()
  vi.unstubAllGlobals()
})

describe('токен сессии', () => {
  it('заглушка и отсутствие тега — нет токена', () => {
    setMeta('__PROTOLEDGER_TOKEN__')
    expect(readSessionToken()).toBeNull()
    setMeta(null)
    expect(readSessionToken()).toBeNull()
  })

  it('после замены тега на заглушку запросы всё равно идут с токеном', async () => {
    const seen: (string | null)[] = []
    vi.stubGlobal('fetch', vi.fn(async (req: Request) => {
      seen.push(req.headers.get('X-Protoledger-Token'))
      return new Response('{"status":"ok","version":"0"}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    setMeta('a'.repeat(64))
    await apiClient().GET('/api/health')
    // Так ведёт себя Nuxt после гидрации: возвращает тег из app.head.
    setMeta('__PROTOLEDGER_TOKEN__')
    await apiClient().GET('/api/health')
    expect(seen).toEqual(['a'.repeat(64), 'a'.repeat(64)])
  })
})
