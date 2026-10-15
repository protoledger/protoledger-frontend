<script setup lang="ts">
import type { ActionLogRecord, ProjectSettings, Source } from '~/api/types'
import type { ActionLog } from '~/data/views'
import { formatBytesSize, formatCount } from '~/utils/bytes'
import { DIAGNOSTIC_STATUS } from '~/utils/status'

const data = useData()
const project = useProjectStore()
const jobs = useJobsStore()
const workspace = useWorkspaceStore()
const fileInput = ref<HTMLInputElement | null>(null)
const importError = ref<string | null>(null)

// Без открытого проекта движок отвечает 409: журналы спрашиваем, только когда проект есть.
const { data: logs, refresh: refreshLogs } = await useAsyncData('action-logs', () => (project.project ? data.getActionLogs() : Promise.resolve([] as ActionLog[])), { default: () => [] as ActionLog[] })

// Движок перечитывает журналы при открытии проекта фоновой задачей: обновляем список, когда она кончилась.
watch([() => project.project?.path, () => jobs.active.length], ([, active], [, before]) => {
  if (active === 0 || before === undefined) void refreshLogs()
})

const logInput = ref<HTMLInputElement | null>(null)
const logFile = ref<File | null>(null)
const logDialog = ref(false)

function onLogFile(e: Event) {
  const input = e.target as HTMLInputElement
  logFile.value = input.files?.[0] ?? null
  input.value = ''
  if (logFile.value) logDialog.value = true
}

async function onLogImported(log: ActionLogRecord) {
  workspace.log(tr('project.logImported', { name: log.name, rows: log.rows, skipped: log.skipped }))
  await Promise.all([refreshLogs(), project.load()])
}

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

const importErrors = ref<string[]>([])

// Файлы уходят по очереди; ошибка движка приходит в задаче, а не в ответе на загрузку.
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (!files.length) return
  importError.value = null
  importErrors.value = []
  for (const file of files) {
    try {
      const jobId = await data.importSource(file)
      const label = tr('common.importNamed', { name: file.name })
      workspace.log(`${label}: ${tr('project.started')}`)
      jobs.track(jobId, label, (job) => {
        workspace.log(`${label}: ${job.state === 'succeeded' ? tr('common.done') : job.state === 'cancelled' ? tr('common.cancelled') : tr('common.error')}`)
        if (job.state === 'failed') importErrors.value.push(`${file.name}: ${job.error?.detail ?? job.error?.title ?? tr('project.importFailed')}`)
        void project.load()
      })
      await project.refreshSources()
    }
    catch (err) {
      importErrors.value.push(`${file.name}: ${err instanceof Error ? err.message : tr('project.importStartFailed')}`)
    }
  }
}

const selectedSha = ref<string | null>(null)
const selected = computed(() => project.sources.find(s => s.sha256 === selectedSha.value) ?? project.sources[0] ?? null)

const savingSettings = ref(false)
const settingsError = ref<string | null>(null)

async function setSettings(patch: Partial<ProjectSettings>) {
  const current = project.project?.settings
  if (!current || Object.entries(patch).every(([k, v]) => current[k as keyof ProjectSettings] === v)) return
  savingSettings.value = true
  settingsError.value = null
  try {
    await data.updateSettings(patch)
    workspace.log(tr('project.settingsChanged', { list: Object.entries(patch).map(([k, v]) => `${k} = ${v}`).join(', ') }))
    await project.load()
    await jobs.load()
  }
  catch (e) {
    settingsError.value = e instanceof Error ? e.message : tr('project.settingsFailed')
  }
  finally {
    savingSettings.value = false
  }
}

const OVERLAP = ['first', 'last', 'flag'] as const
const CHECKSUM = ['ignore', 'warn', 'drop'] as const
</script>

