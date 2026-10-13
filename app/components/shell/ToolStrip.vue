<script setup lang="ts">
import { SCREENS } from '~/utils/screens'

// horizontal — нижняя строка инструментов на телефоне, с прокруткой вбок.
defineProps<{ horizontal?: boolean }>()

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

const btn = 'relative flex flex-col items-center gap-0.5 rounded-[5px] pt-1.5 pb-1 text-[9.5px] leading-[1.1] font-semibold text-pl-muted hover:bg-pl-raise hover:text-pl-fg'
const on = 'bg-pl-wine text-white hover:bg-pl-wine hover:text-white'
</script>

<template>
  <nav
    class="flex gap-0.5 bg-pl-chrome"
    :class="horizontal ? 'pl-scroll items-stretch overflow-x-auto overflow-y-hidden border-t border-pl-line px-1 py-1 [&>*]:min-w-[56px] [&>*]:shrink-0' : 'w-[52px] flex-col border-r border-pl-line px-1 py-1.5'"
    aria-label="Окна инструментов"
  >
    <NuxtLink
      v-for="(s, i) in SCREENS"
      :key="s.path"
      :to="s.path"
      :class="[btn, route.path.startsWith(s.path) && on]"
      :title="`${s.title} (Alt+${i + 1})`"
      :aria-current="route.path.startsWith(s.path) ? 'page' : undefined"
    >
      <UIcon :name="s.icon" class="size-[18px]" aria-hidden="true" />
      <span>{{ s.short }}</span>
      <i v-if="s.path === '/verify' && hasErrors" class="absolute top-1 right-[9px] size-1.5 rounded-full bg-pl-st-violation" aria-label="есть замечания" />
    </NuxtLink>
    <div class="flex-1" :class="horizontal && 'min-w-2'" />
    <button :class="[btn, workspace.bottomOpen && workspace.bottomTab === 'diagnostics' && on]" type="button" title="Диагностика" @click="openBottom('diagnostics')">
      <UIcon name="i-lucide-triangle-alert" class="size-[18px]" aria-hidden="true" />
      <span>Диагн.</span>
    </button>
    <button :class="[btn, workspace.bottomOpen && workspace.bottomTab === 'jobs' && on]" type="button" title="Задачи" @click="openBottom('jobs')">
      <UIcon name="i-lucide-activity" class="size-[18px]" aria-hidden="true" />
      <span>Задачи</span>
    </button>
  </nav>
</template>
