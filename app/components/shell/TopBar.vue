<script setup lang="ts">
const project = useProjectStore()
const jobs = useJobsStore()
const colorMode = useColorMode()
const workspace = useWorkspaceStore()
const emit = defineEmits<{ search: [], inspector: [] }>()
const { compact } = useViewport()
const inspectorOpen = computed(() => (compact.value ? workspace.drawer === 'inspector' : !workspace.inspector.collapsed))
const projectDialog = ref(false)

async function onProjectOpened() {
  projectDialog.value = false
  await navigateTo('/project')
}

const importJob = computed(() => jobs.active[0] ?? null)
const importPercent = computed(() => {
  const p = importJob.value?.progress
  return p && p.total > 0 ? Math.round((p.done / p.total) * 100) : null
})

// Язык интерфейса. Тексты, которые экраны уже собрали из ответов движка, пересобираем на новом языке.
async function toggleLocale() {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
  await refreshNuxtData()
  void project.load()
}

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

const item = 'inline-flex h-[30px] items-center gap-1.5 rounded px-2 text-[13px] text-pl-fg-strong hover:bg-pl-raise'
const icon = 'grid size-[30px] place-items-center rounded text-pl-fg hover:bg-pl-raise'
</script>

<template>
  <header class="flex h-11 items-center gap-1.5 border-b border-pl-line bg-linear-to-r from-pl-wine/22 to-pl-chrome to-30% pr-2.5 pl-2">
    <UModal v-model:open="projectDialog" :title="tr('shell.top.projectDialog')" :description="project.project ? tr('shell.top.openNow', { path: project.project.path }) : tr('shell.top.noProject')">
      <template #body>
        <StartScreen embedded @opened="onProjectOpened" />
      </template>
    </UModal>

    <span class="mr-2 grid size-7 place-items-center rounded bg-pl-wine font-display text-sm font-semibold text-white" aria-label="protoledger">pl</span>
    <button :class="item" type="button" :title="tr('shell.top.openOrCreate')" @click="projectDialog = true">
      <span class="max-w-[40vw] truncate font-display font-semibold">{{ safeText(project.project?.name ?? tr('common.noProject')) }}</span>
      <UIcon name="i-lucide-chevron-down" class="size-3.5" aria-hidden="true" />
    </button>
    <NuxtLink v-if="project.extras" to="/protocol" :class="[item, 'max-sm:hidden']">
      <span class="text-pl-muted">{{ tr('shell.top.interpretation') }}</span>
      <b>{{ project.extras.interpretationRev ? tr('shell.top.version', { n: project.extras.interpretationRev }) : tr('shell.top.none') }}</b>
      <span v-if="project.extras.interpretationDirty || workspace.interpDraft" :title="tr('shell.top.dirtyTitle')" class="rounded-[3px] border border-pl-st-hypothesis px-1.5 text-[11px] font-semibold text-pl-st-hypothesis">{{ tr('shell.top.dirty') }}</span>
    </NuxtLink>

    <div class="flex-1" />

    <div v-if="importJob" class="mr-2 flex max-w-[420px] items-center gap-2.5" aria-live="polite">
      <span class="truncate max-md:hidden">{{ safeText(jobs.labels[importJob.id] ?? tr('common.importSource')) }}</span>
      <span class="relative h-1 w-[90px] flex-none overflow-hidden rounded-sm bg-pl-raise" role="progressbar" :aria-valuenow="importPercent ?? undefined" aria-valuemin="0" aria-valuemax="100">
        <span class="absolute inset-y-0 left-0 bg-pl-wine-text transition-[width] duration-300" :style="{ width: `${importPercent ?? 0}%` }" />
      </span>
      <span class="w-9 text-right">{{ importPercent ?? '…' }}%</span>
      <button :class="icon" type="button" :title="tr('shell.top.cancelImport')" @click="jobs.cancel(importJob.id)">
        <UIcon name="i-lucide-x" class="size-4" aria-hidden="true" />
      </button>
    </div>

    <button :class="icon" type="button" :title="tr('shell.top.search')" @click="emit('search')">
      <UIcon name="i-lucide-search" class="size-4" aria-hidden="true" />
    </button>
    <button :class="[icon, inspectorOpen && 'text-pl-fg-strong']" type="button" :aria-pressed="inspectorOpen" :title="tr('shell.top.props')" @click="emit('inspector')">
      <UIcon name="i-lucide-panel-right" class="size-4" aria-hidden="true" />
    </button>
    <button :class="icon" type="button" :title="colorMode.value === 'dark' ? tr('shell.top.light') : tr('shell.top.dark')" @click="toggleTheme">
      <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" aria-hidden="true" />
    </button>
    <button class="grid h-[30px] min-w-[30px] place-items-center rounded px-1.5 text-xs font-semibold text-pl-fg hover:bg-pl-raise" type="button" :title="tr('shell.top.language')" :aria-label="tr('shell.top.language')" @click="toggleLocale">
      {{ locale === 'ru' ? 'EN' : 'RU' }}
    </button>
  </header>
</template>
