<script setup lang="ts">
const workspace = useWorkspaceStore()
const inspectorTitle = useState<string>('inspector-title', () => 'Свойства')
const { onPointerDown, onKeydown } = useResizer(() => workspace.inspector, 'left', 280, 720)
</script>

<template>
  <aside
    v-show="!workspace.focus"
    class="relative flex min-h-0 shrink-0 flex-col border-l border-pl-line bg-pl-bg"
    :style="{ width: workspace.inspector.collapsed ? '30px' : `${workspace.inspector.width}px` }"
    aria-label="Свойства"
  >
    <button
      v-if="workspace.inspector.collapsed"
      class="flex h-full w-full flex-col items-center gap-2 bg-pl-chrome pt-2 text-pl-muted hover:bg-pl-raise hover:text-pl-fg"
      type="button"
      title="Развернуть «Свойства» (Alt+0)"
      @click="workspace.inspector.collapsed = false"
    >
      <UIcon name="i-lucide-panel-right-open" class="size-4" aria-hidden="true" />
      <span class="font-display text-xs font-semibold [writing-mode:vertical-rl]">Свойства</span>
    </button>
    <div v-show="!workspace.inspector.collapsed" class="flex min-h-0 flex-1 flex-col">
      <CommonPanelHeader :title="inspectorTitle">
        <button class="grid size-6 place-items-center rounded text-pl-muted hover:bg-pl-raise hover:text-pl-fg" type="button" title="Свернуть «Свойства» (Alt+0)" @click="workspace.inspector.collapsed = true">
          <UIcon name="i-lucide-panel-right-close" class="size-4" aria-hidden="true" />
        </button>
      </CommonPanelHeader>
      <!-- Сюда экраны отдают свойства выделенного через <ShellInspectorContent>. -->
      <div id="pl-inspector" class="flex min-h-0 flex-1 flex-col" />
    </div>
    <div
      v-show="!workspace.inspector.collapsed"
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
