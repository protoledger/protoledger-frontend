<script setup lang="ts">
import type { ExchangeView } from '~/data/views'

const data = useData()
const draft = useDraftAction()
const { data: view, error, refresh, pending } = await useAsyncData('actions', () => data.getActions())
const selected = ref<string | null>(null)
const exchange = ref<ExchangeView | null>(null)
const exchangeState = ref<'idle' | 'loading' | 'none' | 'error'>('idle')
const found = ref<Record<string, 'found' | 'none'>>({})

watchEffect(() => {
  if (!selected.value && view.value?.rows[0]) selected.value = view.value.rows[0].id
})

watch(selected, async (id) => {
  exchange.value = null
  if (!id) return
  exchangeState.value = 'loading'
  try {
    exchange.value = await data.getExchange(id)
    found.value[id] = exchange.value?.request ? 'found' : 'none'
    exchangeState.value = exchange.value ? 'idle' : 'none'
  }
  catch {
    exchangeState.value = 'error'
  }
}, { immediate: true })

function exchangeBadge(row: { id: string, exchange: 'found' | 'none' | 'unknown' }) {
  const state = found.value[row.id] ?? row.exchange
  if (state === 'found') return { status: 'rule' as const, label: 'найден' }
  if (state === 'none') return { status: 'unknown' as const, label: 'нет пары' }
  return null
}

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
      <CommonPanelHeader title="Журнал действий" :subtitle="view?.log ? `${view.log.name} · ${view.log.rows} строк` : ''">
        <button class="pl-btn pl-btn-ghost h-7" type="button" @click="draft('Сопоставление колонок')">Колонки…</button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view?.rows.length" empty-text="Журнала действий в проекте нет — импортируйте его на экране «Проект»." @retry="refresh()">
        <table v-if="view" class="pl-table">
          <thead><tr><th>Время</th><th>Действие</th><th>Параметры</th><th>Результат</th><th>Обмен</th></tr></thead>
          <tbody>
            <tr v-for="r in view.rows" :key="r.id" :aria-selected="r.id === selected" @click="selected = r.id">
              <td>{{ r.time }}</td>
              <td>{{ r.action }}</td>
              <td>{{ r.params }}</td>
              <td>{{ r.result }}</td>
              <td>
                <CommonStatusBadge v-if="exchangeBadge(r)" :status="exchangeBadge(r)!.status" :label="exchangeBadge(r)!.label" />
                <span v-else class="text-pl-muted">—</span>
              </td>
            </tr>
          </tbody>
        </table>
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
            <h3 class="pl-caption mt-5 mb-2">{{ side.title }}</h3>
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
        <p class="mt-3 px-3">{{ exchange.note }}</p>
        <div class="mt-3 flex flex-wrap gap-2 px-3 pb-3">
          <NuxtLink to="/compare" class="pl-btn pl-btn-primary">Сравнить с другими</NuxtLink>
          <NuxtLink to="/overview" class="pl-btn">Показать в потоке</NuxtLink>
        </div>
      </div>
    </ShellInspectorContent>
  </div>
</template>
