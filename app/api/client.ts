import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'
import type { Problem } from './types'
import { tr } from '~/utils/i18n'

const TOKEN_PLACEHOLDER = '__PROTOLEDGER_TOKEN__'

let cachedToken: string | null = null

/**
 * Токен сессии из <meta name="protoledger-token">. Первый найденный запоминается:
 * тег может смениться после загрузки, а токен на всю сессию один.
 */
export function readSessionToken(doc: Document = document): string | null {
  if (cachedToken) return cachedToken
  const content = doc.querySelector('meta[name="protoledger-token"]')?.getAttribute('content')
  if (!content || content === TOKEN_PLACEHOLDER) return null
  cachedToken = content
  return content
}

/** Только для тестов: сбросить запомненный токен. */
export function resetSessionTokenForTests() {
  cachedToken = null
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
  ) {
    super(problem?.detail ?? problem?.title ?? tr('common.apiError', { status }))
    this.name = 'ApiError'
  }
}

// Токен добавляется только здесь; в dev без токена его подставляет прокси Nuxt.
const tokenMiddleware: Middleware = {
  onRequest({ request }) {
    const token = readSessionToken()
    if (token) request.headers.set('X-Protoledger-Token', token)
    return request
  },
}

let client: ReturnType<typeof createClient<paths>> | null = null

export function apiClient() {
  if (!client) {
    // fetch берётся при каждом запросе, а не при создании клиента (подмена в тестах).
    // Сетевой обрыв (движок не запущен или упал) превращаем в ответ 502: дальше он идёт как обычная ошибка API.
    client = createClient<paths>({ baseUrl: '/', fetch: request => globalThis.fetch(request).catch(() => new Response(null, { status: 502 })) })
    client.use(tokenMiddleware)
  }
  return client
}

/** Достаёт данные из ответа openapi-fetch или бросает ApiError с Problem Details. */
export function unwrap<T>(result: { data?: T, error?: unknown, response: Response }): T {
  if (result.data !== undefined) return result.data
  const problem = isProblem(result.error) ? result.error : null
  throw new ApiError(result.response.status, problem ?? engineDownProblem(result.response.status))
}

// Ответ без тела с 502/504 — до движка не дошли. В dev /api проксируется на :8080: движок или туннель не запущен.
export function engineDownProblem(status: number): Problem | null {
  if (status !== 502 && status !== 504) return null
  return {
    type: 'urn:protoledger:problem:engine-unavailable',
    title: tr('common.engineDown'),
    status,
    detail: import.meta.dev
      ? tr('common.engineDownDev')
      : tr('common.engineDownApp'),
  }
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && 'title' in value && 'status' in value
}
