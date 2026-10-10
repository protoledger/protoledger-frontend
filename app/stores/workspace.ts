import { defineStore } from 'pinia'
import { SCREENS } from '~/utils/screens'

export interface PanelState {
  width: number
  collapsed: boolean
}

interface Layout {
  panels: Record<string, PanelState>
  inspector: PanelState
  bottomOpen: boolean
}

const LAYOUT_KEY = 'protoledger-layout'

// Раскладка — удобство одного пользователя, поэтому хранится в браузере; без хранилища работает с умолчаниями.
function readLayout(): Partial<Layout> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}') as Partial<Layout>
  }
  catch {
    return {}
  }
}

/** Открытые вкладки, раскладка панелей и режим фокуса. */
export const useWorkspaceStore = defineStore('workspace', () => {
  const saved = readLayout()
  const tabs = ref<string[]>(['/project', '/overview'])
  const bottomOpen = ref(saved.bottomOpen ?? true)
  const bottomTab = ref<'diagnostics' | 'jobs' | 'events'>('diagnostics')
  const events = ref<{ time: string, text: string }[]>([])
  const panels = ref<Record<string, PanelState>>(saved.panels ?? {})
  const inspector = ref<PanelState>(saved.inspector ?? { width: 360, collapsed: false })
  const focus = ref(false)

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

  function openTab(path: string) {
    if (SCREENS.some(s => s.path === path) && !tabs.value.includes(path)) tabs.value.push(path)
  }

  function closeTab(path: string): string | undefined {
    const i = tabs.value.indexOf(path)
    if (i === -1) return
    tabs.value.splice(i, 1)
    return tabs.value[Math.min(i, tabs.value.length - 1)]
  }

  function log(text: string) {
    const time = new Date().toLocaleTimeString('ru-RU')
    events.value.unshift({ time, text })
    if (events.value.length > 200) events.value.length = 200
  }

  function resetLayout() {
    panels.value = {}
    inspector.value = { width: 360, collapsed: false }
    bottomOpen.value = true
    focus.value = false
  }

  return { tabs, bottomOpen, bottomTab, events, panels, inspector, focus, panel, openTab, closeTab, log, resetLayout }
})
