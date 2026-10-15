<script setup lang="ts">
import type { ActionLogMapping, ActionLogRecord } from '~/api/types'
import { guessMapping, readCsvHeader } from '~/utils/csv-header'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ file: File | null }>()
const emit = defineEmits<{ imported: [log: ActionLogRecord] }>()

const data = useData()
const columns = ref<string[]>([])
const mapping = reactive<ActionLogMapping>({ time: '', action: '', params: null, result: null, source: null, timeFormat: 'rfc3339', paramsFormat: 'kv', resultFormat: 'kv', delimiter: null, utcOffsetMinutes: 0, clockOffsetMs: 0 })
const busy = ref(false)
type Column = 'time' | 'action' | 'params' | 'result' | 'source'
// Причина движка относится к его догадке: колонку сменили руками — так и пишем.
function reasonFor(key: Column) {
  if (!reasons.value[key]) return null
  return (mapping[key] ?? null) === (guessed.value[key] ?? null) ? safeText(reasons.value[key]) : tr('project.manualChoice')
}
const error = ref<string | null>(null)
const done = ref<ActionLogRecord | null>(null)
const reasons = ref<Record<string, string>>({})
const guessed = ref<Partial<ActionLogMapping>>({})
const trial = ref<{ rows: number, skipped: number } | null>(null)
const guessing = ref(false)

// Заголовок читаем из начала файла: весь журнал в память не грузим.
watch(() => props.file, async (file) => {
  done.value = null
  error.value = null
  columns.value = []
  if (!file) return
  const head = await file.slice(0, 64 * 1024).text()
  const header = readCsvHeader(head)
  columns.value = header.columns
  Object.assign(mapping, guessMapping(header.columns, head), { delimiter: header.delimiter === ',' ? null : header.delimiter })
  if (!header.columns.length) error.value = tr('project.noColumns')
  // Затем догадка движка: он пробует разобрать весь файл и объясняет выбор каждой колонки.
  reasons.value = {}
  guessed.value = {}
  trial.value = null
  guessing.value = true
  try {
    const g = await data.guessActionLog(file)
    if (g && props.file === file) {
      columns.value = g.columns
      Object.assign(mapping, g.mapping)
      reasons.value = g.reasons
      guessed.value = { ...g.mapping }
      trial.value = { rows: g.rows, skipped: g.skipped }
      if (g.columns.length) error.value = null
    }
  }
  catch {
    // Догадка — подсказка: без неё остаётся разбор заголовка в браузере.
  }
  finally {
    if (props.file === file) guessing.value = false
  }
}, { immediate: true })

const TIME_FORMATS = [
  { value: 'rfc3339', get label() { return tr('project.timeRfc3339') } },
  { value: 'unix_seconds', get label() { return tr('project.timeUnixSeconds') } },
  { value: 'unix_millis', get label() { return tr('project.timeUnixMillis') } },
  { value: 'unix_micros', get label() { return tr('project.timeUnixMicros') } },
  { value: 'unix_nanos', get label() { return tr('project.timeUnixNanos') } },
] as const

async function submit() {
  if (!props.file || !mapping.time || !mapping.action) return
  busy.value = true
  error.value = null
  try {
    done.value = await data.importActionLog(props.file, { ...mapping })
    emit('imported', done.value)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : tr('project.logImportFailed')
  }
  finally {
    busy.value = false
  }
}

const field = 'h-[30px] w-full rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong focus:border-pl-wine-text'
</script>

