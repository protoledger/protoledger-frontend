<script setup lang="ts">
defineProps<{ title: string, subtitle?: string }>()
</script>

<template>
  <header class="flex min-h-9 items-center gap-2.5 border-b border-pl-line bg-pl-panel px-3 max-md:flex-wrap max-md:gap-y-1.5 max-md:py-1.5">
    <h2 class="m-0 font-display text-[13px] font-semibold whitespace-nowrap text-pl-fg-strong">{{ safeText(title) }}</h2>
    <span v-if="subtitle" class="min-w-0 truncate text-pl-muted">{{ safeText(subtitle) }}</span>
    <div class="ml-auto flex flex-wrap gap-1.5">
      <slot />
    </div>
  </header>
</template>
