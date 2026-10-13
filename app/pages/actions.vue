<script setup lang="ts">
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

watch(selected, async (id) => {
  exchange.value = null
  if (!id) return
  exchangeState.value = 'loading'
  try {
    exchange.value = await data.getExchange(id)
    exchangeState.value = exchange.value ? 'idle' : 'none'
  }
  catch {
    exchangeState.value = 'error'
  }
}, { immediate: true })

// Сдвиг часов журнала — предложение движка; применяется повторным импортом с поправкой.
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
const signed = (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${formatCount(Math.abs(ms))} мс`

const BADGE = {
  paired: { status: 'rule' as const, label: 'запрос и ответ' },
  request_only: { status: 'hypothesis' as const, label: 'без ответа' },
  not_found: { status: 'unknown' as const, label: 'не найден' },
}

// Переход к байтам сообщения в «Обзоре»: id потока — «<соединение>:<направление>».
function messageLink(m: ActionMessageRef) {
  const dir = m.stream.endsWith(':ba') ? 'ba' : 'ab'
  return { path: '/overview', query: { conn: m.stream.replace(/:(ab|ba)$/, ''), dir, from: String(m.start), to: String(m.end) } }
}

const found = computed(() => {
  const x = view.value?.exchanges
  return x ? `найдено ${x.paired + x.requestOnly} из ${x.total}${x.requestOnly ? ` · без ответа ${x.requestOnly}` : ''}` : null
})

const EVENT = {
  action: { label: 'действие', color: 'var(--pl-focus)' },
  request: { label: 'запрос', color: 'var(--pl-st-rule)' },
  response: { label: 'ответ', color: 'var(--pl-st-hypothesis)' },
  other: { label: 'прочие кадры', color: 'var(--pl-muted)' },
} as const
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader title="Журнал действий" :subtitle="view?.log ? [`${view.log.rows} строк`, found].filter(Boolean).join(' · ') : ''">
        <select
          v-if="view && view.logs.length > 1"
          class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong"
          aria-label="Журнал действий"
          :value="view.log?.id"
          @change="logId = ($event.target as HTMLSelectElement).value"
        >
          <option v-for="l in view.logs" :key="l.id" :value="l.id">{{ safeText(l.name) }} · {{ l.rows }}</option>
        </select>
        <span v-else-if="view?.log" class="text-pl-fg">{{ safeText(view.log.name) }}</span>
        <NuxtLink to="/project" class="pl-btn pl-btn-ghost h-7" title="Колонки сопоставляются при импорте журнала: импортируйте его заново на «Проекте»">Колонки…</NuxtLink>
      </CommonPanelHeader>
      <div v-if="clock && clock.offsetMs !== null" class="mx-3 mt-3 flex flex-col gap-1 rounded border border-pl-st-hypothesis px-3 py-2.5" role="status">
        <div class="flex flex-wrap items-center gap-2">
          <CommonStatusBadge status="hypothesis" label="часы журнала" />
          <b class="font-semibold text-pl-fg-strong">Похоже, часы журнала сдвинуты на {{ signed(clock.offsetMs) }}</b>
        </div>
        <p class="m-0">{{ safeText(clock.reason) }}.</p>
        <p class="m-0 text-pl-muted">
          Чтобы применить, импортируйте журнал на «Проекте» с полем «Сдвиг часов, мс» = {{ clock.currentOffsetMs + clock.offsetMs }}<template v-if="clock.currentOffsetMs"> (сейчас {{ clock.currentOffsetMs }})</template>.
          <NuxtLink to="/project" class="text-pl-wine-text hover:underline">На «Проект»</NuxtLink>
        </p>
      </div>
      <p v-if="view?.exchangeNote" class="m-0 px-3 pt-3 text-pl-muted">{{ view.exchangeNote }}</p>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!rows.length" empty-text="Журнала действий в проекте нет — импортируйте его на экране «Проект»." @retry="refresh()">
        <table
          class="pl-table"
          tabindex="0"
          aria-label="Журнал действий: стрелки вверх и вниз выбирают действие"
          @keydown="(e: KeyboardEvent) => { const i = stepIndex(e, rows.findIndex(r => r.id === selected), rows.length); if (i !== null) { selected = rows[i]!.id; revealSelected(e) } }"
        >
          <thead><tr><th>Время</th><th v-if="withSource">Запись</th><th>Действие</th><th>Параметры</th><th>Результат</th><th>Запрос</th><th>Ответ</th><th>Обмен</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id" :aria-selected="r.id === selected" @click="selected = r.id">
              <td class="whitespace-nowrap">{{ r.time }}</td>
              <td v-if="withSource" class="whitespace-nowrap text-pl-muted">{{ safeText(r.source ?? '—') }}</td>
              <td>{{ safeText(r.action) }}</td>
              <td>{{ safeText(r.params) }}</td>
              <td>{{ safeText(r.result) }}</td>
              <td>
                <NuxtLink v-if="r.request" :to="messageLink(r.request)" class="font-mono text-pl-wine-text hover:underline" title="Байты запроса в потоке" @click.stop>{{ safeText(r.request.label) }}</NuxtLink>
                <span v-else class="text-pl-muted">—</span>
              </td>
              <td>
                <NuxtLink v-if="r.response" :to="messageLink(r.response)" class="font-mono text-pl-wine-text hover:underline" title="Байты ответа в потоке" @click.stop>{{ safeText(r.response.label) }}</NuxtLink>
                <span v-else class="text-pl-muted">—</span>
              </td>
              <td>
                <div class="flex flex-wrap gap-1">
                  <CommonStatusBadge v-if="r.exchange !== 'unknown'" :status="BADGE[r.exchange].status" :label="BADGE[r.exchange].label" />
                  <span v-else class="text-pl-muted">—</span>
                  <span v-if="r.candidates > 1" :title="`По времени подходят ${r.candidates} записи — пара может быть из другой записи. Укажите колонку записи при импорте журнала.`">
                    <CommonStatusBadge status="ambiguous" :label="`записей: ${r.candidates}`" />
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <button v-if="view && rows.length < view.total" class="pl-btn pl-btn-ghost m-3" type="button" :disabled="loadingMore" @click="loadMore">
          Показать ещё ({{ view.total - rows.length }})
        </button>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="exchange ? `Обмен · ${exchange.label}` : 'Обмен для действия'">
      <p v-if="exchangeState === 'loading'" class="p-3 text-pl-muted" aria-live="polite">Ищу обмен в окне времени…</p>
      <p v-else-if="exchangeState === 'error'" class="p-3 text-pl-st-violation" role="alert">Не удалось найти обмен для действия.</p>
      <p v-else-if="!exchange" class="p-3 text-pl-muted">Для этого действия обмена не найдено.</p>
      <div v-else class="pl-scroll flex-1">
        <div class="px-3 pt-3">
          <div class="mb-1.5 flex justify-between text-[11px] text-pl-muted">
            <span>{{ exchange.windowFrom }}</span><span>{{ exchange.windowLabel }}</span><span>{{ exchange.windowTo }}</span>
          </div>
          <div class="relative h-[54px] bg-pl-panel" role="img" :aria-label="`Окно времени действия: ${exchange.events.length} событий`">
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
        <p v-if="!exchange.response" class="mt-3 px-3 text-pl-muted">Ответа в окне времени нет.</p>
        <p class="mt-3 px-3">{{ safeText(exchange.note) }}</p>
        <div class="mt-3 flex flex-wrap gap-2 px-3 pb-3">
          <NuxtLink to="/compare" class="pl-btn pl-btn-primary">Сравнить с другими</NuxtLink>
          <NuxtLink to="/overview" class="pl-btn">Показать в потоке</NuxtLink>
        </div>
      </div>
    </ShellInspectorContent>
  </div>
</template>
