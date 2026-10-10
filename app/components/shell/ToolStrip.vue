<script setup lang="ts">
import { SCREENS } from '~/utils/screens'

const route = useRoute()
const workspace = useWorkspaceStore()
const project = useProjectStore()

const hasErrors = computed(() =>
  Object.values(project.diagnostics).some(d => d.items.some(i => i.severity === 'error' || i.code === 'bad_checksum')))

function openBottom(tab: 'diagnostics' | 'jobs') {
  if (workspace.bottomOpen && workspace.bottomTab === tab) workspace.bottomOpen = false
  else {
    workspace.bottomOpen = true
    workspace.bottomTab = tab
  }
}
</script>

<template>
  <nav class="strip" aria-label="Окна инструментов">
    <NuxtLink
      v-for="(s, i) in SCREENS"
      :key="s.path"
      :to="s.path"
      class="strip__btn"
      :class="{ 'strip__btn--on': route.path.startsWith(s.path) }"
      :title="`${s.title} (Alt+${i + 1})`"
      :aria-current="route.path.startsWith(s.path) ? 'page' : undefined"
    >
      <UIcon :name="s.icon" class="size-[18px]" aria-hidden="true" />
      <span>{{ s.short }}</span>
      <i v-if="s.path === '/verify' && hasErrors" class="strip__dot" aria-label="есть замечания" />
    </NuxtLink>
    <div class="strip__spacer" />
    <button class="strip__btn" :class="{ 'strip__btn--on': workspace.bottomOpen && workspace.bottomTab === 'diagnostics' }" type="button" title="Диагностика" @click="openBottom('diagnostics')">
      <UIcon name="i-lucide-triangle-alert" class="size-[18px]" aria-hidden="true" />
      <span>Диагн.</span>
    </button>
    <button class="strip__btn" :class="{ 'strip__btn--on': workspace.bottomOpen && workspace.bottomTab === 'jobs' }" type="button" title="Задачи" @click="openBottom('jobs')">
      <UIcon name="i-lucide-activity" class="size-[18px]" aria-hidden="true" />
      <span>Задачи</span>
    </button>
  </nav>
</template>

<style scoped>
.strip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 52px;
  padding: 6px 4px;
  border-right: 1px solid var(--pl-line);
  background: var(--pl-chrome);
}

.strip__btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 0 4px;
  border-radius: 5px;
  color: var(--pl-muted);
  font-size: 9.5px;
  font-weight: 600;
  line-height: 1.1;
}

.strip__btn:hover {
  background: var(--pl-raise);
  color: var(--pl-fg);
}

.strip__btn--on {
  background: var(--pl-wine);
  color: #fff;
}

.strip__btn--on:hover {
  background: var(--pl-wine);
  color: #fff;
}

.strip__dot {
  position: absolute;
  top: 4px;
  right: 9px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--pl-st-violation);
}

.strip__spacer {
  flex: 1;
}
</style>
