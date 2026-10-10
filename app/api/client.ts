import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'
import type { Problem } from './types'

const TOKEN_PLACEHOLDER = '__PROTOLEDGER_TOKEN__'

export function readSessionToken(doc: Document = document): string | null {
  const content = doc.querySelector('meta[name="protoledger-token"]')?.getAttribute('content')
  if (!content || content === TOKEN_PLACEHOLDER) return null
  return content
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `Ошибка API: ${status}`)
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
    client = createClient<paths>({ baseUrl: '/' })
    client.use(tokenMiddleware)
  }
  return client
}

/** Достаёт данные из ответа openapi-fetch или бросает ApiError с Problem Details. */
export function unwrap<T>(result: { data?: T, error?: unknown, response: Response }): T {
  if (result.data !== undefined) return result.data
  const problem = isProblem(result.error) ? result.error : null
  throw new ApiError(result.response.status, problem)
}

function isProblem(value: unknown): value is Problem {
  return typeof value === 'object' && value !== null && 'title' in value && 'status' in value
}