<template>
  <UModal v-model:open="open" :title="tr('project.logImportTitle')" :description="file?.name">
    <template #body>
      <div v-if="done" class="flex flex-col gap-2" aria-live="polite">
        <CommonStatusBadge status="rule" :label="tr('project.parsedActions', { n: done.rows })" />
        <p v-if="done.skipped" class="m-0 text-pl-muted">{{ tr('project.skippedRows', { n: done.skipped }) }}</p>
        <ul v-if="done.errors.length" class="m-0 max-h-40 list-none overflow-auto p-0 text-pl-muted">
          <li v-for="e in done.errors" :key="e.line">{{ tr('project.line', { n: e.line }) }}: {{ e.why }}</li>
        </ul>
      </div>
      <form v-else id="action-log-form" class="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-x-3 gap-y-2" @submit.prevent="submit">
        <p class="col-span-2 m-0 mb-1 text-pl-muted" aria-live="polite">
          <template v-if="guessing">{{ tr('project.guessing') }}</template>
          <template v-else-if="trial">{{ tr('project.guessed', { n: trial.rows, skipped: trial.skipped }) }}</template>
          <template v-if="reasons.delimiter"> {{ tr('project.delimiter') }} {{ safeText(reasons.delimiter) }}.</template>
        </p>
        <label for="al-time" class="text-pl-muted">{{ tr('project.time') }} *</label>
        <select id="al-time" v-model="mapping.time" :class="field" required>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasonFor('time')" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ reasonFor('time') }}</p>
        <label for="al-format" class="text-pl-muted">{{ tr('project.timeFormat') }}</label>
        <select id="al-format" v-model="mapping.timeFormat" :class="field">
          <option v-for="f in TIME_FORMATS" :key="f.value" :value="f.value">{{ f.label }}</option>
        </select>
        <label for="al-action" class="text-pl-muted">{{ tr('project.action') }} *</label>
        <select id="al-action" v-model="mapping.action" :class="field" required>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasonFor('action')" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ reasonFor('action') }}</p>
        <label for="al-params" class="text-pl-muted">{{ tr('project.params') }}</label>
        <select id="al-params" v-model="mapping.params" :class="field">
          <option :value="null">{{ tr('project.none') }}</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasonFor('params')" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ reasonFor('params') }}</p>
        <label for="al-result" class="text-pl-muted">{{ tr('project.result') }}</label>
        <select id="al-result" v-model="mapping.result" :class="field">
          <option :value="null">{{ tr('project.none') }}</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasonFor('result')" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ reasonFor('result') }}</p>
        <label for="al-source" class="text-pl-muted">{{ tr('project.captureColumn') }}</label>
        <select id="al-source" v-model="mapping.source" :class="field" :title="tr('project.sourceColumnHint')">
          <option :value="null">{{ tr('project.none') }}</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasonFor('source')" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ reasonFor('source') }}</p>
        <label for="al-pformat" class="text-pl-muted">{{ tr('project.paramsFormat') }}</label>
        <select id="al-pformat" v-model="mapping.paramsFormat" :class="field">
          <option value="kv">{{ tr('project.kv') }}</option>
          <option value="json">JSON</option>
        </select>
        <label for="al-rformat" class="text-pl-muted">{{ tr('project.resultFormat') }}</label>
        <select id="al-rformat" v-model="mapping.resultFormat" :class="field">
          <option value="kv">{{ tr('project.kv') }}</option>
          <option value="json">JSON</option>
        </select>
        <label for="al-utc" class="text-pl-muted">{{ tr('project.utcOffset') }}</label>
        <input id="al-utc" v-model.number="mapping.utcOffsetMinutes" type="number" step="15" :class="field">
        <label for="al-clock" class="text-pl-muted">{{ tr('project.clockOffset') }}</label>
        <input id="al-clock" v-model.number="mapping.clockOffsetMs" type="number" :class="field">
        <p class="col-span-2 m-0 text-xs text-pl-muted">
          {{ tr('project.logHint') }}
        </p>
      </form>
      <p v-if="error" class="mt-3 mb-0 text-pl-st-violation" role="alert">{{ error }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2.5">
        <button class="pl-btn" type="button" @click="open = false">{{ done ? tr('project.importDone') : tr('common.cancel') }}</button>
        <button v-if="!done" class="pl-btn pl-btn-primary" type="submit" form="action-log-form" :disabled="busy || !columns.length">{{ busy ? tr('project.importing') : tr('project.importAction') }}</button>
      </div>
    </template>
  </UModal>
</template>
