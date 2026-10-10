<script setup lang="ts">
import type { ResultCategory } from '~/data/views'

const data = useData()
const draft = useDraftAction()
const jobs = useJobsStore()
const workspace = useWorkspaceStore()
const { data: view, error, refresh, pending } = await useAsyncData('verification', () => data.getVerification())
const runError = ref<string | null>(null)

async function startRun() {
  runError.value = null
  try {
    const jobId = await data.startRun()
    if (!jobId) return draft('Прогон проверки запущен')
    workspace.log('Прогон проверки: начат')
    jobs.track(jobId, 'Прогон проверки', (job) => {
      workspace.log(`Прогон проверки: ${job.state === 'succeeded' ? 'готово' : job.state === 'cancelled' ? 'отменён' : 'ошибка'}`)
      void refresh()
    })
  }
  catch (e) {
    runError.value = e instanceof Error ? e.message : 'Не удалось запустить прогон'
  }
}
const filters = ref<boolean[]>([])
watchEffect(() => { if (view.value && !filters.value.length) filters.value = view.value.filters.map(f => f.active) })

const COLOR: Record<ResultCategory, string> = {
  matched: 'bg-pl-st-rule',
  violated: 'bg-pl-st-violation',
  incomplete: 'bg-pl-st-gap',
  ambiguous: 'bg-pl-st-ambiguous',
  unmatched: 'bg-pl-muted',
  out_of_scope: 'bg-pl-line',
  unsupported: 'bg-[#8a6a52]',
  limit_exceeded: 'bg-pl-focus',
}

const total = computed(() => view.value?.categories.reduce((n, c) => n + c.count, 0) ?? 1)
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader :title="view?.run ? `Прогон ${view.run.id}` : 'Проверка'" :subtitle="view?.run ? [`rev ${view.run.rev ?? '—'}`, view.run.scope, view.run.time].filter(Boolean).join(' · ') : ''">
        <button class="pl-btn pl-btn-primary h-7" type="button" @click="startRun">
          <UIcon name="i-lucide-circle-check-big" class="size-4" aria-hidden="true" /> Запустить
        </button>
      </CommonPanelHeader>
      <p v-if="runError" class="px-3 pt-3 text-pl-st-violation" role="alert">{{ runError }}</p>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view?.run" :empty-text="view?.runsNote ?? 'Прогонов ещё не было.'" @retry="refresh()">
        <div v-if="view" class="p-3">
          <div class="flex items-center gap-2">
            <span class="text-pl-muted">{{ view.filters.length ? 'Фильтры:' : 'Корпус: все записи проекта' }}</span>
            <button v-for="(f, i) in view.filters" :key="f.label" type="button" class="pl-chip" :aria-pressed="filters[i]" @click="filters[i] = !filters[i]">{{ f.label }}</button>
          </div>
          <div class="mt-3.5 grid grid-cols-4 gap-3">
            <div v-for="t in view.totals" :key="t.label" class="pl-card flex flex-col px-3.5 py-2.5 text-xs">
              <b class="font-display text-[22px] font-semibold">{{ t.value }}</b><span>{{ t.label }}</span>
            </div>
          </div>

          <h3 class="pl-caption mt-5 mb-2">Итог по категориям</h3>
          <div class="flex h-6 gap-0.5" role="img" :aria-label="view.categories.map(c => `${c.label}: ${c.count}`).join(', ')">
            <span
              v-for="c in view.categories.filter(x => x.count)"
              :key="c.key"
              class="grid min-w-1 place-items-center text-[11px] font-semibold text-[#131516]"
              :class="COLOR[c.key]"
              :style="{ flexGrow: c.count }"
              :title="`${c.label}: ${c.count}`"
            >
              {{ c.count / total > 0.04 ? c.count : '' }}
            </span>
          </div>
          <div class="mt-2.5 grid grid-cols-4 gap-x-5 gap-y-1.5">
            <div v-for="c in view.categories" :key="c.key" class="flex items-center gap-1.5">
              <i class="size-2.5" :class="COLOR[c.key]" /> <span class="flex-1">{{ c.label }}</span> <b>{{ c.count }}</b>
            </div>
          </div>
          <p class="mt-2 text-pl-muted">{{ view.categoriesNote }}</p>

          <h3 class="pl-caption mt-5 mb-2">Контрпримеры и проблемы</h3>
          <p v-if="!view.problems.length" class="text-pl-muted">Контрпримеров и проблем нет.</p>
          <table v-else class="pl-table">
            <thead><tr><th>Категория</th><th>Где</th><th>Что</th></tr></thead>
            <tbody>
              <tr v-for="(p, i) in view.problems" :key="i">
                <td><CommonStatusBadge :status="p.status" :label="p.label" /></td>
                <td>{{ p.where }}</td>
                <td>{{ p.what }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="view?.diffWith ? `Сравнение с ${view.diffWith}` : 'Прогоны'">
      <div v-if="view" class="pl-scroll flex-1">
        <dl class="pl-dl">
          <template v-for="d in view.diff" :key="d.label">
            <dt>{{ d.label }}</dt>
            <dd :class="{ 'text-pl-st-rule': d.tone === 'good', 'text-pl-st-violation': d.tone === 'bad' }">{{ d.value }}</dd>
          </template>
        </dl>
        <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Прогоны</h3>
        <table class="pl-table">
          <tbody>
            <tr v-for="r in view.runs" :key="r.id" :aria-selected="r.current">
              <td>{{ r.id }}</td><td>{{ r.label }}</td>
              <td><span v-if="r.current">актуален</span><CommonStatusBadge v-else status="stale" /></td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 px-3 text-pl-muted">{{ view.runsNote }}</p>
      </div>
      <footer class="border-t border-pl-line p-3">
        <NuxtLink to="/report" class="pl-btn">В отчёт</NuxtLink>
      </footer>
    </ShellInspectorContent>
  </div>
</template>
