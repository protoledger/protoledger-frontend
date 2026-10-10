<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="p-6">
    <h1 class="font-display text-lg font-semibold text-pl-fg-strong">{{ title }}</h1>
    <p class="mt-2 text-pl-muted">Экран готовится.</p>
  </div>
</template>
