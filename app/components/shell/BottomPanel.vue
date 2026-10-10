<script setup lang="ts">
import type { Severity } from '~/api/types'
import { formatCount } from '~/utils/bytes'
import { DIAGNOSTIC_STATUS, type KnowledgeStatus } from '~/utils/status'

const workspace = useWorkspaceStore()
const project = useProjectStore()
const jobs = useJobsStore()

const SEVERITY: Record<Severity, { status: KnowledgeStatus, label: string }> = {
  error: { status: 'violation', label: 'ошибка' },
  warning: { status: 'hypothesis', label: 'внимание' },
  info: { status: 'unsupported', label: 'пропущено' },
}

const diagnostics = computed(() =>
  Object.values(project.diagnostics).flatMap(d => d.items.map(item => ({ ...item, source: project.sourceName(d.sha256) }))))

const JOB_STATE: Record<string, string> = {
  queued: 'в очереди', running: 'идёт', cancelling: 'отменяется', succeeded: 'готово', failed: 'ошибка', cancelled: 'отменено',
}
</script>

<template>
  <section class="bottom" :class="{ 'bottom--closed': !workspace.bottomOpen }" aria-label="Нижнее окно">
    <div class="bottom__tabs" role="tablist">
      <button role="tab" type="button" :aria-selected="workspace.bottomTab === 'diagnostics'" @click="workspace.bottomTab = 'diagnostics'; workspace.bottomOpen = true">
        Диагностика <span class="bottom__count">{{ diagnostics.length }}</span>
      </button>
      <button role="tab" type="button" :aria-selected="workspace.bottomTab === 'jobs'" @click="workspace.bottomTab = 'jobs'; workspace.bottomOpen = true">
        Задачи <span class="bottom__count bottom__count--plain">{{ jobs.active.length }}</span>
      </button>
      <button role="tab" type="button" :aria-selected="workspace.bottomTab === 'events'" @click="workspace.bottomTab = 'events'; workspace.bottomOpen = true">
        Журнал событий
      </button>
      <button class="bottom__toggle" type="button" :aria-label="workspace.bottomOpen ? 'Свернуть' : 'Развернуть'" @click="workspace.bottomOpen = !workspace.bottomOpen">
        <UIcon :name="workspace.bottomOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'" class="size-4" aria-hidden="true" />
      </button>
    </div>
    <div v-if="workspace.bottomOpen" class="bottom__body pl-scroll">
      <template v-if="workspace.bottomTab === 'diagnostics'">
        <p v-if="!diagnostics.length" class="bottom__empty">Замечаний к записям нет.</p>
        <div v-for="d in diagnostics" :key="`${d.source}:${d.code}`" class="bottom__row">
          <CommonStatusBadge :status="SEVERITY[d.severity].status" :label="SEVERITY[d.severity].label" />
          <span class="bottom__text">
            {{ d.title }} · {{ formatCount(d.count) }} кадр.
            <span class="text-[var(--pl-muted)]">— {{ d.detail }}</span>
          </span>
          <span class="bottom__where">{{ d.source }} · {{ DIAGNOSTIC_STATUS[d.code]?.label ?? d.code }}</span>
        </div>
      </template>
      <template v-else-if="workspace.bottomTab === 'jobs'">
        <p v-if="!jobs.jobs.length" class="bottom__empty">Задач нет.</p>
        <div v-for="j in jobs.jobs" :key="j.id" class="bottom__row">
          <span class="w-20 text-[var(--pl-muted)]">{{ j.id }}</span>
          <span class="bottom__text">{{ jobs.labels[j.id] ?? 'Импорт записи' }} — {{ JOB_STATE[j.state] }}</span>
          <span class="bottom__where">{{ formatCount(j.progress.done) }} / {{ j.progress.total ? formatCount(j.progress.total) : '?' }} {{ j.progress.unit === 'frames' ? 'кадров' : 'байт' }}</span>
          <button v-if="j.state === 'running'" class="pl-btn pl-btn--ghost h-6" type="button" @click="jobs.cancel(j.id)">Отменить</button>
        </div>
      </template>
      <template v-else>
        <p v-if="!workspace.events.length" class="bottom__empty">Событий пока нет.</p>
        <div v-for="(e, i) in workspace.events" :key="i" class="bottom__row">
          <span class="w-20 text-[var(--pl-muted)]">{{ e.time }}</span>
          <span class="bottom__text">{{ e.text }}</span>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.bottom {
  display: flex;
  flex-direction: column;
  height: 160px;
  border-top: 1px solid var(--pl-line);
  background: var(--pl-chrome);
}

.bottom--closed {
  height: auto;
}

.bottom__tabs {
  display: flex;
  align-items: stretch;
  height: 30px;
  border-bottom: 1px solid var(--pl-line);
}

.bottom__tabs [role="tab"] {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border-bottom: 2px solid transparent;
  color: var(--pl-muted);
  font-weight: 600;
}

.bottom__tabs [aria-selected="true"] {
  border-bottom-color: var(--pl-wine-text);
  color: var(--pl-fg-strong);
}

.bottom__count {
  padding: 0 5px;
  border: 1px solid var(--pl-st-violation);
  border-radius: 3px;
  color: var(--pl-st-violation);
  font-size: 11px;
}

.bottom__count--plain {
  border-color: var(--pl-line);
  color: var(--pl-muted);
}

.bottom__toggle {
  margin-left: auto;
  padding: 0 12px;
  color: var(--pl-muted);
}

.bottom__body {
  flex: 1;
  padding: 4px 0;
}

.bottom__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 28px;
  padding: 0 14px;
}

.bottom__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bottom__where {
  color: var(--pl-muted);
  white-space: nowrap;
}

.bottom__empty {
  margin: 8px 14px;
  color: var(--pl-muted);
}
</style>
