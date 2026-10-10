<script setup lang="ts">
import type { InterpretationTreeNode } from '~/data/views'
import { STATUS } from '~/utils/status'

defineProps<{ node: InterpretationTreeNode, depth: number }>()
</script>

<template>
  <li>
    <div class="flex h-[26px] items-center gap-1.5 pr-3" :class="{ 'bg-pl-wine-soft text-pl-fg-strong': node.selected }" :style="{ paddingLeft: `${12 + depth * 16}px` }">
      <UIcon :name="node.children ? 'i-lucide-chevron-down' : 'i-lucide-dot'" class="size-3.5 text-pl-muted" aria-hidden="true" />
      <span class="flex-1 truncate">{{ node.label }}</span>
      <span v-if="node.badge" class="text-pl-muted">{{ node.badge }}</span>
      <UIcon v-if="node.status" :name="STATUS[node.status].icon" class="size-3.5" :style="{ color: STATUS[node.status].color }" :aria-label="STATUS[node.status].label" />
    </div>
    <ul v-if="node.children?.length" class="m-0 list-none p-0">
      <InterpTreeNode v-for="(c, i) in node.children" :key="i" :node="c" :depth="depth + 1" />
    </ul>
  </li>
</template>
