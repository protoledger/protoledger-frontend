<script setup lang="ts">
const props = withDefaults(defineProps<{ id: string, title: string, subtitle?: string, width?: number, min?: number, max?: number }>(), {
  subtitle: undefined, width: 340, min: 200, max: 720,
})

const workspace = useWorkspaceStore()
const state = computed(() => workspace.panel(props.id, props.width))
const { onPointerDown, onKeydown } = useResizer(() => state.value, 'right', props.min, props.max)
</script>

<template>
  <aside
    v-if="!workspace.focus"
    class="relative flex min-h-0 shrink-0 flex-col border-r border-pl-line"
    :style="{ width: state.collapsed ? '30px' : `${state.width}px` }"
    :aria-label="title"
  >
    <button
      v-if="state.collapsed"
      class="flex h-full w-full flex-col items-center gap-2 bg-pl-chrome pt-2 text-pl-muted hover:bg-pl-raise hover:text-pl-fg"
      type="button"
      :title="`Развернуть «${title}»`"
      @click="state.collapsed = false"
    >
      <UIcon name="i-lucide-panel-left-open" class="size-4" aria-hidden="true" />
      <span class="font-display text-xs font-semibold [writing-mode:vertical-rl]">{{ title }}</span>
    </button>
    <template v-else>
      <CommonPanelHeader :title="title" :subtitle="subtitle">
        <slot name="actions" />
        <button class="grid size-6 place-items-center rounded text-pl-muted hover:bg-pl-raise hover:text-pl-fg" type="button" :title="`Свернуть «${title}»`" @click="state.collapsed = true">
          <UIcon name="i-lucide-panel-left-close" class="size-4" aria-hidden="true" />
        </button>
      </CommonPanelHeader>
      <div class="flex min-h-0 flex-1 flex-col">
        <slot />
      </div>
      <div
        class="absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize hover:bg-pl-wine-text focus-visible:bg-pl-wine-text"
        role="separator"
        aria-orientation="vertical"
        :aria-valuenow="state.width"
        :aria-valuemin="min"
        :aria-valuemax="max"
        :aria-label="`Ширина «${title}»: стрелки влево и вправо`"
        tabindex="0"
        @pointerdown="onPointerDown"
        @keydown="onKeydown"
      />
    </template>
  </aside>
</template>
