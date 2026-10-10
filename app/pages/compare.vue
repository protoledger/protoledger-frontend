<script setup lang="ts">
const data = useData()
const draft = useDraftAction()
const workspace = useWorkspaceStore()
const action = ref<string | undefined>(undefined)
const { data: view, error, refresh, pending } = await useAsyncData('compare', () => data.getCompare(action.value), { watch: [action] })
const selectedCorr = ref(0)
const saving = ref(false)
const saveNote = ref<string | null>(null)
const columns = computed(() => Math.max(8, ...(view.value?.requests.map(r => r.bytes.length) ?? []), ...(view.value?.responses.map(r => r.bytes.length) ?? [])))
const corr = computed(() => view.value?.correlations[selectedCorr.value] ?? null)

watch(view, () => { selectedCorr.value = 0 })

async function toObservation() {
  const c = corr.value
  if (!c?.anchor) return
  saving.value = true
  saveNote.value = null
  try {
    const comment = `байты ${c.position} (${c.read}) ${c.relation}, ${c.share}`
    const saved = await data.createObservation(c.anchor, comment)
    if (!saved) return draft('Наблюдение создано')
    workspace.log(`Наблюдение: ${comment}`)
    saveNote.value = 'Наблюдение сохранено.'
    await refresh()
  }
  catch (e) {
    saveNote.value = e instanceof Error ? `Не сохранено: ${e.message}` : 'Не сохранено'
  }
  finally {
    saving.value = false
  }
}

const label = 'pr-2.5 whitespace-nowrap text-pl-fg-strong'
const cell = 'grid h-7 place-items-center font-mono'
const hot = 'bg-pl-st-hypothesis/18 text-pl-st-hypothesis'
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader title="Сообщения рядом" :subtitle="view?.action ? `действие ${view.action} · выровнены по началу` : 'выровнены по началу'">
        <select
          v-if="view?.actions.length"
          class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong"
          aria-label="Действие журнала для сравнения"
          :value="view.action ?? ''"
          @change="action = ($event.target as HTMLSelectElement).value"
        >
          <option v-for="a in view.actions" :key="a" :value="a">{{ safeText(a) }}</option>
        </select>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <template v-if="view">
          <p v-for="n in view.notes" :key="n" class="px-3 pt-3 text-pl-muted">{{ n }}</p>
          <div v-if="view.requests.length" class="overflow-x-auto px-3 py-3.5">
            <div class="grid items-center gap-0.5" :style="{ gridTemplateColumns: `200px repeat(${columns}, 34px)` }">
              <span class="text-[11px] text-pl-muted">смещение</span>
              <span v-for="i in columns" :key="`h${i}`" class="text-center text-[11px] text-pl-muted">{{ i - 1 }}</span>

              <template v-for="(row, r) in view.requests" :key="`q${r}`">
                <span :class="label" class="truncate" :title="safeText(row.label)">{{ safeText(row.label) }}</span>
                <span v-for="i in columns" :key="i" :class="[cell, row.changed[i - 1] && row.bytes[i - 1] ? hot : 'bg-pl-panel']">{{ row.bytes[i - 1] ?? '' }}</span>
              </template>

              <span :class="label">маска</span>
              <span v-for="i in columns" :key="`m${i}`" class="h-1.5" :class="view.mask[i - 1] ? 'bg-pl-st-hypothesis' : 'bg-pl-raise'" />

              <template v-for="(row, r) in view.responses" :key="`a${r}`">
                <span :class="label" class="truncate" :title="safeText(row.label)">{{ safeText(row.label) }}</span>
                <span v-for="i in columns" :key="i" :class="[cell, row.changed[i - 1] && row.bytes[i - 1] ? hot : 'bg-pl-panel']">{{ row.bytes[i - 1] ?? '' }}</span>
              </template>
            </div>
          </div>

          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Корреляции с журналом</h3>
          <p v-if="!view.correlations.length" class="px-3 text-pl-muted">Связей байтов с параметрами не найдено.</p>
          <table v-else class="pl-table">
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
        <p v-if="!view.observations.length" class="p-3 text-pl-muted">Наблюдений пока нет: выберите связь слева и сохраните её как наблюдение.</p>
        <div v-for="o in view.observations" :key="o.id" class="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 border-b border-pl-line px-3 py-2.5">
          <span class="text-pl-fg-strong">{{ o.id }}</span>
          <div>
            <div>{{ safeText(o.text) }}</div>
            <div class="mt-1 flex flex-wrap gap-2">
              <CommonStatusBadge :status="o.status" :label="o.label" />
              <span v-if="o.anchor" class="rounded-[3px] border border-pl-line px-1.5 text-[11px] text-pl-muted">{{ safeText(o.anchor) }}</span>
            </div>
          </div>
        </div>
      </div>
      <footer class="flex flex-col items-start gap-2 border-t border-pl-line px-3 py-2.5">
        <span v-if="corr" class="text-pl-muted">Выбрано: байты {{ corr.position }} {{ safeText(corr.relation) }}</span>
        <button class="pl-btn pl-btn-primary" type="button" :disabled="!corr?.anchor || saving" @click="toObservation">Выделение → наблюдение</button>
        <span v-if="saveNote" aria-live="polite">{{ saveNote }}</span>
      </footer>
    </ShellInspectorContent>
  </div>
</template>
