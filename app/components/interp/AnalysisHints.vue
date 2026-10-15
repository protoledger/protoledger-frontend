<script setup lang="ts">
import type { ChecksumHints, EntropyPage, FieldBehaviorHints, TypeHints } from '~/api/types'

// Подсказки движка по сохранённым границам сообщений; в описание их переносит исследователь.
const props = defineProps<{ streams: string[], messageIds: string[] }>()

type Tab = 'types' | 'fields' | 'checksums' | 'entropy'
const TABS: [Tab, string][] = [['types', 'Типы'], ['fields', 'Поля'], ['checksums', 'Суммы'], ['entropy', 'Энтропия']]

const data = useData()
const tab = ref<Tab>('types')
const messageId = ref('')
const pending = ref(false)
const error = ref<string | null>(null)
const types = ref<TypeHints | null>(null)
const fields = ref<FieldBehaviorHints | null>(null)
const sums = ref<ChecksumHints | null>(null)
const entropy = ref<EntropyPage | null>(null)
const copied = ref<string | null>(null)

// Поля и суммы ищутся среди сообщений одного вида — без типа выбираем первый.
watch(() => props.messageIds, (ids) => {
  if (!ids.includes(messageId.value)) messageId.value = ids[0] ?? ''
}, { immediate: true })

const needsType = computed(() => tab.value === 'fields' || tab.value === 'checksums')

async function find() {
  if (!props.streams.length) {
    error.value = 'Выберите потоки в черновике описания'
    return
  }
  pending.value = true
  error.value = null
  try {
    const id = messageId.value || undefined
    if (tab.value === 'types') types.value = await data.getTypeHints(props.streams)
    else if (tab.value === 'fields') fields.value = await data.getFieldBehavior(props.streams, id)
    else if (tab.value === 'checksums') sums.value = await data.getChecksumHints(props.streams, id)
    else entropy.value = await data.getEntropy(props.streams)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Движок не ответил'
  }
  finally {
    pending.value = false
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = text
    setTimeout(() => { if (copied.value === text) copied.value = null }, 1500)
  }
  catch {
    copied.value = null
  }
}

const KIND: Record<string, string> = { counter: 'счётчик', time: 'время', string: 'строка с длиной', text: 'текст', tlv: 'записи «метка, длина, значение»' }
const REGION: Record<string, string> = { high: 'похоже на сжатие или шифрование', text: 'текст', low: 'заполнение' }
const UNIT: Record<string, string> = { s: 'с', ms: 'мс', us: 'мкс' }
const whenLine = (when: string) => `when: "${when}"`
const share = (p: number) => `${Math.round(p / 10)} %`

function streamLink(stream: string, start: number, end: number) {
  const cut = stream.lastIndexOf(':')
  return { path: '/overview', query: { conn: stream.slice(0, cut), dir: stream.slice(cut + 1), from: String(start), to: String(end) } }
}

// Движок мог разобрать не всё: предел числа сообщений или времени — говорим об этом рядом с результатом.
const partial = computed(() => {
  const r = tab.value === 'types' ? types.value : tab.value === 'fields' ? fields.value : tab.value === 'checksums' ? sums.value : null
  const notes: string[] = []
  if (r?.truncated) notes.push('взята часть сообщений (предел)')
  if (r?.incomplete) notes.push('поиск прерван по времени — список может быть неполон')
  if (tab.value === 'checksums' && sums.value?.skippedLong) notes.push(`пропущено длинных сообщений: ${sums.value.skippedLong}`)
  if (tab.value === 'entropy' && entropy.value?.streams.some(s => s.truncated)) notes.push('часть потоков просмотрена не целиком (предел)')
  return notes
})

const empty = 'm-0 text-pl-muted'
const card = 'flex flex-col gap-1 border border-pl-line p-2.5'
</script>

