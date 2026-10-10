<script setup lang="ts">
import { STATUS, type KnowledgeStatus } from '~/utils/status'

const props = defineProps<{ status: KnowledgeStatus, label?: string }>()
const meta = computed(() => STATUS[props.status])
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1 rounded-[3px] border border-[var(--c)] px-1.5 text-[11px] leading-4 font-semibold whitespace-nowrap text-[var(--c)]"
    :class="{ 'border-dashed': meta.decoration === 'dashed' }"
    :style="{ '--c': meta.color }"
  >
    <UIcon :name="meta.icon" class="size-3.5 shrink-0" aria-hidden="true" />
    <span :class="{ 'underline decoration-dotted': meta.decoration === 'dotted', 'line-through': meta.decoration === 'strike' }">{{ safeText(label ?? meta.label) }}</span>
  </span>
</template>
