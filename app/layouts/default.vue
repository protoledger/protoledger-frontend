<script setup lang="ts">
import type { Job } from '~/api/types'
import { SCREENS } from '~/utils/screens'

const route = useRoute()
const workspace = useWorkspaceStore()
const { phone, compact } = useViewport()
const project = useProjectStore()
const jobs = useJobsStore()
const searchOpen = ref(false)

// Телефон: инструменты — нижней строкой вместо строки состояния. Узкий экран: панели выезжают поверх.
// Выезжающая панель закрывается при переходе на другой экран.
watch(() => route.path, () => { workspace.drawer = null })

function toggleInspector() {
  if (compact.value) workspace.drawer = workspace.drawer === 'inspector' ? null : 'inspector'
  else workspace.inspector.collapsed = !workspace.inspector.collapsed
}

function onJobDone(job: Job) {
  const label = jobs.labels[job.id] ?? 'Импорт'
  workspace.log(job.state === 'succeeded' ? `${label}: готово` : `${label}: ${job.state === 'cancelled' ? 'отменён' : 'ошибка'}`)
  void project.load()
}

onMounted(async () => {
  // На телефоне нижнее окно отнимает треть экрана — открывается по кнопке «Диагн.».
  if (phone.value) workspace.bottomOpen = false
  await project.load()
  const importing = project.sources.find(s => s.status === 'importing')
  await jobs.load(onJobDone)
  for (const j of jobs.active) jobs.labels[j.id] = importing ? `Импорт ${importing.name}` : 'Импорт записи'
})

defineShortcuts({
  meta_k: () => { searchOpen.value = true },
  alt_0: () => toggleInspector(),
  alt_f12: () => { workspace.bottomOpen = !workspace.bottomOpen },
  meta_shift_f12: () => { workspace.focus = !workspace.focus },
  escape: { usingInput: false, handler: () => { workspace.focus = false; workspace.drawer = null } },
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
  <div
    class="grid h-dvh overflow-hidden"
    :class="[
      phone ? 'grid-rows-[44px_minmax(0,1fr)_56px]' : 'grid-rows-[44px_minmax(0,1fr)_26px]',
      workspace.focus || phone ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[52px_minmax(0,1fr)]',
    ]"
  >
    <ShellTopBar class="col-span-full" @search="searchOpen = true" @inspector="toggleInspector" />
    <ShellToolStrip v-if="!workspace.focus && !phone" />
    <div class="flex min-h-0 min-w-0 flex-col">
      <ShellNextSteps />
      <div class="flex min-h-0 flex-1">
        <main class="min-h-0 min-w-0 flex-1 overflow-hidden">
          <div v-if="project.error" class="p-4" role="alert">
            {{ project.error }}
            <button class="pl-btn ml-3" type="button" @click="project.load()">Повторить</button>
          </div>
          <slot v-else />
        </main>
        <ShellInspector />
      </div>
      <ShellBottomPanel v-if="!workspace.focus" />
    </div>
    <ShellToolStrip v-if="phone" horizontal class="col-span-full" />
    <ShellStatusBar v-else class="col-span-full" />
    <ShellSearchPalette v-model:open="searchOpen" />
    <button
      v-if="workspace.focus"
      class="fixed right-4 bottom-10 z-20 flex items-center gap-2 rounded border border-pl-line bg-pl-chrome px-3 py-1.5 text-pl-muted shadow-lg hover:text-pl-fg"
      type="button"
      @click="workspace.focus = false"
    >
      <UIcon name="i-lucide-minimize-2" class="size-4" aria-hidden="true" /> Режим фокуса · Esc — выйти
    </button>
  </div>
</template>
