import type { ActionLogMapping, ActionLogRecord } from '~/api/types'

const DEFAULT_MAPPING: ActionLogMapping = { time: '', action: '', params: null, result: null, source: null, timeFormat: 'rfc3339', paramsFormat: 'kv', resultFormat: 'kv', delimiter: null, utcOffsetMinutes: 0, clockOffsetMs: 0 }

/** Импорт записей и журнала одним действием: со стартового экрана и с экрана «Записи». */
export function useImportFlow() {
  const data = useData()
  const project = useProjectStore()
  const jobs = useJobsStore()
  const workspace = useWorkspaceStore()
  const errors = ref<string[]>([])

  // Файлы уходят по очереди; ошибка движка приходит в задаче, а не в ответе на загрузку.
  async function importCaptures(files: File[]) {
    errors.value = []
    for (const file of files) {
      try {
        const jobId = await data.importSource(file)
        const label = tr('common.importNamed', { name: file.name })
        jobs.track(jobId, label, (job) => {
          workspace.log(`${label}: ${job.state === 'succeeded' ? tr('common.done') : job.state === 'cancelled' ? tr('common.cancelled') : tr('common.error')}`)
          if (job.state === 'failed') errors.value.push(`${file.name}: ${job.error?.detail ?? job.error?.title ?? tr('project.importFailed')}`)
          void project.load()
        })
        await project.refreshSources()
      }
      catch (err) {
        errors.value.push(`${file.name}: ${err instanceof Error ? err.message : tr('project.importStartFailed')}`)
      }
    }
  }

  /** Журнал без диалога: колонки сопоставляет движок. Не смог — null, тогда нужен диалог. */
  async function importLogAuto(file: File): Promise<ActionLogRecord | null> {
    const guess = await data.guessActionLog(file).catch(() => null)
    if (!guess?.mapping.time || !guess.mapping.action) return null
    const log = await data.importActionLog(file, { ...DEFAULT_MAPPING, ...guess.mapping })
    workspace.log(tr('project.logImported', { name: log.name, rows: log.rows, skipped: log.skipped }))
    return log
  }

  /** Ждёт, пока закончатся фоновые импорты. */
  async function settle(timeoutMs = 120_000) {
    const until = Date.now() + timeoutMs
    await jobs.load()
    while (jobs.active.length && Date.now() < until) {
      await new Promise(r => setTimeout(r, 300))
    }
    await project.load()
  }

  return { errors, importCaptures, importLogAuto, settle }
}

/** Имя папки проекта по имени файла: латиница, цифры, дефис; занято — с датой и временем. */
export function projectFolderName(fileName: string, stamp = false): string {
  const base = fileName.replace(/\.(pcapng|pcap|cap)(\.gz)?$/i, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project'
  if (!stamp) return `${base}.protoledger`
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.protoledger`
}
