<script setup lang="ts">
const props = withDefaults(defineProps<{ id: string, title: string, subtitle?: string, width?: number, min?: number, max?: number }>(), {
  subtitle: undefined, width: 340, min: 200, max: 720,
})

const workspace = useWorkspaceStore()
const { compact } = useViewport()
const state = computed(() => workspace.panel(props.id, props.width))
const { onPointerDown, onKeydown } = useResizer(() => state.value, 'right', props.min, props.max)

// На узком экране панель не занимает место: узкая полоса открывает её поверх рабочей области.
const rail = computed(() => compact.value || state.value.collapsed)
const overlay = computed(() => compact.value && workspace.drawer === props.id)
function open() {
  if (compact.value) workspace.drawer = props.id
  else state.value.collapsed = false
}
function close() {
  if (compact.value) workspace.drawer = null
  else state.value.collapsed = true
}
</script>

<template>
  <template v-if="!workspace.focus">
    <button
      v-if="rail"
      class="flex h-full w-[30px] shrink-0 flex-col items-center gap-2 border-r border-pl-line bg-pl-chrome pt-2 text-pl-muted hover:bg-pl-raise hover:text-pl-fg"
      type="button"
      :title="`Развернуть «${title}»`"
      :aria-expanded="overlay"
      @click="open"
    >
      <UIcon name="i-lucide-panel-left-open" class="size-4" aria-hidden="true" />
      <span class="font-display text-xs font-semibold [writing-mode:vertical-rl]">{{ title }}</span>
    </button>
    <div v-if="overlay" class="fixed inset-0 z-40 bg-black/40" aria-hidden="true" @click="close" />
    <aside
      v-if="compact || !state.collapsed"
      v-show="!compact || overlay"
      class="flex min-h-0 flex-col border-r border-pl-line"
      :class="compact ? 'fixed inset-y-0 left-0 z-50 bg-pl-bg shadow-xl' : 'relative shrink-0'"
      :style="{ width: compact ? `min(90vw, ${state.width}px)` : `${state.width}px` }"
      :aria-label="title"
      @keydown.esc="compact && close()"
    >
      <CommonPanelHeader :title="title" :subtitle="subtitle">
        <slot name="actions" />
        <button class="grid size-6 place-items-center rounded text-pl-muted hover:bg-pl-raise hover:text-pl-fg" type="button" :title="`Свернуть «${title}»`" @click="close">
          <UIcon :name="compact ? 'i-lucide-x' : 'i-lucide-panel-left-close'" class="size-4" aria-hidden="true" />
        </button>
      </CommonPanelHeader>
      <div class="flex min-h-0 flex-1 flex-col">
        <slot />
      </div>
      <div
        v-if="!compact"
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
    </aside>
  </template>
</template>
