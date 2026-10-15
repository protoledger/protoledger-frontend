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
  { id: 'connection', get label() { return tr('shell.search.connections') }, icon: 'i-lucide-arrow-left-right' },
  { id: 'hypothesis', get label() { return tr('shell.search.hypotheses') }, icon: 'i-lucide-flask-conical' },
  { id: 'run', get label() { return tr('shell.search.runs') }, icon: 'i-lucide-circle-check-big' },
  { id: 'observation', get label() { return tr('shell.search.observations') }, icon: 'i-lucide-bookmark' },
]
const workspace = useWorkspaceStore()

const groups = computed(() => [
  {
    id: 'layout',
    label: tr('shell.search.layout'),
    items: [
      { label: workspace.inspector.collapsed ? tr('shell.search.showProps') : tr('shell.search.hideProps'), icon: 'i-lucide-panel-right', kbds: ['alt', '0'], onSelect: () => run(() => { workspace.inspector.collapsed = !workspace.inspector.collapsed }) },
      { label: workspace.bottomOpen ? tr('shell.search.hideBottom') : tr('shell.search.showBottom'), icon: 'i-lucide-panel-bottom', kbds: ['alt', 'F12'], onSelect: () => run(() => { workspace.bottomOpen = !workspace.bottomOpen }) },
      { label: tr('shell.search.focus'), icon: 'i-lucide-maximize-2', kbds: ['meta', 'shift', 'F12'], onSelect: () => run(() => { workspace.focus = true }) },
      { label: tr('shell.search.resetLayout'), icon: 'i-lucide-layout-dashboard', onSelect: () => run(workspace.resetLayout) },
    ],
  },
  {
    id: 'screens',
    label: tr('shell.search.screens'),
    items: SCREENS.map((s, i) => ({ label: s.title, icon: s.icon, kbds: ['alt', String(i + 1)], onSelect: () => go(s.path) })),
  },
  {
    id: 'sources',
    label: tr('shell.search.sources'),
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
  {
    id: 'limit',
    label: tr('shell.search.limit'),
    ignoreFilter: true,
    items: index.value.filter(e => e.group === 'limit').map(e => ({ label: safeText(e.label, 200), icon: 'i-lucide-info', onSelect: () => go(e.path) })),
  },
].filter(g => g.items.length))

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
  <UModal v-model:open="open" :title="tr('shell.search.title')" :description="tr('shell.search.description')">
    <template #content>
      <UCommandPalette :groups="groups" :placeholder="tr('shell.search.placeholder')" class="h-80" @update:open="open = $event" />
    </template>
  </UModal>
</template>
