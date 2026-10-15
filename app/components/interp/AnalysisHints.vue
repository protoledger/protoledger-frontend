<script setup lang="ts">
import type { ChecksumHints, EntropyPage, FieldBehaviorHints, TypeHints } from '~/api/types'
import type { MessageKey } from '~/i18n'

// Подсказки движка по сохранённым границам сообщений; в описание их переносит исследователь.
const props = defineProps<{ streams: string[], messageIds: string[] }>()

type Tab = 'types' | 'fields' | 'checksums' | 'entropy'
const TABS: [Tab, MessageKey][] = [['types', 'interp.hints.tab.types'], ['fields', 'interp.hints.tab.fields'], ['checksums', 'interp.hints.tab.checksums'], ['entropy', 'interp.hints.tab.entropy']]

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
    error.value = tr('interp.hints.noStreams')
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
    error.value = e instanceof Error ? e.message : tr('interp.hints.noAnswer')
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

const KIND: Record<string, MessageKey> = { counter: 'interp.kind.counter', time: 'interp.kind.time', string: 'interp.kind.string', text: 'interp.kind.text', tlv: 'interp.kind.tlv' }
const REGION: Record<string, MessageKey> = { high: 'interp.region.high', text: 'interp.region.text', low: 'interp.region.low' }
const UNIT: Record<string, MessageKey> = { s: 'interp.unit.s', ms: 'interp.unit.ms', us: 'interp.unit.us' }
// Подпись берётся при отрисовке, чтобы язык переключался на лету; неизвестное значение показываем как пришло.
const dictLabel = (dict: Record<string, MessageKey>, value: string) => {
  const key = dict[value]
  return key ? tr(key) : value
}
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
  if (r?.truncated) notes.push(tr('interp.partial.truncated'))
  if (r?.incomplete) notes.push(tr('interp.partial.incomplete'))
  if (tab.value === 'checksums' && sums.value?.skippedLong) notes.push(tr('interp.partial.skippedLong', { n: sums.value.skippedLong }))
  if (tab.value === 'entropy' && entropy.value?.streams.some(s => s.truncated)) notes.push(tr('interp.partial.streams'))
  return notes
})

const empty = 'm-0 text-pl-muted'
const card = 'flex flex-col gap-1 border border-pl-line p-2.5'
</script>

