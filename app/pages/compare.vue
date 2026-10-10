<script setup lang="ts">
const data = useData()
const draft = useDraftAction()
const { data: view, error, refresh, pending } = await useAsyncData('compare', () => data.getCompare())
const selectedCorr = ref(0)
const columns = computed(() => Math.max(9, ...(view.value?.requests.map(r => r.bytes.length) ?? [])))

const label = 'pr-2.5 whitespace-nowrap text-pl-fg-strong'
const cell = 'grid h-7 place-items-center font-mono'
const hot = 'bg-pl-st-hypothesis/18 text-pl-st-hypothesis'
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader title="Сообщения рядом" subtitle="выровнены по началу">
        <template v-if="view">
          <span v-for="chip in view.chips" :key="chip" class="rounded border border-pl-wine-text bg-pl-wine-soft px-2 py-0.5 text-pl-fg-strong">{{ chip }}</span>
          <button class="pl-btn pl-btn-ghost h-7" type="button" @click="draft('Добавить сообщение в сравнение')">+ добавить</button>
        </template>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <template v-if="view">
          <div class="overflow-x-auto px-3 py-3.5">
            <div class="grid items-center gap-0.5" :style="{ gridTemplateColumns: `170px repeat(${columns}, 40px)` }">
              <span class="text-[11px] text-pl-muted">смещение</span>
              <span v-for="i in columns" :key="`h${i}`" class="text-center text-[11px] text-pl-muted">{{ i - 1 }}</span>

              <template v-for="row in view.requests" :key="row.label">
                <span :class="label">{{ safeText(row.label) }}</span>
                <span v-for="i in columns" :key="i" :class="[cell, row.changed[i - 1] && row.bytes[i - 1] ? hot : 'bg-pl-panel']">{{ row.bytes[i - 1] ?? '' }}</span>
              </template>

              <span :class="label">маска</span>
              <span v-for="i in columns" :key="`m${i}`" class="h-1.5" :class="view.mask[i - 1] ? 'bg-pl-st-hypothesis' : 'bg-pl-raise'" />

              <template v-for="row in view.responses" :key="row.label">
                <span :class="label">{{ safeText(row.label) }}</span>
                <span v-for="i in columns" :key="i" :class="[cell, row.changed[i - 1] && row.bytes[i - 1] ? hot : 'bg-pl-panel']">{{ row.bytes[i - 1] ?? '' }}</span>
              </template>
            </div>
          </div>

          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Корреляции с журналом</h3>
          <table class="pl-table">
            <thead><tr><th>Позиция</th><th>Как читать</th><th>Значения</th><th>Связь</th><th class="text-right">Доля</th></tr></thead>
            <tbody>
              <tr v-for="(c, i) in view.correlations" :key="i" :aria-selected="i === selectedCorr" @click="selectedCorr = i">
                <td>{{ c.position }}</td><td>{{ c.read }}</td><td>{{ safeText(c.values) }}</td><td>{{ safeText(c.relation) }}</td><td class="text-right whitespace-nowrap">{{ c.share }}</td>
              </tr>
            </tbody>
          </table>
        </template>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="view ? `Наблюдения · ${view.observationTotal}` : 'Наблюдения'">
      <div v-if="view" class="pl-scroll flex-1">
        <div v-for="o in view.observations" :key="o.id" class="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 border-b border-pl-line px-3 py-2.5">
          <span class="text-pl-fg-strong">{{ o.id }}</span>
          <div>
            <div>{{ safeText(o.text) }}</div>
            <div class="mt-1 flex flex-wrap gap-2">
              <CommonStatusBadge :status="o.status" />
              <span v-if="o.anchor" class="rounded-[3px] border border-pl-line px-1.5 text-[11px] text-pl-muted">{{ o.anchor }}</span>
            </div>
          </div>
        </div>
      </div>
      <footer class="border-t border-pl-line px-3 py-2.5">
        <button class="pl-btn pl-btn-primary" type="button" @click="draft('Наблюдение создано')">Выделение → наблюдение</button>
      </footer>
    </ShellInspectorContent>
  </div>
</template>
