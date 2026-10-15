import { defineStore } from 'pinia'
import type { ConnectionFlag, Project, Source, SourceDiagnostics } from '~/api/types'
import type { NextStepsView, ProjectExtras } from '~/data/views'
import { ISSUE_FLAGS, sourceIssues } from '~/utils/source-issues'

/** Текущий проект, его записи и замечания к записям. */
export const useProjectStore = defineStore('project', () => {
  const data = useData()
  const project = ref<Project | null>(null)
  const extras = ref<ProjectExtras | null>(null)
  const sources = ref<Source[]>([])
  const diagnostics = ref<Record<string, SourceDiagnostics>>({})
  // Признаки соединений по записям — чтобы пометить записи с дефектами без загрузки всех соединений.
  const flags = ref<Record<string, ConnectionFlag[]>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)
  const nextSteps = ref<NextStepsView['steps']>([])

  // «Что дальше» — подсказка, а не данные проекта: её ошибка не мешает работе.
  async function refreshNextSteps() {
    if (!project.value) {
      nextSteps.value = []
      return
    }
    try {
      nextSteps.value = (await data.getNextSteps()).steps
    }
    catch {
      nextSteps.value = []
    }
  }

  async function load() {
    loading.value = true
    error.value = null
    try {
      // Без открытого проекта остальные эндпоинты отвечают 409 — спрашиваем их только после проекта.
      const p = await data.getProject()
      project.value = p
      if (!p) {
        extras.value = null
        sources.value = []
        diagnostics.value = {}
        flags.value = {}
        nextSteps.value = []
        loaded.value = true
        return
      }
      const [x, s] = await Promise.all([data.getProjectExtras(), data.listSources()])
      extras.value = x
      sources.value = s.items
      const ready = s.items.filter(src => src.status === 'ready')
      const diags = await Promise.all(ready.map(src => data.getDiagnostics(src.sha256)))
      diagnostics.value = Object.fromEntries(diags.map(d => [d.sha256, d]))
      const pages = await Promise.all(ISSUE_FLAGS.map(flag => data.listConnections({ flag, limit: 500 }).then(p => ({ flag, items: p.items }))))
      const bySource: Record<string, ConnectionFlag[]> = {}
      for (const { flag, items } of pages) {
        for (const c of items) {
          const list = (bySource[c.source] ??= [])
          if (!list.includes(flag)) list.push(flag)
        }
      }
      flags.value = bySource
      loaded.value = true
      void refreshNextSteps()
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : tr('common.loadProjectFailed')
    }
    finally {
      loading.value = false
    }
  }

  async function open(path: string, mode: 'create' | 'open') {
    await data.openProject(path, mode)
    await load()
  }

  async function refreshSources() {
    sources.value = (await data.listSources()).items
  }

  function issuesOf(sha256: string) {
    return sourceIssues(diagnostics.value[sha256], flags.value[sha256] ?? [])
  }

  function sourceName(sha256: string): string {
    return sources.value.find(s => s.sha256 === sha256)?.name ?? `${sha256.slice(0, 8)}…`
  }

  return { project, extras, sources, diagnostics, flags, issuesOf, loading, error, loaded, nextSteps, load, open, refreshSources, refreshNextSteps, sourceName }
})
