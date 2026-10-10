<script setup lang="ts">
const data = useData()
const draft = useDraftAction()
const { data: view, error, refresh, pending } = await useAsyncData('actions', () => data.getActions())
const selected = ref('a1')

const EVENT = {
  action: { label: 'действие', color: 'var(--pl-focus)' },
  request: { label: 'запрос', color: 'var(--pl-st-rule)' },
  response: { label: 'ответ', color: 'var(--pl-st-hypothesis)' },
  other: { label: 'прочие кадры', color: 'var(--pl-muted)' },
} as const
</script>

<template>
  <div class="grid h-full grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] [&>*]:min-h-0 [&>*]:min-w-0 [&>*]:border-r [&>*]:border-pl-line">
    <section class="pl-scroll">
      <CommonPanelHeader title="Журнал действий" :subtitle="view ? `${view.log.name} · ${view.log.rows} строк` : ''">
        <button class="pl-btn pl-btn-ghost h-7" type="button" @click="draft('Сопоставление колонок')">Колонки…</button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <table v-if="view" class="pl-table">
          <thead><tr><th>Время</th><th>Действие</th><th>Параметры</th><th>Результат</th><th>Обмен</th></tr></thead>
          <tbody>
            <tr v-for="r in view.rows" :key="r.id" :aria-selected="r.id === selected" @click="selected = r.id">
              <td>{{ r.time }}</td>
              <td>{{ r.action }}</td>
              <td>{{ r.params }}</td>
              <td>{{ r.result }}</td>
              <td><CommonStatusBadge :status="r.exchange === 'found' ? 'rule' : 'unknown'" :label="r.exchange === 'found' ? 'найден' : 'нет пары'" /></td>
            </tr>
          </tbody>
        </table>
      </CommonAsyncState>
    </section>

    <section v-if="view" class="pl-scroll">
      <CommonPanelHeader title="Обмен для действия" :subtitle="view.exchange.label" />
      <div class="px-3 pt-3">
        <div class="mb-1.5 flex justify-between text-[11px] text-pl-muted">
          <span>{{ view.exchange.windowFrom }}</span><span>{{ view.exchange.windowLabel }}</span><span>{{ view.exchange.windowTo }}</span>
        </div>
        <div class="relative h-[54px] bg-pl-panel" role="img" :aria-label="`Окно времени действия: ${view.exchange.events.length} кадров`">
          <span class="absolute inset-y-0 right-[8%] left-[8%] border-x border-dashed border-pl-wine-text bg-pl-wine-soft" />
          <span
            v-for="(e, i) in view.exchange.events"
            :key="i"
            class="absolute"
            :class="e.kind === 'action' ? 'inset-y-0 w-0.5' : 'top-1/2 -mt-[3px] -ml-[3px] size-1.5 rounded-full'"
            :style="{ left: `${e.at * 100}%`, background: EVENT[e.kind].color }"
            :title="EVENT[e.kind].label"
          />
        </div>
        <div class="mt-1.5 flex gap-3.5 text-pl-muted">
          <span v-for="(ev, k) in EVENT" :key="k"><i class="inline-block size-2 rounded-full align-middle" :style="{ background: ev.color }" /> {{ ev.label }}</span>
        </div>
      </div>
      <div v-for="side in [view.exchange.request, view.exchange.response]" :key="side.title" class="px-3">
        <h3 class="pl-caption mt-5 mb-2">{{ side.title }}</h3>
        <div class="flex items-center gap-4">
          <span class="w-40 text-pl-fg-strong">{{ side.direction }}</span>
          <div class="flex gap-0.5 font-mono">
            <span
              v-for="(b, i) in side.bytes"
              :key="i"
              class="grid h-7 w-10 place-items-center"
              :class="side.highlight.includes(i) ? 'bg-pl-st-hypothesis/18 text-pl-st-hypothesis' : 'bg-pl-panel'"
            >{{ b }}</span>
          </div>
        </div>
      </div>
      <p class="mt-3 px-3">{{ view.exchange.note }}</p>
      <div class="mt-3 flex gap-2 px-3">
        <NuxtLink to="/compare" class="pl-btn pl-btn-primary">Сравнить с другими</NuxtLink>
        <NuxtLink to="/overview" class="pl-btn">Показать в потоке</NuxtLink>
      </div>
    </section>
  </div>
</template>
