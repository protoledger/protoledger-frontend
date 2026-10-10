<script setup lang="ts">
import type { Source } from '~/api/types'
import type { ActionLog } from '~/data/draft'
import { formatBytesSize, formatCount } from '~/utils/bytes'

const data = useData()
const project = useProjectStore()
const jobs = useJobsStore()
const workspace = useWorkspaceStore()
const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)

const { data: logs } = await useAsyncData('action-logs', () => data.getActionLogs(), { default: () => [] as ActionLog[] })

const totals = computed(() => ({
  sources: project.sources.length,
  frames: project.sources.reduce((n, s) => n + s.frameCount, 0),
  connections: project.sources.reduce((n, s) => n + s.connectionCount, 0),
  actions: project.extras?.actionCount ?? 0,
}))

function jobFor(source: Source) {
  return jobs.active.find(j => jobs.labels[j.id]?.endsWith(source.name))
}

function percent(source: Source) {
  const p = jobFor(source)?.progress
  return p && p.total ? Math.round((p.done / p.total) * 100) : null
}

function skipped(source: Source) {
  return project.diagnostics[source.sha256]?.items.filter(d => d.severity === 'info') ?? []
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importError.value = null
  try {
    const jobId = await data.importSource(file)
    const label = `Импорт ${file.name}`
    workspace.log(`${label}: начат`)
    jobs.track(jobId, label, (job) => {
      workspace.log(`${label}: ${job.state === 'succeeded' ? 'готово' : job.state === 'cancelled' ? 'отменён' : 'ошибка'}`)
      void project.load()
    })
    await project.refreshSources()
  }
  catch (err) {
    importError.value = err instanceof Error ? err.message : 'Не удалось начать импорт'
  }
}

const OVERLAP = [['first', 'first'], ['last', 'last'], ['flag', 'flag']] as const
const CHECKSUM = [['ignore', 'ignore'], ['warn', 'warn'], ['drop', 'drop']] as const
</script>

