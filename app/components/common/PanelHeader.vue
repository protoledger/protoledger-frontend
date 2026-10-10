<script setup lang="ts">
defineProps<{ title: string, subtitle?: string }>()
</script>

<template>
  <header class="flex min-h-9 items-center gap-2.5 border-b border-pl-line bg-pl-panel px-3">
    <h2 class="m-0 font-display text-[13px] font-semibold whitespace-nowrap text-pl-fg-strong">{{ safeText(title) }}</h2>
    <span v-if="subtitle" class="truncate text-pl-muted">{{ safeText(subtitle) }}</span>
    <div class="ml-auto flex gap-1.5">
      <slot />
    </div>
  </header>
</template>
