import { defineStore } from 'pinia'
import type { Project, Source, SourceDiagnostics } from '~/api/types'
import type { ProjectExtras } from '~/data/draft'

/** Текущий проект, его записи и замечания к записям. */
export const useProjectStore = defineStore('project', () => {
  const data = useData()
  const project = ref<Project | null>(null)
  const extras = ref<ProjectExtras | null>(null)
  const sources = ref<Source[]>([])
  const diagnostics = ref<Record<string, SourceDiagnostics>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  async function load() {
    loading.value = true
    error.value = null
    try {
      const [p, x, s] = await Promise.all([data.getProject(), data.getProjectExtras(), data.listSources()])
      project.value = p
      extras.value = x
      sources.value = s.items
      const ready = s.items.filter(src => src.status === 'ready')
      const diags = await Promise.all(ready.map(src => data.getDiagnostics(src.sha256)))
      diagnostics.value = Object.fromEntries(diags.map(d => [d.sha256, d]))
      loaded.value = true
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Не удалось загрузить проект'
    }
    finally {
      loading.value = false
    }
  }

  async function refreshSources() {
    sources.value = (await data.listSources()).items
  }

  function sourceName(sha256: string): string {
    return sources.value.find(s => s.sha256 === sha256)?.name ?? `${sha256.slice(0, 8)}…`
  }

  return { project, extras, sources, diagnostics, loading, error, loaded, load, refreshSources, sourceName }
})
