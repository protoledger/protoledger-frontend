<script setup lang="ts">
const workspace = useWorkspaceStore()
const { compact } = useViewport()
const inspectorTitle = useState<string>('inspector-title', () => 'Свойства')
const { onPointerDown, onKeydown } = useResizer(() => workspace.inspector, 'left', 280, 720)

// На узком экране «Свойства» выезжают справа поверх рабочей области. Сама панель всегда в DOM:
// экраны телепортируют в неё содержимое.
const rail = computed(() => compact.value || workspace.inspector.collapsed)
const overlay = computed(() => compact.value && workspace.drawer === 'inspector')
const shown = computed(() => (compact.value ? overlay.value : !workspace.inspector.collapsed))
function open() {
  if (compact.value) workspace.drawer = 'inspector'
  else workspace.inspector.collapsed = false
}
function close() {
  if (compact.value) workspace.drawer = null
  else workspace.inspector.collapsed = true
}
</script>

<template>
  <button
    v-if="rail && !workspace.focus"
    class="flex h-full w-[30px] shrink-0 flex-col items-center gap-2 border-l border-pl-line bg-pl-chrome pt-2 text-pl-muted hover:bg-pl-raise hover:text-pl-fg"
    type="button"
    title="Развернуть «Свойства» (Alt+0)"
    :aria-expanded="overlay"
    @click="open"
  >
    <UIcon name="i-lucide-panel-right-open" class="size-4" aria-hidden="true" />
    <span class="font-display text-xs font-semibold [writing-mode:vertical-rl]">Свойства</span>
  </button>
  <div v-if="overlay" class="fixed inset-0 z-40 bg-black/40" aria-hidden="true" @click="close" />
  <aside
    v-show="shown && !workspace.focus"
    class="flex min-h-0 flex-col border-l border-pl-line bg-pl-bg"
    :class="compact ? 'fixed inset-y-0 right-0 z-50 shadow-xl' : 'relative shrink-0'"
    :style="{ width: compact ? `min(90vw, ${workspace.inspector.width}px)` : `${workspace.inspector.width}px` }"
    aria-label="Свойства"
    @keydown.esc="compact && close()"
  >
    <CommonPanelHeader :title="inspectorTitle">
      <button class="grid size-6 place-items-center rounded text-pl-muted hover:bg-pl-raise hover:text-pl-fg" type="button" title="Свернуть «Свойства» (Alt+0)" @click="close">
        <UIcon :name="compact ? 'i-lucide-x' : 'i-lucide-panel-right-close'" class="size-4" aria-hidden="true" />
      </button>
    </CommonPanelHeader>
    <!-- Сюда экраны отдают свойства выделенного через <ShellInspectorContent>. -->
    <div id="pl-inspector" class="flex min-h-0 flex-1 flex-col" />
    <div
      v-if="!compact"
      class="absolute inset-y-0 -left-0.5 z-10 w-1 cursor-col-resize hover:bg-pl-wine-text focus-visible:bg-pl-wine-text"
      role="separator"
      aria-orientation="vertical"
      :aria-valuenow="workspace.inspector.width"
      aria-valuemin="280"
      aria-valuemax="720"
      aria-label="Ширина «Свойства»: стрелки влево и вправо"
      tabindex="0"
      @pointerdown="onPointerDown"
      @keydown="onKeydown"
    />
  </aside>
</template>