<template>
  <div class="grid h-full grid-cols-[260px_minmax(0,1fr)]">
    <aside class="pl-scroll border-r border-pl-line" aria-label="Структура проекта">
      <CommonPanelHeader title="Структура проекта" />
      <ul v-if="project.project" class="m-0 list-none py-1.5">
        <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-3.5 whitespace-nowrap"><UIcon name="i-lucide-folder-open" aria-hidden="true" /> {{ project.project.name }}.protoledger</li>
        <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" aria-hidden="true" /> Записи <span class="ml-auto text-[11px] text-pl-muted">{{ project.sources.length }}</span></li>
        <li v-for="s in project.sources" :key="s.sha256" class="flex items-center gap-1.5 py-1 pr-2.5 pl-12 whitespace-nowrap">
          <UIcon name="i-lucide-file" aria-hidden="true" /> {{ s.name }}
          <span v-if="s.status === 'importing'" class="ml-auto text-[11px] text-pl-muted">{{ percent(s) ?? '…' }}%</span>
        </li>
        <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" aria-hidden="true" /> Журналы <span class="ml-auto text-[11px] text-pl-muted">{{ logs.length }}</span></li>
        <li v-for="l in logs" :key="l.name" class="flex items-center gap-1.5 py-1 pr-2.5 pl-12 whitespace-nowrap"><UIcon name="i-lucide-file" aria-hidden="true" /> {{ l.name }}</li>
        <template v-if="project.extras">
          <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" aria-hidden="true" /> Интерпретация <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.interpretationRevs.length }} rev</span></li>
          <li v-for="r in project.extras.interpretationRevs" :key="r.rev" class="flex items-center gap-1.5 py-1 pr-2.5 pl-12 whitespace-nowrap">
            <UIcon name="i-lucide-code-xml" aria-hidden="true" /> rev {{ r.rev }}<span v-if="r.current"> · текущая</span>
          </li>
          <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" aria-hidden="true" /> Наблюдения <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.observationCount }}</span></li>
          <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" aria-hidden="true" /> Гипотезы <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.hypothesisCount }}</span></li>
          <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" aria-hidden="true" /> Прогоны <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.runCount }}</span></li>
        </template>
      </ul>
    </aside>

    <section class="pl-scroll px-4 pt-[18px] pb-6">
      <CommonAsyncState :pending="project.loading" :error="project.error" :empty="!project.project" empty-text="Проект не открыт." @retry="project.load()">
        <template v-if="project.project">
          <h1 class="m-0 font-display text-2xl font-semibold text-pl-fg-strong">{{ project.extras?.title ?? project.project.name }}</h1>
          <p class="mt-1 mb-4 text-pl-muted">
            {{ project.project.path }} · движок {{ project.project.engineVersion }}
            <template v-if="project.extras"> · создан {{ new Date(project.extras.createdAt).toLocaleDateString('ru-RU') }}</template>
          </p>

          <div class="grid grid-cols-4 gap-3">
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.sources) }}</b><span>записи трафика</span></div>
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.frames) }}</b><span>кадров</span></div>
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.connections) }}</b><span>TCP-соединений</span></div>
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.actions) }}</b><span>действий в журнале</span></div>
          </div>

          <div class="mt-4 mb-6 flex items-center gap-2.5">
            <button class="pl-btn pl-btn-primary" type="button" @click="fileInput?.click()">+ Импорт записей</button>
            <button class="pl-btn" type="button" disabled title="Импорт журнала появится вместе с эндпоинтом /api/action-logs">+ Журнал действий</button>
            <input ref="fileInput" type="file" accept=".pcap,.pcapng" class="hidden" @change="onFile">
            <span v-if="importError" class="text-pl-st-violation" role="alert">{{ importError }}</span>
          </div>

          <h2 class="pl-caption mt-5 mb-2">Записи</h2>
          <table class="pl-table">
            <thead>
              <tr><th>Файл</th><th>Формат</th><th>SHA256</th><th class="text-right">Кадры</th><th class="text-right">Размер</th><th>Состояние</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in project.sources" :key="s.sha256">
                <td>{{ s.name }}</td>
                <td>{{ s.format.toUpperCase() }}</td>
                <td class="font-mono" :title="s.sha256">{{ s.status === 'importing' ? '—' : `${s.sha256.slice(0, 4)}…${s.sha256.slice(-4)}` }}</td>
                <td class="text-right whitespace-nowrap">{{ s.status === 'importing' ? '—' : formatCount(s.frameCount) }}</td>
                <td class="text-right whitespace-nowrap">{{ formatBytesSize(s.sizeBytes) }}</td>
                <td>
                  <div class="flex flex-wrap items-center gap-2">
                    <template v-if="s.status === 'importing'">
                      <CommonStatusBadge status="hypothesis" :label="`импорт ${percent(s) ?? '…'}%`" />
                      <button v-if="jobFor(s)" class="pl-btn pl-btn-ghost h-6" type="button" @click="jobs.cancel(jobFor(s)!.id)">Отменить</button>
                    </template>
                    <CommonStatusBadge v-else-if="s.status === 'ready'" status="rule" label="готово" />
                    <CommonStatusBadge v-else-if="s.status === 'damaged'" status="violation" label="копия повреждена" />
                    <CommonStatusBadge v-else status="violation" label="ошибка" />
                    <CommonStatusBadge v-for="d in skipped(s)" :key="d.code" status="unsupported" :label="`${formatCount(d.count)} кадров: ${d.title.toLowerCase()}`" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 class="pl-caption mt-5 mb-2">Журналы действий</h2>
          <table class="pl-table">
            <thead><tr><th>Файл</th><th>Колонки</th><th class="text-right">Строк</th><th>Состояние</th></tr></thead>
            <tbody>
              <tr v-for="l in logs" :key="l.name">
                <td>{{ l.name }}</td>
                <td>
                  <span v-for="(m, i) in l.mapping" :key="m.column">{{ i ? ' · ' : '' }}{{ m.column }} → {{ m.field }}</span>
                </td>
                <td class="text-right whitespace-nowrap">{{ l.rows }}</td>
                <td><CommonStatusBadge :status="l.status === 'mapped' ? 'rule' : 'hypothesis'" :label="l.status === 'mapped' ? 'сопоставлено' : 'нужно сопоставить'" /></td>
              </tr>
            </tbody>
          </table>

          <h2 class="pl-caption mt-5 mb-2">Настройки сборки потоков</h2>
          <dl class="m-0 grid grid-cols-[240px_minmax(0,1fr)] items-center gap-x-4 gap-y-2.5 [&_dd]:m-0">
            <dt>Перекрытие с разными байтами</dt>
            <dd>
              <span class="pl-seg" role="radiogroup" aria-label="Перекрытие с разными байтами">
                <span v-for="[v, l] in OVERLAP" :key="v" role="radio" :aria-checked="project.project.settings.overlapPolicy === v">{{ l }}</span>
              </span>
            </dd>
            <dt>Плохая контрольная сумма</dt>
            <dd>
              <span class="pl-seg" role="radiogroup" aria-label="Плохая контрольная сумма">
                <span v-for="[v, l] in CHECKSUM" :key="v" role="radio" :aria-checked="project.project.settings.checksumPolicy === v">{{ l }}</span>
              </span>
            </dd>
            <template v-if="project.extras">
              <dt>Окно сопоставления действий</dt>
              <dd>± {{ project.extras.matchWindowMs }} мс от времени действия</dd>
              <dt>Предел длины сообщения</dt>
              <dd>{{ formatBytesSize(project.extras.maxMessageBytes) }} · больше — категория «превышен предел»</dd>
            </template>
          </dl>
          <p class="mt-3 flex flex-wrap items-center gap-1.5 text-pl-muted">
            Изменение настроек пересобирает потоки; результаты, построенные на старой сборке, получат статус
            <CommonStatusBadge status="stale" />.
          </p>
        </template>
      </CommonAsyncState>
    </section>
  </div>
</template>
