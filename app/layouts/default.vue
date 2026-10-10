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
  <div class="shell">
    <ShellTopBar class="shell__top" @search="searchOpen = true" />
    <ShellToolStrip class="shell__strip" />
    <div class="shell__main">
      <ShellScreenTabs />
      <main class="shell__work">
        <div v-if="project.error" class="p-4" role="alert">
          {{ project.error }}
          <button class="pl-btn ml-3" type="button" @click="project.load()">Повторить</button>
        </div>
        <slot v-else />
      </main>
      <ShellBottomPanel />
    </div>
    <ShellStatusBar class="shell__status" />
    <ShellSearchPalette v-model:open="searchOpen" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-areas: "top top" "strip main" "status status";
  grid-template-columns: 52px minmax(0, 1fr);
  grid-template-rows: 44px minmax(0, 1fr) 26px;
  height: 100vh;
  min-width: 1280px;
  overflow: hidden;
}

.shell__top {
  grid-area: top;
}

.shell__strip {
  grid-area: strip;
}

.shell__main {
  display: flex;
  grid-area: main;
  flex-direction: column;
  min-height: 0;
}

.shell__work {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.shell__status {
  grid-area: status;
}
</style>
