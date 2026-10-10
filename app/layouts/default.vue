<script setup lang="ts">
import type { Job } from '~/api/types'
import { SCREENS, screenByPath } from '~/utils/screens'

const route = useRoute()
const workspace = useWorkspaceStore()
const project = useProjectStore()
const jobs = useJobsStore()
const searchOpen = ref(false)

watch(() => route.path, (path) => {
  const screen = screenByPath(path)
  if (screen) workspace.openTab(screen.path)
}, { immediate: true })

function onJobDone(job: Job) {
  const label = jobs.labels[job.id] ?? 'Импорт'
  workspace.log(job.state === 'succeeded' ? `${label}: готово` : `${label}: ${job.state === 'cancelled' ? 'отменён' : 'ошибка'}`)
  void project.load()
}

onMounted(async () => {
  await project.load()
  const importing = project.sources.find(s => s.status === 'importing')
  await jobs.load(onJobDone)
  for (const j of jobs.active) jobs.labels[j.id] = importing ? `Импорт ${importing.name}` : 'Импорт записи'
})

defineShortcuts({
  meta_k: () => { searchOpen.value = true },
  ...Object.fromEntries(SCREENS.map((s, i) => [`alt_${i + 1}`, () => navigateTo(s.path)])),
})

// Двойной Shift — «поиск везде», как в IDE JetBrains.
let lastShift = 0
function onKeyup(e: KeyboardEvent) {
  if (e.key !== 'Shift') return
  const now = Date.now()
  if (now - lastShift < 350) searchOpen.value = true
  lastShift = now
}
onMounted(() => window.addEventListener('keyup', onKeyup))
onBeforeUnmount(() => window.removeEventListener('keyup', onKeyup))
</script>

<template>
  <div class="grid h-screen min-w-[1280px] grid-cols-[52px_minmax(0,1fr)] grid-rows-[44px_minmax(0,1fr)_26px] overflow-hidden">
    <ShellTopBar class="col-span-2" @search="searchOpen = true" />
    <ShellToolStrip />
    <div class="flex min-h-0 flex-col">
      <ShellScreenTabs />
      <main class="min-h-0 flex-1 overflow-hidden">
        <div v-if="project.error" class="p-4" role="alert">
          {{ project.error }}
          <button class="pl-btn ml-3" type="button" @click="project.load()">Повторить</button>
        </div>
        <slot v-else />
      </main>
      <ShellBottomPanel />
    </div>
    <ShellStatusBar class="col-span-2" />
    <ShellSearchPalette v-model:open="searchOpen" />
  </div>
</template>
