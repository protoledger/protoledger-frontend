import { defineStore } from 'pinia'
export interface PanelState {
  width: number
  collapsed: boolean
}

interface Layout {
  panels: Record<string, PanelState>
  inspector: PanelState
  bottomOpen: boolean
}

const LAYOUT_KEY = 'protoledger-layout-v2'

// Раскладка — удобство одного пользователя, поэтому хранится в браузере; без хранилища работает с умолчаниями.
function readLayout(): Partial<Layout> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>
  }
  catch {
    return {}
  }
}

/** Раскладка панелей, нижняя панель, журнал событий и режим фокуса. */
export const useWorkspaceStore = defineStore('workspace', () => {
  const saved = readLayout()
  const bottomOpen = ref(saved.bottomOpen ?? false)
  const bottomTab = ref<'diagnostics' | 'jobs' | 'events'>('diagnostics')
  const events = ref<{ time: string, text: string }[]>([])
  const panels = ref<Record<string, PanelState>>(saved.panels ?? {})
  const inspector = ref<PanelState>(saved.inspector ?? { width: 360, collapsed: false })
  const focus = ref(false)
  // На узком экране панель открывается поверх рабочей области; одновременно — одна (id панели или 'inspector').
  const drawer = ref<string | null>(null)
  // Несохранённый текст описания живёт дольше экрана редактора: переход на другой экран его не теряет.
  const interpDraft = ref<{ rev: number | null, base: number, text: string } | null>(null)
  // Скрытая плашка «что дальше» возвращается при следующем открытии приложения.
  const nextStepsHidden = ref(false)

  watch([panels, inspector, bottomOpen], () => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify({ panels: panels.value, inspector: inspector.value, bottomOpen: bottomOpen.value }))
    }
    catch {
      // Хранилище недоступно — раскладка просто не запомнится.
    }
  }, { deep: true })

  function panel(id: string, defaultWidth: number): PanelState {
    if (!panels.value[id]) panels.value[id] = { width: defaultWidth, collapsed: false }
    return panels.value[id]
  }

  function log(text: string) {
    const time = new Date().toLocaleTimeString(intlLocale())
    events.value.unshift({ time, text })
    if (events.value.length > 200) events.value.length = 200
  }

  function resetLayout() {
    panels.value = {}
    inspector.value = { width: 360, collapsed: false }
    bottomOpen.value = false
    focus.value = false
  }

  // Первая загрузка записей со стартового экрана: он остаётся на месте, пока импорт не закончится.
  const starting = ref(false)
  return { starting, nextStepsHidden, drawer, interpDraft, bottomOpen, bottomTab, events, panels, inspector, focus, panel, log, resetLayout }
})
