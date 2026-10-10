<script setup lang="ts">
defineProps<{ pending: boolean, error?: string | null, empty?: boolean, emptyText?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="error" class="flex flex-col items-start gap-2.5 p-4 text-pl-muted" role="alert">
    <span>{{ error }}</span>
    <button class="pl-btn" type="button" @click="$emit('retry')">Повторить</button>
  </div>
  <div v-else-if="pending && empty" class="p-4 text-pl-muted" aria-live="polite">Загрузка…</div>
  <div v-else-if="empty" class="p-4 text-pl-muted">{{ emptyText ?? 'Пусто' }}</div>
  <slot v-else />
</template>
