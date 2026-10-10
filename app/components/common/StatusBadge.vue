<script setup lang="ts">
import { STATUS, type KnowledgeStatus } from '~/utils/status'

const props = defineProps<{ status: KnowledgeStatus, label?: string }>()
const meta = computed(() => STATUS[props.status])
</script>

<template>
  <span
    class="pl-badge"
    :class="meta.decoration && `pl-badge--${meta.decoration}`"
    :style="{ '--c': meta.color }"
  >
    <UIcon :name="meta.icon" class="size-3.5 shrink-0" aria-hidden="true" />
    <span class="pl-badge__text">{{ label ?? meta.label }}</span>
  </span>
</template>

<style scoped>
.pl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 1px 6px;
  border: 1px solid var(--c);
  border-radius: 3px;
  color: var(--c);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
}

.pl-badge--dashed {
  border-style: dashed;
}

.pl-badge--dotted .pl-badge__text {
  text-decoration: underline dotted;
}

.pl-badge--strike .pl-badge__text {
  text-decoration: line-through;
}
</style>
