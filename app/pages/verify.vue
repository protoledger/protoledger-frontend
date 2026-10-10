<script setup lang="ts">
import type { CorpusFilter } from '~/api/types'
import type { ResultCategory, StreamLink } from '~/data/views'

const data = useData()
const draft = useDraftAction()
const jobs = useJobsStore()
const project = useProjectStore()
const workspace = useWorkspaceStore()
const route = useRoute()
const router = useRouter()

const runId = computed(() => (typeof route.query.run === 'string' ? route.query.run : undefined))
const { data: view, error, refresh, pending } = await useAsyncData('verification', () => data.getVerification(runId.value), { watch: [runId] })
const runError = ref<string | null>(null)

// Корпус нового прогона: какие записи, направление, порт. Пусто — всё.
const showCorpus = ref(false)
const corpusSources = ref<string[]>([])
const corpusDir = ref<'' | 'a_to_b' | 'b_to_a'>('')
const corpusPort = ref<number | null>(null)
watchEffect(() => {
  if (!corpusSources.value.length && project.sources.length) corpusSources.value = project.sources.map(s => s.sha256)
})

// Кнопка «Запустить» берёт корпус из формы — показываем, если он не «всё».
const corpusNote = computed(() => {
  const parts: string[] = []
  if (corpusSources.value.length < project.sources.length) parts.push(`${corpusSources.value.length} из ${project.sources.length} зап.`)
  if (corpusDir.value) parts.push(corpusDir.value === 'a_to_b' ? 'a → b' : 'b → a')
  if (corpusPort.value) parts.push(`порт ${corpusPort.value}`)
  return parts.length ? `корпус: ${parts.join(', ')}` : ''
})

function corpus(): CorpusFilter | undefined {
  const all = corpusSources.value.length === project.sources.length
  const filter: CorpusFilter = {
    ...(all ? {} : { sources: corpusSources.value }),
    ...(corpusDir.value ? { direction: corpusDir.value } : {}),
    ...(corpusPort.value ? { port: corpusPort.value } : {}),
  }
  return Object.keys(filter).length ? filter : undefined
}

async function startRun() {
  runError.value = null
  if (project.sources.length && !corpusSources.value.length) {
    runError.value = 'Выберите хотя бы одну запись для корпуса'
    return
  }
  try {
    const jobId = await data.startRun(corpus())
    if (!jobId) return draft('Прогон проверки запущен')
    showCorpus.value = false
    workspace.log('Прогон проверки: начат')
    jobs.track(jobId, 'Прогон проверки', (job) => {
      workspace.log(`Прогон проверки: ${job.state === 'succeeded' ? 'готово' : job.state === 'cancelled' ? 'отменён' : 'ошибка'}`)
      const id = job.result && 'runId' in job.result ? job.result.runId : undefined
      if (id && id !== runId.value) void router.replace({ query: { ...route.query, run: id } })
      else void refresh()
    })
  }
  catch (e) {
    runError.value = e instanceof Error ? e.message : 'Не удалось запустить прогон'
  }
}

function openRun(id: string) {
  void router.replace({ query: { ...route.query, run: id } })
}

function openLink(link: StreamLink | null) {
  if (link) void navigateTo({ path: '/overview', query: { conn: link.conn, dir: link.dir, from: String(link.from), to: String(link.to) } })
}

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
        <CommonStatusBadge v-if="view?.run?.stale" status="stale" :label="`устарел: ${view.run.stale}`" />
        <span v-if="corpusNote && !showCorpus" class="text-pl-st-hypothesis">{{ corpusNote }}</span>
        <button class="pl-btn h-7" type="button" :aria-expanded="showCorpus" @click="showCorpus = !showCorpus">Корпус…</button>
        <button class="pl-btn pl-btn-primary h-7" type="button" @click="startRun">
          <UIcon name="i-lucide-circle-check-big" class="size-4" aria-hidden="true" /> Запустить
        </button>
      </CommonPanelHeader>
      <form v-if="showCorpus" class="flex flex-wrap items-end gap-x-6 gap-y-2.5 border-b border-pl-line px-3 py-3" @submit.prevent="startRun">
        <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
          <legend class="pl-caption mb-1">Записи</legend>
          <label v-for="s in project.sources" :key="s.sha256" class="flex items-center gap-1.5">
            <input v-model="corpusSources" type="checkbox" :value="s.sha256"> {{ safeText(s.name) }}
          </label>
        </fieldset>
        <label class="flex flex-col gap-1">
          <span class="pl-caption">Направление</span>
          <select id="corpus-dir" v-model="corpusDir" class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg">
            <option value="">любое</option>
            <option value="a_to_b">a → b</option>
            <option value="b_to_a">b → a</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="pl-caption">Порт любой стороны</span>
          <input id="corpus-port" v-model.number="corpusPort" type="number" min="1" max="65535" placeholder="любой" class="h-7 w-28 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg">
        </label>
        <button class="pl-btn pl-btn-primary h-7" type="submit">Запустить на корпусе</button>
      </form>
      <p v-if="runError" class="px-3 pt-3 text-pl-st-violation" role="alert">{{ runError }}</p>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view?.run" :empty-text="view?.runsNote ?? 'Прогонов ещё не было.'" @retry="refresh()">
        <div v-if="view" class="p-3">
          <div class="flex items-center gap-2">
            <span class="text-pl-muted">{{ view.filters.length ? 'Корпус прогона:' : 'Корпус прогона: все записи проекта' }}</span>
            <span v-for="f in view.filters" :key="f.label" class="pl-chip inline-flex items-center">{{ safeText(f.label) }}</span>
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
              <tr
                v-for="(p, i) in view.problems"
                :key="i"
                :class="p.link && 'cursor-pointer'"
                :tabindex="p.link ? 0 : undefined"
                :title="p.link ? 'Открыть байты в «Обзоре»' : undefined"
                @click="openLink(p.link)"
                @keydown.enter="openLink(p.link)"
              >
                <td><CommonStatusBadge :status="p.status" :label="p.label" /></td>
                <td>{{ safeText(p.where) }}</td>
                <td>{{ safeText(p.what) }}</td>
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
            <tr v-for="r in view.runs" :key="r.id" class="cursor-pointer" tabindex="0" :aria-selected="r.id === view.run?.id" @click="openRun(r.id)" @keydown.enter="openRun(r.id)">
              <td>{{ r.id }}</td><td>{{ safeText(r.label) }}</td>
              <td><span v-if="!r.stale">актуален</span><CommonStatusBadge v-else status="stale" :title="r.stale" /></td>
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
