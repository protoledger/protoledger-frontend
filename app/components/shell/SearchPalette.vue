<script setup lang="ts">
import type { SearchEntry } from '~/data/views'
import { SCREENS } from '~/utils/screens'

const open = defineModel<boolean>('open', { default: false })
const project = useProjectStore()
const data = useData()
const index = ref<SearchEntry[]>([])

// Объекты проекта подгружаем при открытии: так в поиске свежие гипотезы и прогоны.
watch(open, async (v) => {
  if (!v || !project.project) return
  try {
    index.value = await data.getSearchIndex()
  }
  catch {
    index.value = []
  }
})

const GROUPS: { id: SearchEntry['group'], label: string, icon: string }[] = [
  { id: 'connection', label: 'Соединения', icon: 'i-lucide-arrow-left-right' },
  { id: 'hypothesis', label: 'Гипотезы', icon: 'i-lucide-flask-conical' },
  { id: 'run', label: 'Прогоны', icon: 'i-lucide-circle-check-big' },
  { id: 'observation', label: 'Наблюдения', icon: 'i-lucide-bookmark' },
]
const workspace = useWorkspaceStore()

const groups = computed(() => [
  {
    id: 'layout',
    label: 'Раскладка',
    items: [
      { label: workspace.inspector.collapsed ? 'Показать «Свойства»' : 'Скрыть «Свойства»', icon: 'i-lucide-panel-right', kbds: ['alt', '0'], onSelect: () => run(() => { workspace.inspector.collapsed = !workspace.inspector.collapsed }) },
      { label: workspace.bottomOpen ? 'Скрыть нижнее окно' : 'Показать нижнее окно', icon: 'i-lucide-panel-bottom', kbds: ['alt', 'F12'], onSelect: () => run(() => { workspace.bottomOpen = !workspace.bottomOpen }) },
      { label: 'Режим фокуса', icon: 'i-lucide-maximize-2', kbds: ['meta', 'shift', 'F12'], onSelect: () => run(() => { workspace.focus = true }) },
      { label: 'Сбросить раскладку панелей', icon: 'i-lucide-layout-dashboard', onSelect: () => run(workspace.resetLayout) },
    ],
  },
  {
    id: 'screens',
    label: 'Экраны',
    items: SCREENS.map((s, i) => ({ label: s.title, icon: s.icon, kbds: ['alt', String(i + 1)], onSelect: () => go(s.path) })),
  },
  {
    id: 'sources',
    label: 'Записи',
    items: project.sources.map(s => ({ label: safeText(s.name, 200), suffix: s.sha256.slice(0, 8), icon: 'i-lucide-file', onSelect: () => go('/project') })),
  },
  ...GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    items: index.value.filter(e => e.group === g.id).map(e => ({
      label: safeText(e.label, 200),
      suffix: e.suffix ? safeText(e.suffix, 80) : undefined,
      icon: g.icon,
      onSelect: () => go(e.path, e.query),
    })),
  })).filter(g => g.items.length),
])

function run(action: () => void) {
  open.value = false
  action()
}

async function go(path: string, query?: Record<string, string>) {
  open.value = false
  await navigateTo({ path, query })
}
</script>

<template>
  <UModal v-model:open="open" title="Поиск везде" description="Экраны, записи, соединения">
    <template #content>
      <UCommandPalette :groups="groups" placeholder="Найти экран или запись…" class="h-80" @update:open="open = $event" />
    </template>
  </UModal>
</template>
