<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<template>
  <div class="p-6">
    <h1 class="pl-display text-lg text-[var(--pl-fg-strong)]">{{ title }}</h1>
    <p class="mt-2 text-[var(--pl-muted)]">Экран готовится.</p>
  </div>
</template>
