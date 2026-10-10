<script setup lang="ts">
import { SCREENS } from '~/utils/screens'

const open = defineModel<boolean>('open', { default: false })
const project = useProjectStore()

const groups = computed(() => [
  {
    id: 'screens',
    label: 'Экраны',
    items: SCREENS.map((s, i) => ({ label: s.title, icon: s.icon, kbds: ['alt', String(i + 1)], onSelect: () => go(s.path) })),
  },
  {
    id: 'sources',
    label: 'Записи',
    items: project.sources.map(s => ({ label: s.name, suffix: s.sha256.slice(0, 8), icon: 'i-lucide-file', onSelect: () => go('/project') })),
  },
])

async function go(path: string) {
  open.value = false
  await navigateTo(path)
}
</script>

<template>
  <UModal v-model:open="open" title="Поиск везде" description="Экраны, записи, соединения">
    <template #content>
      <UCommandPalette :groups="groups" placeholder="Найти экран или запись…" class="h-80" @update:open="open = $event" />
    </template>
  </UModal>
</template>
