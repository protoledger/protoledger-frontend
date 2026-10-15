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

// Записи с дефектами сборки отдельно от чистых: исследование обычно идёт по чистым.
const corpusGroups = computed(() => {
  const byName = [...project.sources].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
  const clean = byName.filter(s => !project.issuesOf(s.sha256))
  const flawed = byName.filter(s => project.issuesOf(s.sha256))
  return [
    { id: 'clean', get title() { return tr('verify.group.clean') }, items: clean },
    { id: 'flawed', get title() { return tr('verify.group.flawed') }, items: flawed },
  ].filter(g => g.items.length)
})

function toggleGroup(items: { sha256: string }[]) {
  const ids = items.map(s => s.sha256)
  const all = ids.every(id => corpusSources.value.includes(id))
  corpusSources.value = all ? corpusSources.value.filter(id => !ids.includes(id)) : [...new Set([...corpusSources.value, ...ids])]
}

// Кнопка «Запустить» берёт корпус из формы — показываем, если он не «всё».
const corpusNote = computed(() => {
  const parts: string[] = []
  if (corpusSources.value.length < project.sources.length) parts.push(tr('verify.corpus.partial', { n: corpusSources.value.length, m: project.sources.length }))
  if (corpusDir.value) parts.push(corpusDir.value === 'a_to_b' ? 'a → b' : 'b → a')
  if (corpusPort.value) parts.push(tr('verify.corpus.port', { n: corpusPort.value }))
  return parts.length ? tr('verify.corpus.note', { parts: parts.join(', ') }) : ''
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
    runError.value = tr('verify.corpus.pickOne')
    return
  }
  try {
    const jobId = await data.startRun(corpus())
    if (!jobId) return draft(tr('verify.runDraft'))
    showCorpus.value = false
    workspace.log(tr('verify.log.started'))
    jobs.track(jobId, tr('verify.jobLabel'), (job) => {
      workspace.log(tr('verify.log.finished', { state: job.state === 'succeeded' ? tr('common.done') : job.state === 'cancelled' ? tr('common.cancelled') : tr('common.error') }))
      const id = job.result && 'runId' in job.result ? job.result.runId : undefined
      if (id && id !== runId.value) void router.replace({ query: { ...route.query, run: id } })
      else void refresh()
    })
  }
  catch (e) {
    runError.value = e instanceof Error ? e.message : tr('verify.startFailed')
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
      <CommonPanelHeader :title="view?.run ? tr('verify.runTitle', { id: view.run.id }) : tr('verify.title')" :subtitle="view?.run ? [`rev ${view.run.rev ?? '—'}`, view.run.scope, view.run.time].filter(Boolean).join(' · ') : ''">
        <CommonStatusBadge v-if="view?.run?.stale" status="stale" :label="tr('verify.stale', { value: view.run.stale })" />
        <span v-if="corpusNote && !showCorpus" class="text-pl-st-hypothesis">{{ corpusNote }}</span>
        <button class="pl-btn h-7" type="button" :aria-expanded="showCorpus" @click="showCorpus = !showCorpus">{{ tr('verify.corpusToggle') }}</button>
        <button class="pl-btn pl-btn-primary h-7" type="button" @click="startRun">
          <UIcon name="i-lucide-circle-check-big" class="size-4" aria-hidden="true" /> {{ tr('verify.run') }}
        </button>
      </CommonPanelHeader>
      <form v-if="showCorpus" class="flex flex-wrap items-end gap-x-6 gap-y-2.5 border-b border-pl-line px-3 py-3" @submit.prevent="startRun">
        <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
          <legend class="pl-caption mb-1">{{ tr('verify.sources') }}</legend>
          <div class="mb-1 flex gap-1.5">
            <button class="pl-chip" type="button" @click="corpusSources = project.sources.map(x => x.sha256)">{{ tr('verify.selectAll') }}</button>
            <button class="pl-chip" type="button" @click="corpusSources = []">{{ tr('verify.selectNone') }}</button>
          </div>
          <div class="grid max-h-72 grid-cols-[auto_auto] items-center gap-x-3 gap-y-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
            <template v-for="g in corpusGroups" :key="g.id">
              <div class="col-span-2 mt-1.5 flex items-center gap-2 first:mt-0">
                <span class="pl-caption">{{ g.title }} · {{ g.items.length }}</span>
                <button class="pl-chip" type="button" @click="toggleGroup(g.items)">{{ g.items.every(s => corpusSources.includes(s.sha256)) ? tr('verify.clear') : tr('verify.select') }}</button>
              </div>
              <template v-for="s in g.items" :key="s.sha256">
                <label class="flex items-center gap-1.5" :title="project.issuesOf(s.sha256)?.labels.join(', ')">
                  <input v-model="corpusSources" type="checkbox" :value="s.sha256"> {{ safeText(s.name) }}
                  <span v-if="project.issuesOf(s.sha256)" class="text-xs text-pl-muted">{{ project.issuesOf(s.sha256)!.labels.join(', ') }}</span>
                </label>
                <button class="text-left text-xs text-pl-muted underline-offset-2 hover:text-pl-fg-strong hover:underline" type="button" :aria-label="tr('verify.onlyAria', { name: s.name })" @click="corpusSources = [s.sha256]">{{ tr('verify.onlyThis') }}</button>
              </template>
            </template>
          </div>
        </fieldset>
        <label class="flex flex-col gap-1">
          <span class="pl-caption">{{ tr('verify.direction') }}</span>
          <select id="corpus-dir" v-model="corpusDir" class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg">
            <option value="">{{ tr('verify.anyDirection') }}</option>
            <option value="a_to_b">a → b</option>
            <option value="b_to_a">b → a</option>
          </select>
        </label>
        <label class="flex flex-col gap-1">
          <span class="pl-caption">{{ tr('verify.portEither') }}</span>
          <input id="corpus-port" v-model.number="corpusPort" type="number" min="1" max="65535" :placeholder="tr('verify.anyPort')" class="h-7 w-28 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg">
        </label>
        <button class="pl-btn pl-btn-primary h-7" type="submit">{{ tr('verify.runOnCorpus') }}</button>
      </form>
      <p v-if="runError" class="px-3 pt-3 text-pl-st-violation" role="alert">{{ runError }}</p>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view?.run" :empty-text="view?.runsNote ?? tr('verify.noRuns')" @retry="refresh()">
        <div v-if="view" class="p-3">
          <div class="flex items-center gap-2">
            <span class="text-pl-muted">{{ view.filters.length ? tr('verify.runCorpus') : tr('verify.runCorpusAll') }}</span>
            <span v-for="f in view.filters" :key="f.label" class="pl-chip inline-flex items-center">{{ safeText(f.label) }}</span>
          </div>
          <div class="mt-3.5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div v-for="t in view.totals" :key="t.label" class="pl-card flex flex-col px-3.5 py-2.5 text-xs">
              <b class="font-display text-[22px] font-semibold">{{ t.value }}</b><span>{{ t.label }}</span>
            </div>
          </div>

          <h3 class="pl-caption mt-5 mb-2">{{ tr('verify.totalsByCategory') }}</h3>
          <div class="flex h-6 gap-0.5" role="img" :aria-label="view.categories.map(c => `${c.label}: ${c.count}`).join(', ')">
            <span
              v-for="c in view.categories.filter(x => x.count)"
              :key="c.key"
              class="grid min-w-1 place-items-center text-[11px] font-semibold text-pl-bg"
              :class="COLOR[c.key]"
              :style="{ flexGrow: c.count }"
              :title="`${c.label}: ${c.count}`"
            >
              {{ c.count / total > 0.04 ? c.count : '' }}
            </span>
          </div>
          <div class="mt-2.5 grid grid-cols-2 gap-x-5 lg:grid-cols-4 gap-y-1.5">
            <div v-for="c in view.categories" :key="c.key" class="flex items-center gap-1.5">
              <i class="size-2.5" :class="COLOR[c.key]" /> <span class="flex-1">{{ c.label }}</span> <b>{{ c.count }}</b>
            </div>
          </div>
          <p class="mt-2 text-pl-muted">{{ view.categoriesNote }}</p>

          <template v-if="view.hypotheses.length">
            <h3 class="pl-caption mt-5 mb-2">{{ tr('verify.hypothesesInRun') }}</h3>
            <table class="pl-table">
              <thead><tr><th>{{ tr('verify.col.hypothesis') }}</th><th>{{ tr('verify.col.test') }}</th><th>{{ tr('verify.col.result') }}</th></tr></thead>
              <tbody>
                <tr v-for="h in view.hypotheses" :key="h.id">
                  <td class="font-semibold">{{ h.id }}</td>
                  <td class="font-mono text-xs break-all">{{ safeText(h.test) }}</td>
                  <td>
                    <div class="flex flex-wrap items-center gap-2">
                      <CommonStatusBadge :status="h.status" :label="h.label" />
                      <NuxtLink v-if="h.status === 'violation'" :to="{ path: '/interpretation', query: { fixFor: h.id } }" class="text-pl-wine-text hover:underline">{{ tr('verify.howToFix') }}</NuxtLink>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p class="mt-1.5 text-pl-muted">{{ tr('verify.noCounterNote') }}</p>
          </template>

          <h3 class="pl-caption mt-5 mb-2">{{ tr('verify.counterexamples') }}</h3>
          <p v-if="!view.problems.length" class="text-pl-muted">{{ tr('verify.noProblems') }}</p>
          <table v-else class="pl-table">
            <thead><tr><th>{{ tr('verify.col.category') }}</th><th>{{ tr('verify.col.where') }}</th><th>{{ tr('verify.col.what') }}</th></tr></thead>
            <tbody>
              <tr
                v-for="(p, i) in view.problems"
                :key="i"
                :class="p.link && 'cursor-pointer'"
                :tabindex="p.link ? 0 : undefined"
                :title="p.link ? tr('verify.openOverview') : undefined"
                @click="openLink(p.link)"
                @keydown.enter="openLink(p.link)"
              >
                <td><CommonStatusBadge :status="p.status" :label="p.label" /></td>
                <td>{{ safeText(p.where) }}</td>
                <td>{{ safeText(p.what) }}</td>
              </tr>
            </tbody>
          </table>

          <VerifyRunItems v-if="view.run" :key="`items-${view.run.id}`" :run-id="view.run.id" :categories="view.categories" />
          <VerifyCoverageMap :key="view.run?.id ?? 'none'" />
          <VerifyExchangeGraph :key="`graph-${view.run?.id ?? 'none'}`" />
        </div>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="view?.diffWith ? tr('verify.compareWith', { run: view.diffWith }) : tr('verify.runs')">
      <div v-if="view" class="pl-scroll flex-1">
        <p v-if="view.diffNote" class="m-0 px-3 pt-3 text-pl-muted">{{ view.diffNote }}</p>
        <dl class="pl-dl">
          <template v-for="d in view.diff" :key="d.label">
            <dt>{{ d.label }}</dt>
            <dd :class="{ 'text-pl-st-rule': d.tone === 'good', 'text-pl-st-violation': d.tone === 'bad' }">{{ d.value }}</dd>
          </template>
        </dl>
        <template v-if="view.hypothesisChanges.length">
          <h3 class="pl-caption m-0 px-3 pt-1 pb-2">{{ tr('verify.hypothesisChanges') }}</h3>
          <dl class="pl-dl pt-0">
            <template v-for="h in view.hypothesisChanges" :key="h.id">
              <dt class="font-semibold">{{ h.id }}</dt>
              <dd :class="{ 'text-pl-st-rule': h.tone === 'good', 'text-pl-st-violation': h.tone === 'bad' }">{{ h.text }}</dd>
            </template>
          </dl>
        </template>
        <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">{{ tr('verify.runs') }}</h3>
        <table class="pl-table">
          <tbody>
            <tr v-for="r in view.runs" :key="r.id" class="cursor-pointer" tabindex="0" :aria-selected="r.id === view.run?.id" @click="openRun(r.id)" @keydown.enter="openRun(r.id)">
              <td>{{ r.id }}</td><td>{{ safeText(r.label) }}</td>
              <td><span v-if="!r.stale">{{ tr('verify.current') }}</span><CommonStatusBadge v-else status="stale" :title="r.stale" /></td>
            </tr>
          </tbody>
        </table>
        <p class="mt-2 px-3 text-pl-muted">{{ view.runsNote }}</p>
      </div>
      <footer class="border-t border-pl-line p-3">
        <NuxtLink to="/report" class="pl-btn">{{ tr('verify.toReport') }}</NuxtLink>
      </footer>
    </ShellInspectorContent>
  </div>
</template>
