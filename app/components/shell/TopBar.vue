<script setup lang="ts">
const project = useProjectStore()
const jobs = useJobsStore()
const data = useData()
const toast = useToast()
const running = ref(false)

// Прогон по всем записям проекта; по завершении открывается его результат на «Проверке».
async function runCheck() {
  if (running.value) return
  running.value = true
  try {
    const jobId = await data.startRun()
    if (!jobId) {
      running.value = false
      return navigateTo('/verify')
    }
    workspace.log(tr('shell.run.started'))
    jobs.track(jobId, tr('shell.run.label'), (job) => {
      running.value = false
      workspace.log(tr('shell.run.state', { state: tr(job.state === 'succeeded' ? 'common.done' : job.state === 'cancelled' ? 'common.cancelled' : 'common.error') }))
      if (job.state === 'failed') toast.add({ title: tr('shell.run.failed'), description: job.error?.detail ?? job.error?.title, color: 'error', icon: 'i-lucide-x' })
      const id = job.result && 'runId' in job.result ? job.result.runId : undefined
      void navigateTo({ path: '/verify', query: id ? { run: id } : {} })
    })
  }
  catch (e) {
    running.value = false
    toast.add({ title: tr('shell.run.notStarted'), description: e instanceof Error ? e.message : undefined, color: 'error', icon: 'i-lucide-x' })
  }
}
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
        <ProjectOpenForm title="" class="p-0" @opened="onProjectOpened" />
      </template>
    </UModal>

    <span class="mr-2 grid size-7 place-items-center rounded bg-pl-wine font-display text-sm font-semibold text-white" aria-label="protoledger">pl</span>
    <button :class="item" type="button" :title="tr('shell.top.openOrCreate')" @click="projectDialog = true">
      <span class="max-w-[40vw] truncate font-display font-semibold">{{ safeText(project.project?.name ?? tr('common.noProject')) }}</span>
      <UIcon name="i-lucide-chevron-down" class="size-3.5" aria-hidden="true" />
    </button>
    <NuxtLink v-if="project.extras" to="/interpretation" :class="[item, 'max-sm:hidden']">
      <span class="text-pl-muted">{{ tr('shell.top.interpretation') }}</span>
      <b>{{ project.extras.interpretationRev ? `rev ${project.extras.interpretationRev}` : tr('shell.top.none') }}</b>
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

    <div v-if="project.project" class="flex h-[30px] items-center gap-1.5 rounded bg-pl-raise pl-2.5 text-pl-fg-strong max-md:bg-transparent max-md:pl-0">
      <NuxtLink to="/verify" class="hover:underline max-md:hidden" :title="tr('shell.top.verifyTitle')"><span class="text-pl-muted">{{ tr('shell.top.verifyLabel') }}</span> <b>{{ tr('shell.top.allRecords') }}</b></NuxtLink>
      <button class="ml-1 grid h-[30px] w-8 place-items-center rounded-r bg-pl-wine text-white disabled:opacity-70" type="button" :disabled="running" :title="running ? tr('shell.top.running') : tr('shell.top.runAll')" @click="runCheck">
        <UIcon :name="running ? 'i-lucide-loader-circle' : 'i-lucide-play'" class="size-4" :class="running && 'animate-spin'" aria-hidden="true" />
      </button>
    </div>
    <button :class="icon" type="button" :title="tr('shell.top.search')" @click="emit('search')">
      <UIcon name="i-lucide-search" class="size-4" aria-hidden="true" />
    </button>
    <button :class="[icon, inspectorOpen && 'text-pl-fg-strong']" type="button" :aria-pressed="inspectorOpen" :title="tr('shell.top.props')" @click="emit('inspector')">
      <UIcon name="i-lucide-panel-right" class="size-4" aria-hidden="true" />
    </button>
    <button :class="[icon, 'max-sm:hidden']" type="button" :aria-pressed="workspace.focus" :title="tr('shell.top.focus')" @click="workspace.focus = !workspace.focus">
      <UIcon :name="workspace.focus ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'" class="size-4" aria-hidden="true" />
    </button>
    <button :class="icon" type="button" :title="colorMode.value === 'dark' ? tr('shell.top.light') : tr('shell.top.dark')" @click="toggleTheme">
      <UIcon :name="colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-4" aria-hidden="true" />
    </button>
    <button class="grid h-[30px] min-w-[30px] place-items-center rounded px-1.5 text-xs font-semibold text-pl-fg hover:bg-pl-raise" type="button" :title="tr('shell.top.language')" :aria-label="tr('shell.top.language')" @click="toggleLocale">
      {{ locale === 'ru' ? 'EN' : 'RU' }}
    </button>
  </header>
</template>