<template>
  <div class="flex flex-col gap-2 px-3 pb-2">
    <div class="pl-seg self-start" role="radiogroup" aria-label="Вид подсказки">
      <button v-for="[v, l] in TABS" :key="v" type="button" role="radio" :aria-checked="tab === v" @click="tab = v">{{ l }}</button>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <select v-if="needsType" v-model="messageId" class="h-7 min-w-0 flex-1 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg" aria-label="Тип сообщения">
        <option value="">все сообщения</option>
        <option v-for="id in messageIds" :key="id" :value="id">{{ safeText(id) }}</option>
      </select>
      <button class="pl-btn h-7" type="button" :disabled="pending" @click="find">{{ pending ? 'Ищу…' : 'Найти' }}</button>
    </div>
    <p class="m-0 text-xs text-pl-muted">По потокам черновика ({{ streams.length }}) и границам сохранённого описания. Это подсказки по данным, не выводы.</p>
    <p v-if="error" class="m-0 text-pl-st-violation" role="alert">{{ safeText(error) }}</p>
    <p v-if="partial.length && !pending" class="m-0 text-pl-st-hypothesis">Неполно: {{ partial.join('; ') }}.</p>

    <template v-if="tab === 'types' && types && !pending">
      <p v-if="!types.types.length" :class="empty">На типы сообщения не делятся — различителя не нашлось.</p>
      <template v-else>
        <p class="m-0 text-pl-muted">{{ types.messages }} сообщ. · групп {{ types.types.length }}<template v-if="types.rare"> · редких {{ types.rare }}</template></p>
        <div v-if="types.fields.length" class="flex flex-wrap items-center gap-1.5">
          <span class="text-pl-muted">Объявить поля:</span>
          <code v-for="f in types.fields" :key="f.name" class="font-mono">{ name: {{ f.name }}, at: {{ f.at }}, type: {{ f.type }} }</code>
        </div>
        <div v-for="t in types.types" :key="t.id" :class="card">
          <div class="flex flex-wrap items-center gap-1.5">
            <b class="font-mono font-semibold text-pl-fg-strong">{{ safeText(t.id) }}</b>
            <span class="text-pl-muted">{{ t.count }} сообщ. · длина {{ t.minLen === t.maxLen ? t.minLen : `${t.minLen}–${t.maxLen}` }}</span>
          </div>
          <div class="flex items-start gap-2">
            <code class="min-w-0 flex-1 font-mono text-xs break-all">when: "{{ safeText(t.when) }}"</code>
            <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="copy(whenLine(t.when))">{{ copied === whenLine(t.when) ? 'скопировано' : 'копировать' }}</button>
          </div>
        </div>
      </template>
    </template>

    <template v-if="tab === 'fields' && fields && !pending">
      <p v-if="!fields.hints.length" :class="empty">Узнаваемых полей (счётчик, время, строка, текст, записи) не нашлось среди {{ fields.messages }} сообщ.</p>
      <div v-for="(h, i) in fields.hints" :key="i" :class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <CommonStatusBadge status="hypothesis" :label="KIND[h.kind] ?? h.kind" />
          <span class="font-mono">at: {{ h.at }}, type: {{ h.type }}</span>
          <span class="text-pl-muted">{{ h.matches }} / {{ h.samples }}</span>
        </div>
        <p class="m-0">
          {{ safeText(h.summary) }}<template v-if="h.unit"> · единица {{ UNIT[h.unit] ?? h.unit }}{{ h.epoch ? ', от эпохи Unix' : '' }}</template><template v-if="h.example"> · например «{{ safeText(h.example) }}»</template>
        </p>
        <p v-if="h.equivalent.length" class="m-0 text-xs text-pl-muted">Неотличимо на этих данных: {{ h.equivalent.map(e => `${e.type}@${e.at}`).join(', ') }}</p>
        <NuxtLink v-if="h.firstCounterexample" :to="streamLink(h.firstCounterexample.stream, h.firstCounterexample.start, h.firstCounterexample.end)" class="text-xs text-pl-wine-text hover:underline">первый контрпример</NuxtLink>
      </div>
    </template>

    <template v-if="tab === 'checksums' && sums && !pending">
      <p v-if="!sums.hints.length" :class="empty">Ни одна из проверенных функций ({{ sums.checked.length }}) не сошлась на {{ sums.messages }} сообщ. Это не значит, что контрольной суммы нет.</p>
      <div v-for="(h, i) in sums.hints" :key="i" :class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <b class="font-semibold text-pl-fg-strong">{{ safeText(h.title) }}</b>
          <span class="font-mono">at: {{ h.at }}, type: {{ h.type }}</span>
          <span class="text-pl-muted">{{ h.matches }} / {{ h.samples }} · {{ share(h.sharePermille) }}</span>
        </div>
        <div class="flex items-start gap-2">
          <code class="min-w-0 flex-1 font-mono text-xs break-all">{{ safeText(h.expr) }}</code>
          <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="copy(h.expr)">{{ copied === h.expr ? 'скопировано' : 'копировать' }}</button>
        </div>
        <p v-if="h.equivalent.length" class="m-0 text-xs text-pl-muted">То же даёт: {{ h.equivalent.map(e => `${e.algorithm} с байта ${e.from}`).join(', ') }}</p>
        <NuxtLink v-if="h.firstCounterexample" :to="streamLink(h.firstCounterexample.stream, h.firstCounterexample.start, h.firstCounterexample.end)" class="text-xs text-pl-wine-text hover:underline">
          первый контрпример: {{ h.firstCounterexample.got }} вместо {{ h.firstCounterexample.expected }}
        </NuxtLink>
      </div>
    </template>

    <template v-if="tab === 'entropy' && entropy && !pending">
      <div v-for="s in entropy.streams" :key="s.stream" :class="card">
        <span class="font-mono text-xs">{{ safeText(s.stream) }}</span>
        <p class="m-0">{{ safeText(s.summary) }}</p>
        <NuxtLink v-for="r in s.regions.slice(0, 5)" :key="r.start" :to="streamLink(s.stream, r.start, r.end)" class="text-xs text-pl-wine-text hover:underline">
          [{{ r.start }}, {{ r.end }}) — {{ REGION[r.kind] ?? r.kind }}
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
