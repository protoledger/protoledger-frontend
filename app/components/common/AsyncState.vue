<script setup lang="ts">
defineProps<{ pending: boolean, error?: string | null, empty?: boolean, emptyText?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="error" class="pl-state" role="alert">
    <span>{{ error }}</span>
    <button class="pl-btn" type="button" @click="$emit('retry')">Повторить</button>
  </div>
  <div v-else-if="pending && empty" class="pl-state" aria-live="polite">Загрузка…</div>
  <div v-else-if="empty" class="pl-state">{{ emptyText ?? 'Пусто' }}</div>
  <slot v-else />
</template>

<style scoped>
.pl-state {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  color: var(--pl-muted);
}
</style>
