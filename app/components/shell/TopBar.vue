<script setup lang="ts">
const project = useProjectStore()
const jobs = useJobsStore()
const colorMode = useColorMode()
const emit = defineEmits<{ search: [] }>()

const importJob = computed(() => jobs.active[0] ?? null)
const importPercent = computed(() => {
  const p = importJob.value?.progress
  return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : null
})

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <header class="top">
    <span class="top__logo pl-display" aria-label="protoledger">pl</span>
    <button class="top__item top__project" type="button" title="Проект">
      <span class="pl-display">{{ project.project?.name ?? 'нет проекта' }}</span>
      <UIcon name="i-lucide-chevron-down" class="size-3.5" aria-hidden="true" />
    </button>
    <NuxtLink v-if="project.extras" to="/interpretation" class="top__item top__rev">
      <span class="text-[var(--pl-muted)]">интерпретация</span>
      <b>rev {{ project.extras.interpretationRev }}</b>
      <span v-if="project.extras.interpretationDirty" class="top__dirty">изменена</span>
    </NuxtLink>

    <div class="top__spacer" />

    <div v-if="importJob" class="top__job" aria-live="polite">
      <span class="truncate">{{ jobs.labels[importJob.id] ?? 'Импорт записи' }}</span>
      <span class="top__bar" role="progressbar" :aria-valuenow="importPercent ?? undefined" aria-valuemin="0" aria-valuemax="100">
        <span :style="{ width: `${importPercent ?? 0}%` }" />
      </span>
      <span class="w-9 text-right">{{ importPercent ?? '…' }}%</span>
      <button class="top__icon" type="button" title="Отменить импорт" @click="jobs.cancel(importJob.id)">
        <UIcon name="i-lucide-x" class="size-4" aria-hidden="true" />
      </button>
    </div>

    <div class="top__run">
      <span class="text-[var(--pl-muted)]">проверка:</span>
      <b>все записи</b>
      <UIcon name="i-lucide-chevron-down" class="size-3.5" aria-hidden="true" />
      <NuxtLink to="/verify" class="top__play" title="Запустить проверку (Shift+F10)">
        <UIcon name="i-lucide-play" class="size-4" aria-hidden="true" />
      </NuxtLink>
    </div>
    <button class="top__icon" type="button" title="Поиск везде (Ctrl+K, двойной Shift)" @click="emit('search')">
      <UIcon name="i-lucide-search" class="size-4" aria-hidden="true" />
    </button>
    <button class="top__icon" type="button" :title="colorMode.value === 'dark' ? 'Светлая тема' : 'Тёмная тема'" @click="toggleTheme">
      <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" aria-hidden="true" />
    </button>
  </header>
</template>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 10px 0 8px;
  border-bottom: 1px solid var(--pl-line);
  background: linear-gradient(90deg, rgb(109 7 31 / 22%), var(--pl-chrome) 30%);
}

.top__logo {
  display: grid;
  width: 28px;
  height: 28px;
  margin-right: 8px;
  place-items: center;
  border-radius: 4px;
  background: var(--pl-wine);
  color: #fff;
  font-size: 14px;
}

.top__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 8px;
  border-radius: 4px;
  color: var(--pl-fg-strong);
  font-size: 13px;
}

.top__item:hover {
  background: var(--pl-raise);
}

.top__dirty {
  padding: 0 5px;
  border: 1px solid var(--pl-st-hypothesis);
  border-radius: 3px;
  color: var(--pl-st-hypothesis);
  font-size: 11px;
  font-weight: 600;
}

.top__spacer {
  flex: 1;
}

.top__job {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 420px;
  margin-right: 8px;
  color: var(--pl-fg);
}

.top__bar {
  position: relative;
  flex: 0 0 90px;
  height: 4px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--pl-raise);
}

.top__bar span {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--pl-wine-text);
  transition: width 0.3s;
}

.top__run {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding-left: 10px;
  border-radius: 4px;
  background: var(--pl-raise);
  color: var(--pl-fg-strong);
}

.top__play {
  display: grid;
  width: 32px;
  height: 30px;
  margin-left: 4px;
  place-items: center;
  border-radius: 0 4px 4px 0;
  background: var(--pl-wine);
  color: #fff;
}

.top__icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 4px;
  color: var(--pl-fg);
}

.top__icon:hover {
  background: var(--pl-raise);
}
</style>
