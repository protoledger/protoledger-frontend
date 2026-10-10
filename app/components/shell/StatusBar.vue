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
const sample = computed(() => data.kind === 'mock' || screen.value?.inContract === false)
const policies = computed(() => project.project?.settings)
</script>

<template>
  <footer class="status">
    <nav class="status__crumbs" aria-label="Где вы находитесь">
      <template v-for="(c, i) in crumbs" :key="i">
        <UIcon v-if="i" name="i-lucide-chevron-right" class="size-3 text-[var(--pl-muted)]" aria-hidden="true" />
        <span>{{ c }}</span>
      </template>
    </nav>
    <span v-if="policies" class="status__item">перекрытия <b>{{ policies.overlapPolicy }}</b></span>
    <span v-if="policies" class="status__item">checksum <b>{{ policies.checksumPolicy }}</b></span>
    <span class="status__item">движок {{ project.project?.engineVersion ?? '—' }}</span>
    <span v-if="sample" class="status__sample" title="Эндпоинтов для этих данных ещё нет — показан пример">пример данных</span>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 26px;
  padding: 0 10px;
  border-top: 1px solid var(--pl-line);
  background: var(--pl-chrome);
  color: var(--pl-fg);
  font-size: 12px;
}

.status__crumbs {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}

.status__item {
  color: var(--pl-muted);
  white-space: nowrap;
}

.status__item b {
  color: var(--pl-fg);
  font-weight: 600;
}

.status__sample {
  padding: 0 6px;
  border: 1px dashed var(--pl-st-hypothesis);
  border-radius: 3px;
  color: var(--pl-st-hypothesis);
}
</style>
