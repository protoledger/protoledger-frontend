<script setup lang="ts">
import { screenByPath } from '~/utils/screens'

const route = useRoute()
const project = useProjectStore()
const selection = useSelectionStore()
const data = useData()

const screen = computed(() => screenByPath(route.path))
const crumbs = computed(() => {
  const out = [project.project?.name ?? 'нет проекта']
  if (screen.value && screen.value.path !== '/overview') out.push(screen.value.title)
  if (screen.value?.path === '/overview' && selection.connectionId) {
    out.push(selection.connectionId.split(':')[1] ?? selection.connectionId)
    if (selection.streamId) out.push(selection.streamId.endsWith(':ab') ? 'a → b' : 'b → a')
    if (selection.range) out.push(`смещение ${selection.range.start}`)
  }
  return out
})
const sample = computed(() => data.kind === 'mock' || (screen.value ? data.sampleOnly.has(screen.value.path) : false))
const policies = computed(() => project.project?.settings)
</script>

<template>
  <footer class="flex h-[26px] items-center gap-4 border-t border-pl-line bg-pl-chrome px-2.5 text-xs text-pl-fg">
    <nav class="flex min-w-0 flex-1 items-center gap-1 overflow-hidden whitespace-nowrap" aria-label="Где вы находитесь">
      <template v-for="(c, i) in crumbs" :key="i">
        <UIcon v-if="i" name="i-lucide-chevron-right" class="size-3 text-pl-muted" aria-hidden="true" />
        <span>{{ c }}</span>
      </template>
    </nav>
    <span v-if="policies" class="whitespace-nowrap text-pl-muted">перекрытия <b class="font-semibold text-pl-fg">{{ policies.overlapPolicy }}</b></span>
    <span v-if="policies" class="whitespace-nowrap text-pl-muted">checksum <b class="font-semibold text-pl-fg">{{ policies.checksumPolicy }}</b></span>
    <span class="whitespace-nowrap text-pl-muted">движок {{ project.project?.engineVersion ?? '—' }}</span>
    <span v-if="sample" class="rounded-[3px] border border-dashed border-pl-st-hypothesis px-1.5 text-pl-st-hypothesis" title="Эндпоинтов для этих данных ещё нет — показан пример">пример данных</span>
  </footer>
</template>
