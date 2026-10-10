import { defineStore } from 'pinia'
import { SCREENS } from '~/utils/screens'

/** Открытые вкладки экранов и состояние нижнего окна. */
export const useWorkspaceStore = defineStore('workspace', () => {
  const tabs = ref<string[]>(['/project', '/overview'])
  const bottomOpen = ref(true)
  const bottomTab = ref<'diagnostics' | 'jobs' | 'events'>('diagnostics')
  const events = ref<{ time: string, text: string }[]>([])

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

  return { tabs, bottomOpen, bottomTab, events, openTab, closeTab, log }
})