<template>
  <div class="flex flex-col gap-2 px-3 pb-2">
    <div class="pl-seg self-start" role="radiogroup" :aria-label="tr('interp.hints.aria')">
      <button v-for="[v, l] in TABS" :key="v" type="button" role="radio" :aria-checked="tab === v" @click="tab = v">{{ tr(l) }}</button>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <select v-if="needsType" v-model="messageId" class="h-7 min-w-0 flex-1 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg" :aria-label="tr('interp.hints.messageAria')">
        <option value="">{{ tr('interp.hints.allMessages') }}</option>
        <option v-for="id in messageIds" :key="id" :value="id">{{ safeText(id) }}</option>
      </select>
      <button class="pl-btn h-7" type="button" :disabled="pending" @click="find">{{ pending ? tr('interp.hints.searching') : tr('interp.hints.find') }}</button>
    </div>
    <p class="m-0 text-xs text-pl-muted">{{ tr('interp.hints.note', { n: streams.length }) }}</p>
    <p v-if="error" class="m-0 text-pl-st-violation" role="alert">{{ safeText(error) }}</p>
    <p v-if="partial.length && !pending" class="m-0 text-pl-st-hypothesis">{{ tr('interp.partial.title') }}: {{ partial.join('; ') }}.</p>

    <template v-if="tab === 'types' && types && !pending">
      <p v-if="!types.types.length" :class="empty">{{ tr('interp.types.none') }}</p>
      <template v-else>
        <p class="m-0 text-pl-muted">{{ tr('interp.types.summary', { messages: types.messages, groups: types.types.length }) }}<template v-if="types.rare"> · {{ tr('interp.types.rare', { n: types.rare }) }}</template></p>
        <div v-if="types.fields.length" class="flex flex-wrap items-center gap-1.5">
          <span class="text-pl-muted">{{ tr('interp.types.declare') }}</span>
          <code v-for="f in types.fields" :key="f.name" class="font-mono">{ name: {{ f.name }}, at: {{ f.at }}, type: {{ f.type }} }</code>
        </div>
        <div v-for="t in types.types" :key="t.id" :class="card">
          <div class="flex flex-wrap items-center gap-1.5">
            <b class="font-mono font-semibold text-pl-fg-strong">{{ safeText(t.id) }}</b>
            <span class="text-pl-muted">{{ tr('interp.types.group', { count: t.count, len: t.minLen === t.maxLen ? t.minLen : `${t.minLen}–${t.maxLen}` }) }}</span>
          </div>
          <div class="flex items-start gap-2">
            <code class="min-w-0 flex-1 font-mono text-xs break-all">when: "{{ safeText(t.when) }}"</code>
            <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="copy(whenLine(t.when))">{{ copied === whenLine(t.when) ? tr('common.copied') : tr('common.copy') }}</button>
          </div>
        </div>
      </template>
    </template>

    <template v-if="tab === 'fields' && fields && !pending">
      <p v-if="!fields.hints.length" :class="empty">{{ tr('interp.fields.none', { messages: fields.messages }) }}</p>
      <div v-for="(h, i) in fields.hints" :key="i" :class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <CommonStatusBadge status="hypothesis" :label="dictLabel(KIND, h.kind)" />
          <span class="font-mono">at: {{ h.at }}, type: {{ h.type }}</span>
          <span class="text-pl-muted">{{ h.matches }} / {{ h.samples }}</span>
        </div>
        <p class="m-0">
          {{ safeText(h.summary) }}<template v-if="h.unit"> · {{ tr('interp.fields.unit', { unit: dictLabel(UNIT, h.unit) }) }}{{ h.epoch ? tr('interp.fields.epoch') : '' }}</template><template v-if="h.example"> · {{ tr('interp.fields.example', { example: safeText(h.example) }) }}</template>
        </p>
        <p v-if="h.equivalent.length" class="m-0 text-xs text-pl-muted">{{ tr('interp.fields.equivalent', { list: h.equivalent.map(e => `${e.type}@${e.at}`).join(', ') }) }}</p>
        <NuxtLink v-if="h.firstCounterexample" :to="streamLink(h.firstCounterexample.stream, h.firstCounterexample.start, h.firstCounterexample.end)" class="text-xs text-pl-wine-text hover:underline">{{ tr('interp.counterexample.first') }}</NuxtLink>
      </div>
    </template>

    <template v-if="tab === 'checksums' && sums && !pending">
      <p v-if="!sums.hints.length" :class="empty">{{ tr('interp.sums.none', { checked: sums.checked.length, messages: sums.messages }) }}</p>
      <div v-for="(h, i) in sums.hints" :key="i" :class="card">
        <div class="flex flex-wrap items-center gap-1.5">
          <b class="font-semibold text-pl-fg-strong">{{ safeText(h.title) }}</b>
          <span class="font-mono">at: {{ h.at }}, type: {{ h.type }}</span>
          <span class="text-pl-muted">{{ h.matches }} / {{ h.samples }} · {{ share(h.sharePermille) }}</span>
        </div>
        <div class="flex items-start gap-2">
          <code class="min-w-0 flex-1 font-mono text-xs break-all">{{ safeText(h.expr) }}</code>
          <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="copy(h.expr)">{{ copied === h.expr ? tr('common.copied') : tr('common.copy') }}</button>
        </div>
        <p v-if="h.equivalent.length" class="m-0 text-xs text-pl-muted">{{ tr('interp.sums.same', { list: h.equivalent.map(e => `${e.algorithm} ${tr('interp.sums.fromByte', { n: e.from })}`).join(', ') }) }}</p>
        <NuxtLink v-if="h.firstCounterexample" :to="streamLink(h.firstCounterexample.stream, h.firstCounterexample.start, h.firstCounterexample.end)" class="text-xs text-pl-wine-text hover:underline">
          {{ tr('interp.counterexample.gotExpected', { got: h.firstCounterexample.got, expected: h.firstCounterexample.expected }) }}
        </NuxtLink>
      </div>
    </template>

    <template v-if="tab === 'entropy' && entropy && !pending">
      <div v-for="s in entropy.streams" :key="s.stream" :class="card">
        <span class="font-mono text-xs">{{ safeText(s.stream) }}</span>
        <p class="m-0">{{ safeText(s.summary) }}</p>
        <NuxtLink v-for="r in s.regions.slice(0, 5)" :key="r.start" :to="streamLink(s.stream, r.start, r.end)" class="text-xs text-pl-wine-text hover:underline">
          [{{ r.start }}, {{ r.end }}) — {{ dictLabel(REGION, r.kind) }}
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
