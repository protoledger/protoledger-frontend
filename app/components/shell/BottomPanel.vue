<script setup lang="ts">
import type { Severity } from '~/api/types'
import type { MessageKey } from '~/i18n'
import { formatCount } from '~/utils/bytes'
import { DIAGNOSTIC_STATUS, type KnowledgeStatus } from '~/utils/status'

const workspace = useWorkspaceStore()
const project = useProjectStore()
const jobs = useJobsStore()

const SEVERITY: Record<Severity, { status: KnowledgeStatus, label: string }> = {
  error: { status: 'violation', get label() { return tr('shell.sev.error') } },
  warning: { status: 'hypothesis', get label() { return tr('shell.sev.warning') } },
  info: { status: 'unsupported', get label() { return tr('shell.sev.info') } },
}

const diagnostics = computed(() =>
  Object.values(project.diagnostics).flatMap(d => d.items.map(item => ({ ...item, source: project.sourceName(d.sha256) }))))

const tab = 'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3.5 font-semibold text-pl-muted aria-selected:border-pl-wine-text aria-selected:text-pl-fg-strong'
const row = 'flex min-h-7 items-center gap-3 px-3.5'
const text = 'min-w-0 flex-1 truncate'
const empty = 'mx-3.5 my-2 text-pl-muted'

const jobState = (state: string) => tr(`shell.job.${state}` as MessageKey)
</script>

<template>
  <section class="flex flex-col border-t border-pl-line bg-pl-chrome" :class="workspace.bottomOpen ? 'h-40 max-sm:h-[30vh]' : 'h-auto'" :aria-label="tr('shell.bottom')">
    <div class="flex h-[30px] items-stretch overflow-x-auto overflow-y-hidden border-b border-pl-line" role="tablist">
      <button :class="tab" role="tab" type="button" :aria-selected="workspace.bottomTab === 'diagnostics'" @click="workspace.bottomTab = 'diagnostics'; workspace.bottomOpen = true">
        {{ tr('shell.diagnostics') }} <span class="rounded-[3px] border border-pl-st-violation px-1.5 text-[11px] text-pl-st-violation">{{ diagnostics.length }}</span>
      </button>
      <button :class="tab" role="tab" type="button" :aria-selected="workspace.bottomTab === 'jobs'" @click="workspace.bottomTab = 'jobs'; workspace.bottomOpen = true">
        {{ tr('shell.jobs') }} <span class="rounded-[3px] border border-pl-line px-1.5 text-[11px] text-pl-muted">{{ jobs.active.length }}</span>
      </button>
      <button :class="tab" role="tab" type="button" :aria-selected="workspace.bottomTab === 'events'" @click="workspace.bottomTab = 'events'; workspace.bottomOpen = true">
        {{ tr('shell.events') }}
      </button>
      <button class="ml-auto px-3 text-pl-muted" type="button" :aria-label="workspace.bottomOpen ? tr('shell.collapse') : tr('shell.expand')" @click="workspace.bottomOpen = !workspace.bottomOpen">
        <UIcon :name="workspace.bottomOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-4" aria-hidden="true" />
      </button>
    </div>
    <div v-if="workspace.bottomOpen" class="pl-scroll flex-1 py-1">
      <template v-if="workspace.bottomTab === 'diagnostics'">
        <p v-if="!diagnostics.length" :class="empty">{{ tr('shell.noDiagnostics') }}</p>
        <div v-for="d in diagnostics" :key="`${d.source}:${d.code}`" :class="row">
          <CommonStatusBadge :status="SEVERITY[d.severity].status" :label="SEVERITY[d.severity].label" />
          <span :class="text">
            {{ safeText(d.title) }} · {{ tr('shell.frames', { n: formatCount(d.count) }) }}
            <span class="text-pl-muted">— {{ safeText(d.detail) }}</span>
          </span>
          <span class="whitespace-nowrap text-pl-muted">{{ d.source }} · {{ DIAGNOSTIC_STATUS[d.code]?.label ?? d.code }}</span>
        </div>
      </template>
      <template v-else-if="workspace.bottomTab === 'jobs'">
        <p v-if="!jobs.jobs.length" :class="empty">{{ tr('shell.noJobs') }}</p>
        <div v-for="j in jobs.jobs" :key="j.id" :class="row">
          <span class="w-20 text-pl-muted">{{ j.id }}</span>
          <span :class="text">
            {{ jobs.labels[j.id] ?? tr('common.importSource') }} — {{ jobState(j.state) }}
            <span v-if="jobs.lost[j.id] && j.state === 'running'" class="text-pl-st-hypothesis">{{ tr('shell.linkLost') }}</span>
            <span v-if="j.state === 'failed' && j.error" class="text-pl-st-violation">· {{ safeText(j.error.detail ?? j.error.title) }}</span>
          </span>
          <span class="whitespace-nowrap text-pl-muted">{{ formatCount(j.progress.done) }} / {{ j.progress.total ? formatCount(j.progress.total) : '?' }} {{ j.progress.unit === 'frames' ? tr('shell.unit.frames') : tr('shell.unit.bytes') }}</span>
          <button v-if="j.state === 'running'" class="pl-btn pl-btn-ghost h-6" type="button" @click="jobs.cancel(j.id)">{{ tr('shell.cancel') }}</button>
        </div>
      </template>
      <template v-else>
        <p v-if="!workspace.events.length" :class="empty">{{ tr('shell.noEvents') }}</p>
        <div v-for="(e, i) in workspace.events" :key="i" :class="row">
          <span class="w-20 text-pl-muted">{{ e.time }}</span>
          <span :class="text">{{ safeText(e.text) }}</span>
        </div>
      </template>
    </div>
  </section>
</template>
