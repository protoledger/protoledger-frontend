<script setup lang="ts">
import { onWatcherCleanup } from 'vue'
import type { ClockOffset } from '~/api/types'
import type { ActionMessageRef, ActionRow, ExchangeView } from '~/data/views'
import { formatCount } from '~/utils/bytes'

const data = useData()
const logId = ref<string | undefined>(undefined)
const { data: view, error, refresh, pending } = await useAsyncData('actions', () => data.getActions(logId.value), { watch: [logId] })
const rows = ref<ActionRow[]>([])
const loadingMore = ref(false)
const selected = ref<string | null>(null)
const exchange = ref<ExchangeView | null>(null)
const exchangeState = ref<'idle' | 'loading' | 'none' | 'error'>('idle')
const withSource = computed(() => rows.value.some(r => r.source))

watch(view, (v) => {
  rows.value = v?.rows ?? []
  selected.value = rows.value[0]?.id ?? null
}, { immediate: true })

async function loadMore() {
  if (!view.value?.log || loadingMore.value) return
  loadingMore.value = true
  try {
    const next = await data.getActions(view.value.log.id, rows.value.length)
    rows.value = [...rows.value, ...next.rows]
  }
  finally {
    loadingMore.value = false
  }
}

// Стрелками по таблице выбор меняется быстрее ответов — показываем обмен только последнего действия.
watch(selected, async (id) => {
  let stale = false
  onWatcherCleanup(() => { stale = true })
  exchange.value = null
  if (!id) return
  exchangeState.value = 'loading'
  try {
    const ex = await data.getExchange(id)
    if (stale) return
    exchange.value = ex
    exchangeState.value = ex ? 'idle' : 'none'
  }
  catch {
    if (!stale) exchangeState.value = 'error'
  }
}, { immediate: true })