<template>
  <div class="flex h-full">
    <ShellSidePanel id="project-tree" :title="tr('project.tree')" :width="270">
      <div class="pl-scroll flex-1">
        <ul v-if="project.project" class="m-0 list-none py-1.5">
          <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-3.5 whitespace-nowrap"><UIcon name="i-lucide-folder-open" class="shrink-0" aria-hidden="true" /> <span class="min-w-0 truncate">{{ safeText(project.project.name) }}.protoledger</span></li>
          <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" class="shrink-0" aria-hidden="true" /> {{ tr('project.captures') }} <span class="ml-auto text-[11px] text-pl-muted">{{ project.sources.length }}</span></li>
          <li v-for="s in project.sources" :key="s.sha256" class="flex items-center gap-1.5 py-1 pr-2.5 pl-12 whitespace-nowrap" :title="s.name">
            <UIcon name="i-lucide-file" class="shrink-0" aria-hidden="true" /> <span class="min-w-0 truncate">{{ safeText(s.name) }}</span>
            <span v-if="s.status === 'importing'" class="ml-auto shrink-0 text-[11px] text-pl-muted">{{ percent(s) ?? '…' }}%</span>
            <UIcon v-else-if="project.issuesOf(s.sha256)" name="i-lucide-triangle-alert" class="ml-auto shrink-0" :class="project.issuesOf(s.sha256)!.status === 'violation' ? 'text-pl-st-violation' : 'text-pl-st-ambiguous'" :aria-label="tr('project.issuesLabel', { labels: project.issuesOf(s.sha256)!.labels.join(', ') })" />
          </li>
          <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" class="shrink-0" aria-hidden="true" /> {{ tr('project.logs') }} <span class="ml-auto text-[11px] text-pl-muted">{{ logs.length }}</span></li>
          <li v-for="l in logs" :key="l.name" class="flex items-center gap-1.5 py-1 pr-2.5 pl-12 whitespace-nowrap" :title="l.name"><UIcon name="i-lucide-file" class="shrink-0" aria-hidden="true" /> <span class="min-w-0 truncate">{{ safeText(l.name) }}</span></li>
          <template v-if="project.extras">
            <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" class="shrink-0" aria-hidden="true" /> {{ tr('screen.interpretation') }} <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.interpretationRevs.length }} rev</span></li>
            <li v-for="r in project.extras.interpretationRevs" :key="r.rev" class="flex items-center gap-1.5 py-1 pr-2.5 pl-12 whitespace-nowrap">
              <UIcon name="i-lucide-code-xml" class="shrink-0" aria-hidden="true" /> rev {{ r.rev }}<span v-if="r.current"> · {{ tr('project.current') }}</span>
            </li>
            <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" class="shrink-0" aria-hidden="true" /> {{ tr('project.observations') }} <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.observationCount }}</span></li>
            <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" class="shrink-0" aria-hidden="true" /> {{ tr('project.hypotheses') }} <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.hypothesisCount }}</span></li>
            <li class="flex items-center gap-1.5 py-1 pr-2.5 pl-[30px] whitespace-nowrap"><UIcon name="i-lucide-folder" class="shrink-0" aria-hidden="true" /> {{ tr('project.runs') }} <span class="ml-auto text-[11px] text-pl-muted">{{ project.extras.runCount }}</span></li>
          </template>
        </ul>
      </div>
    </ShellSidePanel>

    <section class="pl-scroll min-w-0 flex-1 px-4 pt-[18px] pb-6">
      <ProjectOpenForm v-if="project.loaded && !project.project && !project.error" />
      <CommonAsyncState v-else :pending="project.loading" :error="project.error" :empty="!project.project" :empty-text="tr('project.notOpen')" @retry="project.load()">
        <template v-if="project.project">
          <h1 class="m-0 font-display text-2xl font-semibold text-pl-fg-strong">{{ project.extras?.title ?? project.project.name }}</h1>
          <p class="mt-1 mb-4 text-pl-muted">
            {{ project.project.path }} · {{ tr('project.engine') }} {{ project.project.engineVersion }}
            <template v-if="project.extras?.createdAt"> · {{ tr('project.created') }} {{ new Date(project.extras.createdAt).toLocaleDateString(intlLocale()) }}</template>
          </p>

          <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.sources) }}</b><span>{{ tr('project.trafficCaptures') }}</span></div>
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.frames) }}</b><span>{{ tr('shell.unit.frames') }}</span></div>
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.connections) }}</b><span>{{ tr('project.tcpConnections') }}</span></div>
            <div class="pl-card flex flex-col gap-0.5 px-3.5 py-3 text-xs"><b class="font-display text-[22px] font-semibold">{{ formatCount(totals.actions) }}</b><span>{{ tr('project.actionsInLog') }}</span></div>
          </div>

          <div class="mt-4 mb-6 flex flex-wrap items-center gap-2.5">
            <button class="pl-btn pl-btn-primary" type="button" @click="fileInput?.click()">{{ tr('project.importCaptures') }}</button>
            <button class="pl-btn" type="button" @click="logInput?.click()">{{ tr('project.addActionLog') }}</button>
            <input ref="logInput" type="file" accept=".csv,.tsv,.txt" class="hidden" @change="onLogFile">
            <input ref="fileInput" type="file" accept=".pcap,.pcapng" multiple class="hidden" @change="onFile">
            <span v-if="importError" class="text-pl-st-violation" role="alert">{{ importError }}</span>
          </div>
          <div v-if="importErrors.length" class="-mt-3 mb-5 flex flex-col gap-1 border-l-2 border-pl-st-violation pl-2.5" role="alert">
            <span v-for="m in importErrors" :key="m" class="text-pl-st-violation">{{ safeText(m) }}</span>
          </div>

          <h2 class="pl-caption mt-5 mb-2">{{ tr('project.captures') }}</h2>
          <table class="pl-table">
            <thead>
              <tr><th>{{ tr('project.file') }}</th><th>{{ tr('project.format') }}</th><th>SHA256</th><th class="text-right">{{ tr('project.framesCol') }}</th><th class="text-right">{{ tr('project.size') }}</th><th>{{ tr('project.status') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in project.sources" :key="s.sha256" :aria-selected="s.sha256 === selected?.sha256" @click="selectedSha = s.sha256">
                <td>{{ safeText(s.name) }}</td>
                <td class="whitespace-nowrap">{{ s.format.toUpperCase() }}</td>
                <td class="font-mono" :title="s.sha256">{{ s.status === 'importing' ? '—' : `${s.sha256.slice(0, 4)}…${s.sha256.slice(-4)}` }}</td>
                <td class="text-right whitespace-nowrap">{{ s.status === 'importing' ? '—' : formatCount(s.frameCount) }}</td>
                <td class="text-right whitespace-nowrap">{{ formatBytesSize(s.sizeBytes) }}</td>
                <td>
                  <div class="flex flex-wrap items-center gap-2">
                    <template v-if="s.status === 'importing'">
                      <CommonStatusBadge status="hypothesis" :label="tr('project.importPercent', { n: percent(s) ?? '…' })" />
                      <button v-if="jobFor(s)" class="pl-btn pl-btn-ghost h-6" type="button" @click="jobs.cancel(jobFor(s)!.id)">{{ tr('shell.cancel') }}</button>
                    </template>
                    <CommonStatusBadge v-else-if="s.status === 'ready'" status="rule" :label="tr('common.done')" />
                    <CommonStatusBadge v-else-if="s.status === 'damaged'" status="violation" :label="tr('project.copyDamaged')" />
                    <CommonStatusBadge v-else status="violation" :label="tr('common.error')" />
                    <CommonStatusBadge v-if="project.issuesOf(s.sha256)" :status="project.issuesOf(s.sha256)!.status" :label="project.issuesOf(s.sha256)!.labels.join(', ')" />
                    <span v-if="skipped(s).length" class="text-pl-muted">{{ tr('project.issuesCount', { n: skipped(s).length }) }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 class="pl-caption mt-5 mb-2">{{ tr('project.actionLogs') }}</h2>
          <table class="pl-table">
            <thead><tr><th>{{ tr('project.file') }}</th><th>{{ tr('project.columns') }}</th><th class="text-right">{{ tr('project.rows') }}</th><th>{{ tr('project.status') }}</th></tr></thead>
            <tbody>
              <tr v-for="l in logs" :key="l.name">
                <td>{{ safeText(l.name) }}</td>
                <td>
                  <span v-for="(m, i) in l.mapping" :key="m.column">{{ i ? ' · ' : '' }}{{ safeText(m.column) }} → {{ m.field }}</span>
                </td>
                <td class="text-right whitespace-nowrap">{{ l.rows }}</td>
                <td><CommonStatusBadge :status="l.status === 'mapped' ? 'rule' : 'hypothesis'" :label="l.status === 'mapped' ? tr('project.mapped') : tr('project.needsMapping')" /></td>
              </tr>
            </tbody>
          </table>

        </template>
      </CommonAsyncState>
      <ProjectActionLogImport v-model:open="logDialog" :file="logFile" @imported="onLogImported" />
    </section>

    <ShellInspectorContent :title="selected ? tr('project.recordTitle', { name: selected.name }) : tr('screen.project')">
      <div v-if="project.project" class="pl-scroll flex-1">
        <dl v-if="selected" class="pl-dl grid-cols-[100px_minmax(0,1fr)]">
          <dt>SHA256</dt><dd class="font-mono text-xs break-all">{{ selected.sha256 }}</dd>
          <dt>{{ tr('project.format') }}</dt><dd>{{ selected.format.toUpperCase() }} · {{ formatBytesSize(selected.sizeBytes) }}</dd>
          <dt>{{ tr('project.framesCol') }}</dt><dd>{{ formatCount(selected.frameCount) }}</dd>
          <dt>{{ tr('project.connections') }}</dt><dd>{{ formatCount(selected.connectionCount) }}</dd>
          <dt>{{ tr('common.import') }}</dt><dd>{{ selected.importId }}</dd>
        </dl>
        <template v-if="selected && project.diagnostics[selected.sha256]?.items.length">
          <h3 class="pl-caption mt-1 mb-2 px-3">{{ tr('project.captureIssues') }}</h3>
          <ul class="m-0 flex list-none flex-col gap-2 px-3 pb-3">
            <li v-for="d in project.diagnostics[selected.sha256]!.items" :key="d.code">
              <CommonStatusBadge :status="DIAGNOSTIC_STATUS[d.code]?.status ?? 'unknown'" :label="`${DIAGNOSTIC_STATUS[d.code]?.label ?? d.code} · ${formatCount(d.count)}`" />
              <p class="mt-1 text-pl-muted">{{ safeText(d.detail) }}</p>
            </li>
          </ul>
        </template>
        <h2 class="pl-caption mt-2 mb-2 px-3">{{ tr('project.streamSettings') }}</h2>
        <dl class="m-0 grid grid-cols-1 gap-1.5 px-3 [&_dd]:mb-2 [&_dd]:ml-0 [&_dt]:text-pl-muted">
          <dt>{{ tr('project.overlap') }}</dt>
          <dd>
            <span class="pl-seg flex w-full [&>*]:flex-1 [&>*]:px-1.5 [&>*]:text-center [&>*]:leading-tight [&>*]:whitespace-normal" role="radiogroup" :aria-label="tr('project.overlap')">
              <button v-for="v in OVERLAP" :key="v" type="button" role="radio" :aria-checked="project.project.settings.overlapPolicy === v" :disabled="savingSettings" @click="setSettings({ overlapPolicy: v })">{{ policyLabel(v) }}</button>
            </span>
          </dd>
          <dt>{{ tr('project.badChecksum') }}</dt>
          <dd>
            <span class="pl-seg flex w-full [&>*]:flex-1 [&>*]:px-1.5 [&>*]:text-center [&>*]:leading-tight [&>*]:whitespace-normal" role="radiogroup" :aria-label="tr('project.badChecksum')">
              <button v-for="v in CHECKSUM" :key="v" type="button" role="radio" :aria-checked="project.project.settings.checksumPolicy === v" :disabled="savingSettings" @click="setSettings({ checksumPolicy: v })">{{ policyLabel(v) }}</button>
            </span>
          </dd>
          <template v-if="project.extras?.matchWindowMs">
            <dt>{{ tr('project.matchWindow') }}</dt>
            <dd>{{ tr('project.matchWindowValue', { n: project.extras.matchWindowMs }) }}</dd>
          </template>
          <template v-if="project.extras?.maxMessageBytes">
            <dt>{{ tr('project.messageLimit') }}</dt>
            <dd>{{ tr('project.messageLimitValue', { size: formatBytesSize(project.extras.maxMessageBytes) }) }}</dd>
          </template>
        </dl>
        <p class="mt-1 flex flex-wrap items-center gap-1.5 px-3 pb-4 text-pl-muted">
          <span v-if="settingsError" class="w-full text-pl-st-violation" role="alert">{{ settingsError }}</span>
          {{ tr('project.settingsNote') }}
          <CommonStatusBadge status="stale" />.
        </p>
      </div>
    </ShellInspectorContent>
  </div>
</template>
