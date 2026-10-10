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

const item = 'inline-flex h-[30px] items-center gap-1.5 rounded px-2 text-[13px] text-pl-fg-strong hover:bg-pl-raise'
const icon = 'grid size-[30px] place-items-center rounded text-pl-fg hover:bg-pl-raise'
</script>

<template>
  <header class="flex h-11 items-center gap-1.5 border-b border-pl-line bg-linear-to-r from-pl-wine/22 to-pl-chrome to-30% pr-2.5 pl-2">
    <span class="mr-2 grid size-7 place-items-center rounded bg-pl-wine font-display text-sm font-semibold text-white" aria-label="protoledger">pl</span>
    <button :class="item" type="button" title="Проект">
      <span class="font-display font-semibold">{{ project.project?.name ?? 'нет проекта' }}</span>
      <UIcon name="i-lucide-chevron-down" class="size-3.5" aria-hidden="true" />
    </button>
    <NuxtLink v-if="project.extras" to="/interpretation" :class="item">
      <span class="text-pl-muted">интерпретация</span>
      <b>rev {{ project.extras.interpretationRev }}</b>
      <span v-if="project.extras.interpretationDirty" class="rounded-[3px] border border-pl-st-hypothesis px-1.5 text-[11px] font-semibold text-pl-st-hypothesis">изменена</span>
    </NuxtLink>

    <div class="flex-1" />

    <div v-if="importJob" class="mr-2 flex max-w-[420px] items-center gap-2.5" aria-live="polite">
      <span class="truncate">{{ jobs.labels[importJob.id] ?? 'Импорт записи' }}</span>
      <span class="relative h-1 w-[90px] flex-none overflow-hidden rounded-sm bg-pl-raise" role="progressbar" :aria-valuenow="importPercent ?? undefined" aria-valuemin="0" aria-valuemax="100">
        <span class="absolute inset-y-0 left-0 bg-pl-wine-text transition-[width] duration-300" :style="{ width: `${importPercent ?? 0}%` }" />
      </span>
      <span class="w-9 text-right">{{ importPercent ?? '…' }}%</span>
      <button :class="icon" type="button" title="Отменить импорт" @click="jobs.cancel(importJob.id)">
        <UIcon name="i-lucide-x" class="size-4" aria-hidden="true" />
      </button>
    </div>

    <div class="flex h-[30px] items-center gap-1.5 rounded bg-pl-raise pl-2.5 text-pl-fg-strong">
      <span class="text-pl-muted">проверка:</span>
      <b>все записи</b>
      <UIcon name="i-lucide-chevron-down" class="size-3.5" aria-hidden="true" />
      <NuxtLink to="/verify" class="ml-1 grid h-[30px] w-8 place-items-center rounded-r bg-pl-wine text-white" title="Запустить проверку">
        <UIcon name="i-lucide-play" class="size-4" aria-hidden="true" />
      </NuxtLink>
    </div>
    <button :class="icon" type="button" title="Поиск везде (Ctrl+K, двойной Shift)" @click="emit('search')">
      <UIcon name="i-lucide-search" class="size-4" aria-hidden="true" />
    </button>
    <button :class="icon" type="button" :title="colorMode.value === 'dark' ? 'Светлая тема' : 'Тёмная тема'" @click="toggleTheme">
      <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" aria-hidden="true" />
    </button>
  </header>
</template>
