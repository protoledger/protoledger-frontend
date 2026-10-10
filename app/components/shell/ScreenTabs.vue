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
  <div class="flex h-[34px] overflow-x-auto border-b border-pl-line bg-pl-chrome [scrollbar-width:none]" role="tablist" aria-label="Открытые экраны">
    <div
      v-for="path in workspace.tabs"
      :key="path"
      class="flex items-center border-b-2 pr-2 whitespace-nowrap"
      :class="route.path.startsWith(path) ? 'border-pl-wine-text bg-pl-bg text-pl-fg-strong' : 'border-transparent text-pl-muted'"
      role="tab"
      :aria-selected="route.path.startsWith(path)"
    >
      <NuxtLink :to="path" class="flex h-full items-center gap-1.5 pr-2 pl-3">
        <UIcon :name="screenByPath(path)?.icon ?? 'i-lucide-file'" class="size-3.5" aria-hidden="true" />
        {{ screenByPath(path)?.title }}
      </NuxtLink>
      <button class="grid size-4 place-items-center rounded-[3px] text-pl-muted hover:bg-pl-raise hover:text-pl-fg" type="button" :aria-label="`Закрыть «${screenByPath(path)?.title}»`" @click="close(path)">
        <UIcon name="i-lucide-x" class="size-3" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
