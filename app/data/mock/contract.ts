import type { Job, Source } from '~/api/types'
import type { ContractSource } from '../source'
import * as stand from './stand'

const delay = (ms = 120) => new Promise(r => setTimeout(r, ms))

/** Пример данных в форме ответов контракта; заменяется createLiveSource без правок экранов. */
export function createMockContractSource(): ContractSource {
  const sources: Source[] = stand.initialSources()
  const jobs = new Map<string, Job>()
  const listeners = new Map<string, Set<(job: Job) => void>>()
  let jobSeq = 1
  const settings = { ...stand.project.settings }

  function emit(job: Job) {
    jobs.set(job.id, job)
    for (const l of listeners.get(job.id) ?? []) l(job)
  }

  function startImport(source: Source, total: number, startAt = 0) {
    const id = `job-${String(jobSeq++).padStart(4, '0')}`
    emit({ id, kind: 'import', state: 'running', progress: { stage: 'reading', done: startAt, total, unit: 'frames' } })
    const timer = setInterval(() => {
      const job = jobs.get(id)
      if (!job) return clearInterval(timer)
      if (job.state === 'cancelling') {
        clearInterval(timer)
        sources.splice(sources.indexOf(source), 1)
        emit({ ...job, state: 'cancelled' })
        return
      }
      const done = Math.min(total, job.progress.done + Math.ceil(total / 60))
      if (done >= total) {
        clearInterval(timer)
        Object.assign(source, { status: 'ready', frameCount: total, connectionCount: 3 })
        emit({ ...job, state: 'succeeded', progress: { stage: 'done', done, total, unit: 'frames' }, result: { sourceSha256: source.sha256, importId: source.importId } })
        return
      }
      emit({ ...job, progress: { stage: done > total * 0.7 ? 'reassembling' : 'reading', done, total, unit: 'frames' } })
    }, 500)
    return id
  }

  const pending = sources.find(s => s.status === 'importing')
  if (pending) startImport(pending, 102_400, 65_536)

  return {
    async getProject() {
      await delay()
      return { ...stand.project, settings: { ...settings }, sourceCount: sources.length }
    },
    async openProject(path) {
      await delay()
      const name = path.split('/').filter(Boolean).pop()?.replace(/\.protoledger$/, '') || stand.project.name
      return { ...stand.project, name, path, settings: { ...settings }, sourceCount: sources.length }
    },
    async updateSettings(patch) {
      await delay()
      Object.assign(settings, patch)
      return { ...stand.project, settings: { ...settings }, sourceCount: sources.length }
    },
    async listSources() {
      await delay()
      return { items: sources.map(s => ({ ...s })), total: sources.length, limit: 500, offset: 0 }
    },
    async importSource(file) {
      await delay()
      const source: Source = {
        sha256: Array.from({ length: 64 }, (_, i) => '0123456789abcdef'[(file.size + i * 7) % 16]).join(''),
        importId: `imp-${String(sources.length + 1).padStart(4, '0')}`,
        name: file.name,
        format: file.name.endsWith('.pcap') ? 'pcap' : 'pcapng',
        sizeBytes: file.size,
        status: 'importing',
        frameCount: 0,
        connectionCount: 0,
      }
      sources.push(source)
      return startImport(source, Math.max(1000, Math.round(file.size / 180)))
    },
    async importActionLog(file, mapping) {
      await delay()
      const rows = Math.max(0, (await file.text()).split(/\r?\n/).filter(Boolean).length - 1)
      return {
        id: 'log-0002',
        sha256: '0'.repeat(64),
        name: file.name,
        rows,
        skipped: 0,
        errors: [],
        mapping: { ...mapping },
        firstTime: null,
        lastTime: null,
      }
    },
    async getDiagnostics(sha256) {
      await delay()
      const src = sources.find(s => s.sha256 === sha256)
      return stand.sourceDiagnostics(sha256, src?.frameCount ?? 0)
    },
    async listConnections(query) {
      await delay()
      let items = stand.connections()
      if (query.source) items = items.filter(c => c.source === query.source)
      if (query.port) items = items.filter(c => c.a.port === query.port || c.b.port === query.port)
      if (query.address) items = items.filter(c => c.a.address === query.address || c.b.address === query.address)
      if (query.flag) items = items.filter(c => c.flags.includes(query.flag!))
      const offset = query.offset ?? 0
      const limit = query.limit ?? 50
      return { items: items.slice(offset, offset + limit), total: items.length, limit, offset }
    },
    async getStreamBytes(stream, from, len) {
      await delay(60)
      return stand.streamBytes(stream, from, len)
    },
    async getFrame(source, frameNo) {
      await delay(60)
      return stand.frame(source, frameNo)
    },
    async listJobs() {
      await delay()
      return [...jobs.values()]
    },
    async cancelJob(id) {
      await delay()
      const job = jobs.get(id)
      if (!job) throw new Error(`Задача ${id} не найдена`)
      if (job.state === 'running' || job.state === 'queued') emit({ ...job, state: 'cancelling' })
      return jobs.get(id)!
    },
    watchJob(id, onUpdate) {
      const set = listeners.get(id) ?? new Set()
      set.add(onUpdate)
      listeners.set(id, set)
      const current = jobs.get(id)
      if (current) queueMicrotask(() => onUpdate(current))
      return () => set.delete(onUpdate)
    },
  }
}
