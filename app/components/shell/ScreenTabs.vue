<script setup lang="ts">
import { screenByPath } from '~/utils/screens'

const route = useRoute()
const workspace = useWorkspaceStore()

async function close(path: string) {
  const next = workspace.closeTab(path)
  if (route.path.startsWith(path)) await navigateTo(next ?? '/project')
}
</script>

<template>
  <div class="tabs" role="tablist" aria-label="Открытые экраны">
    <div
      v-for="path in workspace.tabs"
      :key="path"
      class="tabs__tab"
      :class="{ 'tabs__tab--on': route.path.startsWith(path) }"
      role="tab"
      :aria-selected="route.path.startsWith(path)"
    >
      <NuxtLink :to="path" class="tabs__link">
        <UIcon :name="screenByPath(path)?.icon ?? 'i-lucide-file'" class="size-3.5" aria-hidden="true" />
        {{ screenByPath(path)?.title }}
      </NuxtLink>
      <button class="tabs__close" type="button" :aria-label="`Закрыть «${screenByPath(path)?.title}»`" @click="close(path)">
        <UIcon name="i-lucide-x" class="size-3" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  height: 34px;
  overflow-x: auto;
  border-bottom: 1px solid var(--pl-line);
  background: var(--pl-chrome);
  scrollbar-width: none;
}

.tabs__tab {
  display: flex;
  align-items: center;
  padding-right: 8px;
  border-bottom: 2px solid transparent;
  color: var(--pl-muted);
  white-space: nowrap;
}

.tabs__tab--on {
  border-bottom-color: var(--pl-wine-text);
  background: var(--pl-bg);
  color: var(--pl-fg-strong);
}

.tabs__link {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 8px 0 12px;
}

.tabs__close {
  display: grid;
  width: 16px;
  height: 16px;
  place-items: center;
  border-radius: 3px;
  color: var(--pl-muted);
}

.tabs__close:hover {
  background: var(--pl-raise);
  color: var(--pl-fg);
}
</style>
