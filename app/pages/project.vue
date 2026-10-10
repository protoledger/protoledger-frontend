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
  <div class="screen">
    <aside class="tree pl-scroll" aria-label="Структура проекта">
      <CommonPanelHeader title="Структура проекта" />
      <ul v-if="project.project" class="tree__list">
        <li class="tree__node"><UIcon name="i-lucide-folder-open" aria-hidden="true" /> {{ project.project.name }}.protoledger</li>
        <li class="tree__node tree__node--l1"><UIcon name="i-lucide-folder" aria-hidden="true" /> Записи <span class="tree__count">{{ project.sources.length }}</span></li>
        <li v-for="s in project.sources" :key="s.sha256" class="tree__node tree__node--l2">
          <UIcon name="i-lucide-file" aria-hidden="true" /> {{ s.name }}
          <span v-if="s.status === 'importing'" class="tree__count">{{ percent(s) ?? '…' }}%</span>
        </li>
        <li class="tree__node tree__node--l1"><UIcon name="i-lucide-folder" aria-hidden="true" /> Журналы <span class="tree__count">{{ logs.length }}</span></li>
        <li v-for="l in logs" :key="l.name" class="tree__node tree__node--l2"><UIcon name="i-lucide-file" aria-hidden="true" /> {{ l.name }}</li>
        <template v-if="project.extras">
          <li class="tree__node tree__node--l1"><UIcon name="i-lucide-folder" aria-hidden="true" /> Интерпретация <span class="tree__count">{{ project.extras.interpretationRevs.length }} rev</span></li>
          <li v-for="r in project.extras.interpretationRevs" :key="r.rev" class="tree__node tree__node--l2">
            <UIcon name="i-lucide-code-xml" aria-hidden="true" /> rev {{ r.rev }}<span v-if="r.current"> · текущая</span>
          </li>
          <li class="tree__node tree__node--l1"><UIcon name="i-lucide-folder" aria-hidden="true" /> Наблюдения <span class="tree__count">{{ project.extras.observationCount }}</span></li>
          <li class="tree__node tree__node--l1"><UIcon name="i-lucide-folder" aria-hidden="true" /> Гипотезы <span class="tree__count">{{ project.extras.hypothesisCount }}</span></li>
          <li class="tree__node tree__node--l1"><UIcon name="i-lucide-folder" aria-hidden="true" /> Прогоны <span class="tree__count">{{ project.extras.runCount }}</span></li>
        </template>
      </ul>
    </aside>

    <section class="main pl-scroll">
      <CommonAsyncState :pending="project.loading" :error="project.error" :empty="!project.project" empty-text="Проект не открыт." @retry="project.load()">
        <template v-if="project.project">
          <h1 class="pl-display main__title">{{ project.extras?.title ?? project.project.name }}</h1>
          <p class="main__meta">
            {{ project.project.path }} · движок {{ project.project.engineVersion }}
            <template v-if="project.extras"> · создан {{ new Date(project.extras.createdAt).toLocaleDateString('ru-RU') }}</template>
          </p>

          <div class="cards">
            <div class="pl-card card"><b class="pl-display">{{ formatCount(totals.sources) }}</b><span>записи трафика</span></div>
            <div class="pl-card card"><b class="pl-display">{{ formatCount(totals.frames) }}</b><span>кадров</span></div>
            <div class="pl-card card"><b class="pl-display">{{ formatCount(totals.connections) }}</b><span>TCP-соединений</span></div>
            <div class="pl-card card"><b class="pl-display">{{ formatCount(totals.actions) }}</b><span>действий в журнале</span></div>
          </div>

          <div class="actions">
            <button class="pl-btn pl-btn--primary" type="button" @click="fileInput?.click()">+ Импорт записей</button>
            <button class="pl-btn" type="button" disabled title="Импорт журнала появится вместе с эндпоинтом /api/action-logs">+ Журнал действий</button>
            <input ref="fileInput" type="file" accept=".pcap,.pcapng" class="hidden" @change="onFile">
            <span v-if="importError" class="text-[var(--pl-st-violation)]" role="alert">{{ importError }}</span>
          </div>

          <h2 class="pl-caption">Записи</h2>
          <table class="pl-table">
            <thead>
              <tr><th>Файл</th><th>Формат</th><th>SHA256</th><th class="pl-num">Кадры</th><th class="pl-num">Размер</th><th>Состояние</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in project.sources" :key="s.sha256">
                <td>{{ s.name }}</td>
                <td>{{ s.format.toUpperCase() }}</td>
                <td class="pl-mono" :title="s.sha256">{{ s.status === 'importing' ? '—' : `${s.sha256.slice(0, 4)}…${s.sha256.slice(-4)}` }}</td>
                <td class="pl-num">{{ s.status === 'importing' ? '—' : formatCount(s.frameCount) }}</td>
                <td class="pl-num">{{ formatBytesSize(s.sizeBytes) }}</td>
                <td>
                  <div class="flex flex-wrap items-center gap-2">
                    <template v-if="s.status === 'importing'">
                      <CommonStatusBadge status="hypothesis" :label="`импорт ${percent(s) ?? '…'}%`" />
                      <button v-if="jobFor(s)" class="pl-btn pl-btn--ghost h-6" type="button" @click="jobs.cancel(jobFor(s)!.id)">Отменить</button>
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

          <h2 class="pl-caption">Журналы действий</h2>
          <table class="pl-table">
            <thead><tr><th>Файл</th><th>Колонки</th><th class="pl-num">Строк</th><th>Состояние</th></tr></thead>
            <tbody>
              <tr v-for="l in logs" :key="l.name">
                <td>{{ l.name }}</td>
                <td>
                  <span v-for="(m, i) in l.mapping" :key="m.column">{{ i ? ' · ' : '' }}{{ m.column }} → {{ m.field }}</span>
                </td>
                <td class="pl-num">{{ l.rows }}</td>
                <td><CommonStatusBadge :status="l.status === 'mapped' ? 'rule' : 'hypothesis'" :label="l.status === 'mapped' ? 'сопоставлено' : 'нужно сопоставить'" /></td>
              </tr>
            </tbody>
          </table>

          <h2 class="pl-caption">Настройки сборки потоков</h2>
          <dl class="settings">
            <dt>Перекрытие с разными байтами</dt>
            <dd>
              <span class="seg" role="radiogroup" aria-label="Перекрытие с разными байтами">
                <span v-for="[v, l] in OVERLAP" :key="v" role="radio" :aria-checked="project.project.settings.overlapPolicy === v" class="seg__opt">{{ l }}</span>
              </span>
            </dd>
            <dt>Плохая контрольная сумма</dt>
            <dd>
              <span class="seg" role="radiogroup" aria-label="Плохая контрольная сумма">
                <span v-for="[v, l] in CHECKSUM" :key="v" role="radio" :aria-checked="project.project.settings.checksumPolicy === v" class="seg__opt">{{ l }}</span>
              </span>
            </dd>
            <template v-if="project.extras">
              <dt>Окно сопоставления действий</dt>
              <dd>± {{ project.extras.matchWindowMs }} мс от времени действия</dd>
              <dt>Предел длины сообщения</dt>
              <dd>{{ formatBytesSize(project.extras.maxMessageBytes) }} · больше — категория «превышен предел»</dd>
            </template>
          </dl>
          <p class="main__note">
            Изменение настроек пересобирает потоки; результаты, построенные на старой сборке, получат статус
            <CommonStatusBadge status="stale" />.
          </p>
        </template>
      </CommonAsyncState>
    </section>
  </div>
