import { ApiError, apiClient, readSessionToken, unwrap } from '~/api/client'
import type { Job, JobProgress } from '~/api/types'
import { parseSseChunk } from '~/utils/sse'
import type { ContractSource } from './source'

/** Данные движка по контракту openapi.yaml. */
export function createLiveSource(): ContractSource {
  const api = apiClient()

  return {
    async getProject() {
      const res = await api.GET('/api/project')
      if (res.response.status === 409) return null
      return unwrap(res)
    },
    async openProject(path, mode) {
      return unwrap(await api.POST('/api/project', { body: { path, mode } }))
    },
    async updateSettings(patch) {
      return unwrap(await api.PATCH('/api/project/settings', { body: patch }))
    },
    async listSources() {
      return unwrap(await api.GET('/api/sources', { params: { query: { limit: 500 } } }))
    },
    async importSource(file) {
      const body = new FormData()
      body.append('file', file)
      const res = await api.POST('/api/sources', {
        // Тип тела multipart в схеме — строка; FormData openapi-fetch передаёт как есть.
        body: body as unknown as { file: string },
        bodySerializer: (b) => b as unknown as FormData,
      })
      return unwrap(res).jobId
    },
    async importActionLog(file, mapping) {
      const body = new FormData()
      body.append('file', file)
      body.append('mapping', JSON.stringify(mapping))
      const res = await api.POST('/api/action-logs', {
        body: body as unknown as { file: string, mapping: string },
        bodySerializer: (b) => b as unknown as FormData,
      })
      return unwrap(res)
    },
    async getDiagnostics(sha256) {
      return unwrap(await api.GET('/api/sources/{sha256}/diagnostics', { params: { path: { sha256 } } }))
    },
    async listConnections(query) {
      return unwrap(await api.GET('/api/connections', { params: { query } }))
    },
    async getStreamBytes(stream, from, len) {
      return unwrap(await api.GET('/api/streams/{stream}/bytes', { params: { path: { stream }, query: { from, len } } }))
    },
    async getFrame(source, frameNo) {
      return unwrap(await api.GET('/api/frames/{source}/{frameNo}', { params: { path: { source, frameNo } } }))
    },
    async listJobs() {
      return unwrap(await api.GET('/api/jobs')).items
    },
    async cancelJob(id) {
      return unwrap(await api.DELETE('/api/jobs/{id}', { params: { path: { id } } }))
    },
    watchJob(id, onUpdate) {
      const controller = new AbortController()
      void streamJob(id, onUpdate, controller.signal)
      return () => controller.abort()
    },
  }
}

// EventSource не умеет заголовков, поэтому SSE читаем через fetch со стримом.
async function streamJob(id: string, onUpdate: (job: Job) => void, signal: AbortSignal) {
  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  const token = readSessionToken()
  if (token) headers['X-Protoledger-Token'] = token
  let last: Job | null = null
  try {
    const res = await fetch(`/api/jobs/${encodeURIComponent(id)}/events`, { headers, signal })
    if (!res.ok || !res.body) throw new ApiError(res.status, null)
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const parsed = parseSseChunk(buffer + value)
      buffer = parsed.rest
      for (const ev of parsed.events) {
        if (ev.event === 'state') {
          last = JSON.parse(ev.data) as Job
          onUpdate(last)
        }
        else if (ev.event === 'progress') {
          const { stage, done: d, total, unit } = JSON.parse(ev.data) as JobProgress & { jobId: string }
          const base: Job = last ?? { id, kind: 'import', state: 'running', progress: { stage, done: d, total, unit } }
          last = { ...base, progress: { stage, done: d, total, unit } }
          onUpdate(last)
        }
      }
    }
  }
  catch (e) {
    if (signal.aborted) return
    throw e
  }
}
