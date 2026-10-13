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
const error = ref<string | null>(null)
const done = ref<ActionLogRecord | null>(null)
const reasons = ref<Record<string, string>>({})
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
  if (!header.columns.length) error.value = 'В первой строке файла не найдены названия колонок'
  // Затем догадка движка: он пробует разобрать весь файл и объясняет выбор каждой колонки.
  reasons.value = {}
  trial.value = null
  guessing.value = true
  try {
    const g = await data.guessActionLog(file)
    if (g && props.file === file) {
      columns.value = g.columns
      Object.assign(mapping, g.mapping)
      reasons.value = g.reasons
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
  ['rfc3339', 'RFC 3339 (2026-10-01T12:00:00Z)'],
  ['unix_seconds', 'Unix, секунды'],
  ['unix_millis', 'Unix, миллисекунды'],
  ['unix_micros', 'Unix, микросекунды'],
  ['unix_nanos', 'Unix, наносекунды'],
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
    error.value = e instanceof Error ? e.message : 'Не удалось импортировать журнал'
  }
  finally {
    busy.value = false
  }
}

const field = 'h-[30px] w-full rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong focus:border-pl-wine-text'
</script>

<template>
  <UModal v-model:open="open" title="Импорт журнала действий" :description="file?.name">
    <template #body>
      <div v-if="done" class="flex flex-col gap-2" aria-live="polite">
        <CommonStatusBadge status="rule" :label="`разобрано действий: ${done.rows}`" />
        <p v-if="done.skipped" class="m-0 text-pl-muted">Не разобрано строк: {{ done.skipped }}. Первые из них:</p>
        <ul v-if="done.errors.length" class="m-0 max-h-40 list-none overflow-auto p-0 text-pl-muted">
          <li v-for="e in done.errors" :key="e.line">строка {{ e.line }}: {{ e.why }}</li>
        </ul>
      </div>
      <form v-else id="action-log-form" class="grid grid-cols-[140px_minmax(0,1fr)] items-center gap-x-3 gap-y-2" @submit.prevent="submit">
        <p class="col-span-2 m-0 mb-1 text-pl-muted" aria-live="polite">
          <template v-if="guessing">Движок подбирает колонки…</template>
          <template v-else-if="trial">Колонки подобраны движком: пробный разбор — {{ trial.rows }} строк<template v-if="trial.skipped">, не разобрано {{ trial.skipped }}</template>. Проверьте и при необходимости поправьте.</template>
          <template v-if="reasons.delimiter"> Разделитель {{ safeText(reasons.delimiter) }}.</template>
        </p>
        <label for="al-time" class="text-pl-muted">Время *</label>
        <select id="al-time" v-model="mapping.time" :class="field" required>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasons.time" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ safeText(reasons.time) }}</p>
        <label for="al-format" class="text-pl-muted">Формат времени</label>
        <select id="al-format" v-model="mapping.timeFormat" :class="field">
          <option v-for="[v, l] in TIME_FORMATS" :key="v" :value="v">{{ l }}</option>
        </select>
        <label for="al-action" class="text-pl-muted">Действие *</label>
        <select id="al-action" v-model="mapping.action" :class="field" required>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasons.action" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ safeText(reasons.action) }}</p>
        <label for="al-params" class="text-pl-muted">Параметры</label>
        <select id="al-params" v-model="mapping.params" :class="field">
          <option :value="null">— нет —</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasons.params" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ safeText(reasons.params) }}</p>
        <label for="al-result" class="text-pl-muted">Результат</label>
        <select id="al-result" v-model="mapping.result" :class="field">
          <option :value="null">— нет —</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasons.result" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ safeText(reasons.result) }}</p>
        <label for="al-source" class="text-pl-muted">Колонка записи</label>
        <select id="al-source" v-model="mapping.source" :class="field" title="Если журнал описывает несколько записей: колонка с именем файла записи для каждого действия">
          <option :value="null">— нет —</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <p v-if="reasons.source" class="col-start-2 -mt-1 mb-0 text-xs text-pl-muted">{{ safeText(reasons.source) }}</p>
        <label for="al-pformat" class="text-pl-muted">Формат параметров</label>
        <select id="al-pformat" v-model="mapping.paramsFormat" :class="field">
          <option value="kv">ключ=значение;…</option>
          <option value="json">JSON</option>
        </select>
        <label for="al-rformat" class="text-pl-muted">Формат результата</label>
        <select id="al-rformat" v-model="mapping.resultFormat" :class="field">
          <option value="kv">ключ=значение;…</option>
          <option value="json">JSON</option>
        </select>
        <label for="al-utc" class="text-pl-muted">Пояс, мин от UTC</label>
        <input id="al-utc" v-model.number="mapping.utcOffsetMinutes" type="number" step="15" :class="field">
        <label for="al-clock" class="text-pl-muted">Сдвиг часов, мс</label>
        <input id="al-clock" v-model.number="mapping.clockOffsetMs" type="number" :class="field">
        <p class="col-span-2 m-0 text-xs text-pl-muted">
          Колонка записи нужна, если один журнал описывает несколько записей. Сдвиг часов — поправка, если часы клиента расходились с часами записи.
        </p>
      </form>
      <p v-if="error" class="mt-3 mb-0 text-pl-st-violation" role="alert">{{ error }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2.5">
        <button class="pl-btn" type="button" @click="open = false">{{ done ? 'Закрыть' : 'Отмена' }}</button>
        <button v-if="!done" class="pl-btn pl-btn-primary" type="submit" form="action-log-form" :disabled="busy || !columns.length">{{ busy ? 'Импортирую…' : 'Импортировать' }}</button>
      </div>
    </template>
  </UModal>
</template>