</template>

<style scoped>
.screen {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  height: 100%;
}

.tree {
  border-right: 1px solid var(--pl-line);
  background: var(--pl-bg);
}

.tree__list {
  margin: 0;
  padding: 6px 0;
  list-style: none;
}

.tree__node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 14px;
  white-space: nowrap;
}

.tree__node--l1 {
  padding-left: 30px;
}

.tree__node--l2 {
  padding-left: 48px;
}

.tree__count {
  margin-left: auto;
  color: var(--pl-muted);
  font-size: 11px;
}

.main {
  padding: 18px 16px 24px;
}

.main__title {
  margin: 0;
  color: var(--pl-fg-strong);
  font-size: 24px;
}

.main__meta {
  margin: 4px 0 16px;
  color: var(--pl-muted);
}

.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
}

.card b {
  font-size: 22px;
}

.card span {
  font-size: 12px;
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0 24px;
}

.pl-caption {
  margin: 20px 0 8px;
}

.settings {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 10px 16px;
  align-items: center;
  margin: 0;
}

.settings dd {
  margin: 0;
}

.seg {
  display: inline-flex;
  border: 1px solid var(--pl-line);
  border-radius: 5px;
  overflow: hidden;
}

.seg__opt {
  padding: 6px 14px;
  color: var(--pl-muted);
}

.seg__opt[aria-checked="true"] {
  background: var(--pl-wine);
  color: #fff;
}

.main__note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  color: var(--pl-muted);
}
</style>
