<script setup lang="ts">
defineProps<{ title: string, subtitle?: string }>()
</script>

<template>
  <header class="pl-panel-header">
    <h2 class="pl-display pl-panel-header__title">{{ title }}</h2>
    <span v-if="subtitle" class="pl-panel-header__sub">{{ subtitle }}</span>
    <div class="pl-panel-header__actions">
      <slot />
    </div>
  </header>
</template>

<style scoped>
.pl-panel-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--pl-line);
  background: var(--pl-panel);
}

.pl-panel-header__title {
  margin: 0;
  color: var(--pl-fg-strong);
  font-size: 13px;
  white-space: nowrap;
}

.pl-panel-header__sub {
  overflow: hidden;
  color: var(--pl-muted);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pl-panel-header__actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
</style>