// Сдвиг часов журнала — предложение движка; применяет его исследователь кнопкой.
const clock = ref<ClockOffset | null>(null)
watch(() => view.value?.log?.id, async (id) => {
  clock.value = null
  if (!id) return
  try {
    const c = await data.getClockOffset(id)
    if (view.value?.log?.id === id) clock.value = c
  }
  catch {
    // Оценка — подсказка: без неё экран работает как раньше.
  }
}, { immediate: true })
// Повторный импорт того же файла даёт журнал с тем же именем — различаем по номеру и поправке часов.
function logLabel(l: { id: string, name: string, rows: number, clockOffsetMs: number }) {
  const twin = (view.value?.logs ?? []).filter(x => x.name === l.name).length > 1
  return [safeText(l.name), tr('actions.rows', { n: l.rows }), twin ? l.id : '', l.clockOffsetMs ? tr('actions.clockShort', { offset: signed(l.clockOffsetMs) }) : ''].filter(Boolean).join(' · ')
}
const workspace = useWorkspaceStore()
const project = useProjectStore()
const draft = useDraftAction()
const applyingClock = ref(false)
const clockNote = ref<{ ok: boolean, text: string } | null>(null)
async function applyClock() {
  const log = view.value?.log
  const c = clock.value
  if (!log || !c || c.offsetMs === null) return
  const total = c.currentOffsetMs + c.offsetMs
  applyingClock.value = true
  clockNote.value = null
  try {
    const id = await data.applyClockOffset(log.id, total)
    if (!id) return draft(tr('actions.clockApplied'))
    workspace.log(tr('actions.logClock', { name: log.name, offset: signed(total) }))
    clockNote.value = { ok: true, text: tr('actions.clockNote', { offset: signed(total) }) }
    logId.value = id
    await refresh()
    void project.load()
  }
  catch (e) {
    clockNote.value = { ok: false, text: e instanceof Error ? e.message : tr('actions.clockFailed') }
  }
  finally {
    applyingClock.value = false
  }
}
const signed = (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${tr('common.ms', { n: formatCount(Math.abs(ms)) })}`

const BADGE = {
  paired: { status: 'rule' as const, get label() { return tr('actions.badge.paired') } },
  request_only: { status: 'hypothesis' as const, get label() { return tr('actions.badge.requestOnly') } },
  not_found: { status: 'unknown' as const, get label() { return tr('actions.badge.notFound') } },
}

// Переход к байтам сообщения в «Обзоре»: id потока — «<соединение>:<направление>».
function messageLink(m: ActionMessageRef) {
  const dir = m.stream.endsWith(':ba') ? 'ba' : 'ab'
  return { path: '/overview', query: { conn: m.stream.replace(/:(ab|ba)$/, ''), dir, from: String(m.start), to: String(m.end) } }
}

const found = computed(() => {
  const x = view.value?.exchanges
  return x ? `${tr('actions.found', { n: x.paired + x.requestOnly, total: x.total })}${x.requestOnly ? ` · ${tr('actions.noResponse', { n: x.requestOnly })}` : ''}` : null
})

const EVENT = {
  action: { get label() { return tr('actions.event.action') }, color: 'var(--pl-focus)' },
  request: { get label() { return tr('actions.event.request') }, color: 'var(--pl-st-rule)' },
  response: { get label() { return tr('actions.event.response') }, color: 'var(--pl-st-hypothesis)' },
  other: { get label() { return tr('actions.event.other') }, color: 'var(--pl-muted)' },
} as const
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader :title="tr('actions.journal')" :subtitle="view?.log ? [tr('actions.rows', { n: view.log.rows }), found].filter(Boolean).join(' · ') : ''">
        <select
          v-if="view && view.logs.length > 1"
          class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong"
          :aria-label="tr('actions.journal')"
          :value="view.log?.id"
          @change="logId = ($event.target as HTMLSelectElement).value"
        >
          <option v-for="l in view.logs" :key="l.id" :value="l.id">{{ logLabel(l) }}</option>
        </select>
        <span v-else-if="view?.log" class="text-pl-fg">{{ safeText(view.log.name) }}</span>
        <NuxtLink to="/project" class="pl-btn pl-btn-ghost h-7" :title="tr('actions.columnsTitle')">{{ tr('actions.columns') }}</NuxtLink>
      </CommonPanelHeader>
      <div v-if="clock && clock.offsetMs !== null" class="mx-3 mt-3 flex flex-col gap-1 rounded border border-pl-st-hypothesis px-3 py-2.5" role="status">
        <div class="flex flex-wrap items-center gap-2">
          <CommonStatusBadge status="hypothesis" :label="tr('actions.clockLabel')" />
          <b class="font-semibold text-pl-fg-strong">{{ tr('actions.clockHint', { offset: signed(clock.offsetMs) }) }}</b>
        </div>
        <p class="m-0">{{ safeText(clock.reason) }}.</p>
        <div class="flex flex-wrap items-center gap-2">
          <button class="pl-btn pl-btn-primary h-7" type="button" :disabled="applyingClock" @click="applyClock">
            {{ applyingClock ? tr('actions.applying') : tr('actions.applyOffset', { offset: signed(clock.currentOffsetMs + clock.offsetMs) }) }}
          </button>
          <span class="text-xs text-pl-muted">{{ tr('actions.clockRedo') }}</span>
        </div>
      </div>
      <p v-if="clockNote" class="mx-3 mt-3 mb-0" :class="clockNote.ok ? 'text-pl-st-rule' : 'text-pl-st-violation'" role="status">
        {{ clockNote.text }}
        <NuxtLink v-if="clockNote.ok" to="/verify" class="text-pl-wine-text hover:underline">{{ tr('actions.runVerify') }}</NuxtLink>
      </p>
      <p v-if="view?.exchangeNote" class="m-0 px-3 pt-3 text-pl-muted">{{ view.exchangeNote }}</p>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!rows.length" :empty-text="tr('actions.empty')" @retry="refresh()">
        <table
          class="pl-table"
          tabindex="0"
          :aria-label="tr('actions.tableAria')"
          @keydown="(e: KeyboardEvent) => { const i = stepIndex(e, rows.findIndex(r => r.id === selected), rows.length); if (i !== null) { selected = rows[i]!.id; revealSelected(e) } }"
        >
          <thead><tr><th>{{ tr('actions.col.time') }}</th><th v-if="withSource">{{ tr('actions.col.capture') }}</th><th>{{ tr('actions.col.action') }}</th><th>{{ tr('actions.col.params') }}</th><th>{{ tr('actions.col.result') }}</th><th>{{ tr('actions.col.request') }}</th><th>{{ tr('actions.col.response') }}</th><th>{{ tr('actions.col.exchange') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" :aria-selected="r.id === selected" @click="selected = r.id">
              <td class="whitespace-nowrap">{{ r.time }}</td>
              <td v-if="withSource" class="whitespace-nowrap text-pl-muted">{{ safeText(r.source ?? '—') }}</td>
              <td>{{ safeText(r.action) }}</td>
              <td>{{ safeText(r.params) }}</td>
              <td>{{ safeText(r.result) }}</td>
              <td>
                <NuxtLink v-if="r.request" :to="messageLink(r.request)" class="font-mono text-pl-wine-text hover:underline" :title="tr('actions.reqBytes')" @click.stop>{{ safeText(r.request.label) }}</NuxtLink>
                <span v-else class="text-pl-muted">—</span>
              </td>
              <td>
                <NuxtLink v-if="r.response" :to="messageLink(r.response)" class="font-mono text-pl-wine-text hover:underline" :title="tr('actions.respBytes')" @click.stop>{{ safeText(r.response.label) }}</NuxtLink>
                <span v-else class="text-pl-muted">—</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <CommonStatusBadge v-if="r.exchange !== 'unknown'" :status="BADGE[r.exchange].status" :label="BADGE[r.exchange].label" />
                  <span v-else class="text-pl-muted">—</span>
                  <span v-if="r.candidates > 1" :title="tr('actions.candidatesTitle', { n: r.candidates })">
                    <CommonStatusBadge status="ambiguous" :label="tr('actions.captures', { n: r.candidates })" />
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <button v-if="view && rows.length < view.total" class="pl-btn pl-btn-ghost m-3" type="button" :disabled="loadingMore" @click="loadMore">
          {{ tr('common.showMore', { n: view.total - rows.length }) }}
        </button>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="exchange ? `${tr('actions.exchange')} · ${exchange.label}` : tr('actions.exchangeFor')">
      <p v-if="exchangeState === 'loading'" class="p-3 text-pl-muted" aria-live="polite">{{ tr('actions.searching') }}</p>
      <p v-else-if="exchangeState === 'error'" class="p-3 text-pl-st-violation" role="alert">{{ tr('actions.exchangeError') }}</p>
      <p v-else-if="!exchange" class="p-3 text-pl-muted">{{ tr('actions.exchangeNone') }}</p>
      <div v-else class="pl-scroll flex-1">
        <div class="px-3 pt-3">
          <div class="mb-1.5 flex justify-between text-[11px] text-pl-muted">
            <span>{{ exchange.windowFrom }}</span><span>{{ exchange.windowLabel }}</span><span>{{ exchange.windowTo }}</span>
          </div>
          <div class="relative h-[54px] bg-pl-panel" role="img" :aria-label="tr('actions.windowAria', { n: exchange.events.length })">
            <span class="absolute inset-y-0 right-[8%] left-[8%] border-x border-dashed border-pl-wine-text bg-pl-wine-soft" />
            <span
              v-for="(e, i) in exchange.events"
              :key="i"
              class="absolute"
              :class="e.kind === 'action' ? 'inset-y-0 w-0.5' : 'top-1/2 -mt-[3px] -ml-[3px] size-1.5 rounded-full'"
              :style="{ left: `${e.at * 100}%`, background: EVENT[e.kind].color }"
              :title="EVENT[e.kind].label"
            />
          </div>
          <div class="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-pl-muted">
            <span v-for="(ev, k) in EVENT" :key="k"><i class="inline-block size-2 rounded-full align-middle" :style="{ background: ev.color }" /> {{ ev.label }}</span>
          </div>
          <p class="m-0 mt-1 text-xs text-pl-muted">{{ tr('actions.offsetNote') }}</p>
        </div>
        <template v-for="side in [exchange.request, exchange.response]" :key="side?.title">
          <div v-if="side" class="px-3">
            <h3 class="pl-caption mt-5 mb-2">{{ safeText(side.title) }}</h3>
            <div class="flex flex-col gap-1.5">
              <span class="text-pl-fg-strong">{{ side.direction }}</span>
              <div class="flex flex-wrap gap-0.5 font-mono">
                <span
                  v-for="(b, i) in side.bytes"
                  :key="i"
                  class="grid h-7 w-9 place-items-center"
                  :class="side.highlight.includes(i) ? 'bg-pl-st-hypothesis/18 text-pl-st-hypothesis' : 'bg-pl-panel'"
                >{{ b }}</span>
              </div>
            </div>
          </div>
        </template>
        <p v-if="!exchange.response" class="mt-3 px-3 text-pl-muted">{{ tr('actions.noResponseWindow') }}</p>
        <p class="mt-3 px-3">{{ safeText(exchange.note) }}</p>
        <div class="mt-3 flex flex-wrap gap-2 px-3 pb-3">
          <NuxtLink to="/compare" class="pl-btn pl-btn-primary">{{ tr('actions.compare') }}</NuxtLink>
          <NuxtLink to="/overview" class="pl-btn">{{ tr('actions.showInStream') }}</NuxtLink>
        </div>
      </div>
    </ShellInspectorContent>
  </div>
</template>
