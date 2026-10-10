<script setup lang="ts">
import type { ActionLogMapping, ActionLogRecord } from '~/api/types'
import { guessMapping, readCsvHeader } from '~/utils/csv-header'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ file: File | null }>()
const emit = defineEmits<{ imported: [log: ActionLogRecord] }>()

const data = useData()
const columns = ref<string[]>([])
const mapping = reactive<ActionLogMapping>({ time: '', action: '', params: null, result: null, timeFormat: 'rfc3339', paramsFormat: 'kv', resultFormat: 'kv', delimiter: null, utcOffsetMinutes: 0, clockOffsetMs: 0 })
const busy = ref(false)
const error = ref<string | null>(null)
const done = ref<ActionLogRecord | null>(null)

// Заголовок читаем из начала файла: весь журнал в память не грузим.
watch(() => props.file, async (file) => {
  done.value = null
  error.value = null
  columns.value = []
  if (!file) return
  const header = readCsvHeader(await file.slice(0, 64 * 1024).text())
  columns.value = header.columns
  Object.assign(mapping, guessMapping(header.columns), { delimiter: header.delimiter === ',' ? null : header.delimiter })
  if (!header.columns.length) error.value = 'В первой строке файла не найдены названия колонок'
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

const field = 'h-[30px] w-full rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong outline-none focus:border-pl-wine-text'
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
        <label for="al-time" class="text-pl-muted">Время *</label>
        <select id="al-time" v-model="mapping.time" :class="field" required>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <label for="al-format" class="text-pl-muted">Формат времени</label>
        <select id="al-format" v-model="mapping.timeFormat" :class="field">
          <option v-for="[v, l] in TIME_FORMATS" :key="v" :value="v">{{ l }}</option>
        </select>
        <label for="al-action" class="text-pl-muted">Действие *</label>
        <select id="al-action" v-model="mapping.action" :class="field" required>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <label for="al-params" class="text-pl-muted">Параметры</label>
        <select id="al-params" v-model="mapping.params" :class="field">
          <option :value="null">— нет —</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <label for="al-result" class="text-pl-muted">Результат</label>
        <select id="al-result" v-model="mapping.result" :class="field">
          <option :value="null">— нет —</option>
          <option v-for="c in columns" :key="c" :value="c">{{ c }}</option>
        </select>
        <label for="al-utc" class="text-pl-muted">Пояс, мин от UTC</label>
        <input id="al-utc" v-model.number="mapping.utcOffsetMinutes" type="number" step="15" :class="field">
        <label for="al-clock" class="text-pl-muted">Сдвиг часов, мс</label>
        <input id="al-clock" v-model.number="mapping.clockOffsetMs" type="number" :class="field">
        <p class="col-span-2 m-0 text-xs text-pl-muted">
          Параметры и результат — <code class="font-mono">ключ=значение;…</code>. Сдвиг часов — поправка, если часы клиента расходились с часами записи.
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
