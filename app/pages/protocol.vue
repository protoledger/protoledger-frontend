<script setup lang="ts">
import { ApiError, apiClient, unwrap } from '~/api/client'
import type { components } from '~/api/schema'
import { MESSAGES, type MessageKey } from '~/i18n'
import type { FixHintsView } from '~/data/views'
import { collectConnections } from '~/data/connections'
import { saveTextFile } from '~/utils/save-file'

type RunHypothesis = components['schemas']['RunHypothesis']
type RunHead = components['schemas']['RunHead']

interface FieldDef {
  name: string
  at: number | string
  type: string
  len?: number | string
  status: 'rule' | 'hypothesis' | 'unknown'
  hypothesis?: string
  description?: string
  [key: string]: unknown
}
interface MessageDef {
  id: string
  when?: string
  description?: string
  fields: FieldDef[]
  [key: string]: unknown
}
interface Structure {
  format: string
  framing: { kind: string, length?: { at: number, type: string, adjust?: number }, size?: number, bytes?: string, sync?: string, [key: string]: unknown }
  messages: MessageDef[]
  hypotheses?: { id: string, statement: string, test?: string, [key: string]: unknown }[]
  [key: string]: unknown
}

definePageMeta({ inspector: false })

const api = apiClient()
const data = useData()
const project = useProjectStore()
const jobs = useJobsStore()
const workspace = useWorkspaceStore()

const doc = ref<{ rev: number, yaml: string, structure: Structure } | null>(null)
const run = ref<{ head: RunHead, hypotheses: Map<string, RunHypothesis> } | null>(null)
const loadError = ref<string | null>(null)
const loading = ref(true)
const selectedId = ref<string | null>(null)
const busy = ref<string | null>(null)
const actionError = ref<string | null>(null)
const notice = ref<string | null>(null)
const draftSteps = ref<{ title: string, detail: string }[]>([])
const confirmRebuild = ref(false)

async function load() {
  loadError.value = null
  try {
    const res = await api.GET('/api/interpretation')
    if (res.response.status === 404) doc.value = null
    else {
      const d = unwrap(res)
      doc.value = { rev: d.rev, yaml: d.yaml, structure: d.structure as unknown as Structure }
    }
    const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 1 } } }))
    const head = runs.items[0]
    if (head) {
      const detail = unwrap(await api.GET('/api/runs/{id}', { params: { path: { id: head.id } } }))
      run.value = { head, hypotheses: new Map(detail.hypotheses.map(h => [h.id, h])) }
    }
    else run.value = null
    if (doc.value && !doc.value.structure.messages.some(m => m.id === selectedId.value)) selectedId.value = doc.value.structure.messages[0]?.id ?? null
  }
  catch (e) {
    loadError.value = e instanceof Error ? e.message : tr('protocol.loadFailed')
  }
  finally {
    loading.value = false
  }
}
const route = useRoute()
onMounted(async () => {
  await load()
  // Переход «Как исправить» с экрана «Проверка»: открываем поле этого предположения.
  const want = typeof route.query.fixFor === 'string' ? route.query.fixFor : null
  if (!want) return
  for (const m of messages.value) {
    const f = m.fields.find(x => x.hypothesis === want)
    if (f) {
      selectedId.value = m.id
      if (common.value.some(c => sameField(c, f))) headerOpen.value = true
      void openFix(f)
      return
    }
  }
})
watch(() => project.project?.path, () => { void load() })

// Пары по коду команды: запрос, затем ответ; остальные — в конце, как в описании.
const messages = computed(() => {
  const list = doc.value?.structure.messages ?? []
  const key = (m: MessageDef) => {
    const r = /^(request|response)_([0-9a-f]+)/.exec(m.id)
    return r ? [0, Number.parseInt(r[2]!, 16), r[1] === 'request' ? 0 : 1] : [1, 0, 0]
  }
  return [...list].sort((a, b) => {
    const [x, y] = [key(a), key(b)]
    return x[0]! - y[0]! || x[1]! - y[1]! || x[2]! - y[2]!
  })
})
const selected = computed(() => messages.value.find(m => m.id === selectedId.value) ?? null)

// Заголовок — поля, одинаковые у всех сообщений: показываем одной свёрнутой группой, а не в каждом.
const sameField = (a: FieldDef, b: FieldDef) => a.name === b.name && a.at === b.at && a.type === b.type
const common = computed(() => {
  const list = messages.value
  if (list.length < 2) return [] as FieldDef[]
  return list[0]!.fields.filter(f => list.every(m => m.fields.some(g => sameField(f, g))))
})
const headerOpen = ref(false)
const headerBytes = computed(() => {
  const ends = common.value.filter(f => typeof f.at === 'number').map(f => (f.at as number) + (SIZES[f.type] ?? (typeof f.len === 'number' ? f.len : 1)) - 1)
  return ends.length ? `0–${Math.max(...ends)}` : ''
})
const rows = computed(() => {
  const m = selected.value
  if (!m) return [] as { f: FieldDef, i: number, header: boolean }[]
  const all = m.fields.map((f, i) => ({ f, i, header: common.value.some(c => sameField(c, f)) }))
  return [...all.filter(r => r.header && headerOpen.value), ...all.filter(r => !r.header)]
})
const headerProblem = computed(() => common.value.some(f => checkOf(f).tone === 'bad'))
const hypothesisOf = (id?: string) => (id ? doc.value?.structure.hypotheses?.find(h => h.id === id) ?? null : null)

// «Запрос, команда 0x30 · сообщений в данных: 13» → заголовок и число.
function titleOf(m: MessageDef) {
  const d = m.description ?? ''
  const [head] = d.split(' · ')
  return head && !/^сообщений в данных/.test(head) ? head : m.id
}
function countOf(m: MessageDef) {
  const byMessage = (run.value?.head.summary.byMessage ?? {}) as Record<string, { messages?: number } | number>
  const fromRun = byMessage[m.id]
  if (typeof fromRun === 'number') return fromRun
  if (fromRun && typeof fromRun.messages === 'number') return fromRun.messages
  const n = /сообщений в данных: (\d+)/.exec(m.description ?? '')
  return n ? Number(n[1]) : null
}
const kindOf = (m: MessageDef) => (/^(Запрос|request)/i.test(titleOf(m)) ? 'request' : /^(Ответ|response)/i.test(titleOf(m)) ? 'response' : 'other')

const SIZES: Record<string, number> = { u8: 1, i8: 1, u16be: 2, u16le: 2, i16be: 2, i16le: 2, u32be: 4, u32le: 4, i32be: 4, i32le: 4, u64be: 8, u64le: 8, i64be: 8, i64le: 8, f32be: 4, f32le: 4, f64be: 8, f64le: 8 }
function bytesOf(f: FieldDef) {
  if (typeof f.at !== 'number') return String(f.at).startsWith('end') ? tr('protocol.fromEnd', { n: String(f.at).replace('end-', '') }) : tr('protocol.afterPrev')
  const size = SIZES[f.type] ?? (typeof f.len === 'number' ? f.len : null)
  if (!size) return `${f.at}…`
  return size === 1 ? String(f.at) : `${f.at}–${f.at + size - 1}`
}
// Подпись по ключу, если он есть в словаре; иначе — как в описании.
const known = (key: string): key is MessageKey => key in MESSAGES.ru
const typeLabel = (t: string) => (known(`type.${t}`) ? tr(`type.${t}` as MessageKey) : t)
const nameLabel = (f: FieldDef) => (known(`field.${f.name}`) ? tr(`field.${f.name}` as MessageKey) : f.name)
function meaningOf(f: FieldDef) {
  const h = hypothesisOf(f.hypothesis)
  const text = h?.statement ?? f.description ?? ''
  return text.replace(new RegExp(`^${f.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*—\\s*`), '')
}

function checkOf(f: FieldDef): { text: string, tone: 'ok' | 'bad' | 'muted' } {
  if (!f.hypothesis || !hypothesisOf(f.hypothesis)?.test) return { text: '', tone: 'muted' }
  const h = run.value?.hypotheses.get(f.hypothesis)
  if (!h) return { text: tr('protocol.check.none'), tone: 'muted' }
  if (h.verdict === 'refuted') return { text: tr('protocol.check.bad', { n: h.counterexamples }), tone: 'bad' }
  if (h.verdict === 'no_counterexample') return { text: tr('protocol.check.ok', { held: h.held, n: h.applicable }), tone: 'ok' }
  return { text: tr('protocol.check.untested'), tone: 'muted' }
}
const messageHasProblem = (m: MessageDef) => m.fields.some(f => checkOf(f).tone === 'bad')
const stale = computed(() => !!run.value && !!doc.value && run.value.head.stale)

function framingText(s: Structure) {
  const f = s.framing
  const parts: string[] = []
  if (f.kind === 'length_prefixed' && f.length) {
    const size = SIZES[f.length.type] ?? 1
    parts.push(tr('protocol.framing.length', { type: typeLabel(f.length.type), from: f.length.at, to: f.length.at + size - 1, adjust: f.length.adjust ?? 0 }))
  }
  else if (f.kind === 'fixed') parts.push(tr('protocol.framing.fixed', { size: f.size ?? 0 }))
  else if (f.kind === 'delimiter') parts.push(tr('protocol.framing.delimiter', { bytes: spaced(f.bytes ?? '') }))
  else if (f.kind === 'magic') parts.push(tr('protocol.framing.magic', { bytes: spaced(f.bytes ?? '') }))
  if (f.sync) parts.push(tr('protocol.framing.sync', { bytes: spaced(f.sync) }))
  return parts.join('; ')
}
const spaced = (hex: string) => hex.toUpperCase().replace(/(..)(?=.)/g, '$1 ')

// ——— Сохранение: структура уходит в движок, он проверяет и пишет YAML новой версией.
async function saveStructure(structure: Structure) {
  const res = unwrap(await api.PUT('/api/interpretation', { body: { structure: structure as unknown as Record<string, never>, baseRev: doc.value?.rev ?? 0 } }))
  workspace.log(tr('interp.save.logged', { rev: res.rev }))
  return res.rev
}

async function build() {
  confirmRebuild.value = false
  actionError.value = null
  notice.value = null
  busy.value = tr('protocol.building')
  try {
    const page = await collectConnections(data)
    // Описание строится по записям без дефектов захвата: дыры и повторы сбивают поиск сигнатуры и полей.
    // Записи с дефектами потом проверяются тем же описанием.
    const clean = page.items.filter(c => !project.issuesOf(c.source))
    const pool = clean.length ? clean : page.items
    const streams = pool.flatMap(c => c.streams.filter(s => s.dataBytes > 0).map(s => s.id))
    if (!streams.length) throw new Error(tr('protocol.noStreams'))
    const draft = unwrap(await api.POST('/api/analysis/draft', { body: { streams } }))
    draftSteps.value = draft.steps
    busy.value = tr('protocol.saving')
    await saveStructure(draft.structure as unknown as Structure)
    await Promise.all([load(), project.load()])
    selectedId.value = messages.value[0]?.id ?? null
  }
  catch (e) {
    actionError.value = e instanceof Error ? e.message : tr('protocol.buildFailed')
  }
  finally {
    busy.value = null
  }
}

// Новая запись: загрузить и проверить описанием только на ней — без правки описания (ТЗ: дополнительная запись).
const flow = useImportFlow()
const newInput = ref<HTMLInputElement | null>(null)
const lastNew = ref<string | null>(null)
const isExample = computed(() => (project.project?.name ?? '').startsWith('thermostand'))
const exampleNew = '04_new_observations.pcapng'
const exampleNewLoaded = computed(() => project.sources.some(x => x.name === exampleNew))
async function checkNew(file: File) {
  actionError.value = null
  notice.value = null
  busy.value = tr('protocol.newLoading', { name: file.name })
  try {
    await flow.importCaptures([file])
    await flow.settle()
    if (flow.errors.value.length) throw new Error(flow.errors.value.join('; '))
    const source = project.sources.find(x => x.name === file.name)
    if (!source) throw new Error(tr('protocol.newMissing'))
    lastNew.value = file.name
    await check({ sources: [source.sha256] })
  }
  catch (e) {
    actionError.value = e instanceof Error ? e.message : tr('protocol.saveFailed')
    busy.value = null
  }
}
function onNewFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void checkNew(file)
}
async function checkExampleNew() {
  const res = await fetch(`/examples/thermostand/${exampleNew}`)
  if (res.ok) await checkNew(new File([await res.blob()], exampleNew))
}

async function check(corpus?: { sources: string[] }) {
  actionError.value = null
  busy.value = tr('protocol.checking')
  try {
    const jobId = await data.startRun(corpus)
    if (jobId) {
      await new Promise<void>((resolve) => {
        jobs.track(jobId, tr('shell.run.label'), (job) => {
          workspace.log(tr('shell.run.state', { state: tr(job.state === 'succeeded' ? 'common.done' : 'common.error') }))
          resolve()
        })
      })
    }
    await Promise.all([load(), project.load()])
  }
  catch (e) {
    actionError.value = e instanceof Error ? e.message : tr('shell.run.failed')
  }
  finally {
    busy.value = null
  }
}

// ——— Правка поля.
const editing = ref<{ message: string, index: number, name: string, type: string, status: FieldDef['status'] } | null>(null)
const EDIT_TYPES = ['u8', 'i8', 'u16be', 'u16le', 'i16be', 'i16le', 'u32be', 'u32le', 'i32be', 'i32le', 'f32be', 'f32le', 'bcd', 'bytes', 'string']
function startEdit(m: MessageDef, index: number) {
  const f = m.fields[index]!
  editing.value = { message: m.id, index, name: f.name, type: f.type, status: f.status }
  fix.value = null
}
async function saveEdit() {
  const e = editing.value
  const s = doc.value?.structure
  if (!e || !s) return
  const next: Structure = structuredClone(toRaw(s))
  const m = next.messages.find(x => x.id === e.message)
  const f = m?.fields[e.index]
  if (!m || !f) return
  const renamed = f.name !== e.name.trim()
  // Одно и то же поле в запросе и ответе меняется вместе, если оно стоит на тех же байтах.
  for (const other of next.messages) {
    for (const g of other.fields) {
      if (g.name !== f.name || g.at !== f.at || g.type !== f.type) continue
      if (renamed) g.name = e.name.trim()
      g.type = e.type
      if (e.status === 'unknown') {
        g.status = 'unknown'
        delete g.hypothesis
      }
      else if (e.status === 'rule') {
        g.status = 'rule'
        delete g.hypothesis
      }
      else if (g.status !== 'hypothesis') {
        g.status = 'hypothesis'
        g.hypothesis = f.hypothesis ?? 'H1'
      }
    }
  }
  busy.value = tr('protocol.saving')
  actionError.value = null
  try {
    const rev = await saveStructure(next)
    editing.value = null
    notice.value = tr('protocol.edit.saved', { rev })
    await load()
  }
  catch (err) {
    actionError.value = err instanceof ApiError ? err.message : tr('protocol.saveFailed')
  }
  finally {
    busy.value = null
  }
}

// ——— Исправление опровергнутого поля: движок перебирает варианты на записях проекта.
const fix = ref<{ field: FieldDef, view: FixHintsView | null, state: 'loading' | 'ready' | 'error' } | null>(null)
async function openFix(f: FieldDef) {
  editing.value = null
  if (!f.hypothesis) return
  fix.value = { field: f, view: null, state: 'loading' }
  try {
    const view = await data.getFixHints(f.hypothesis)
    if (fix.value?.field === f) fix.value = { field: f, view, state: 'ready' }
  }
  catch {
    if (fix.value?.field === f) fix.value = { field: f, view: null, state: 'error' }
  }
}
async function applyFix(edit: FixHintsView['fixes'][number]['edit']) {
  const s = doc.value?.structure
  if (!s) return
  const next: Structure = structuredClone(toRaw(s))
  if (edit.field && edit.toType) {
    for (const m of next.messages) {
      if (edit.messages && !edit.messages.includes(m.id)) continue
      for (const g of m.fields) {
        if (g.name !== edit.field || (edit.fromType && g.type !== edit.fromType)) continue
        g.type = edit.toType
        if (edit.toAt !== undefined && edit.toAt !== null) g.at = edit.toAt
      }
    }
  }
  if (edit.test) {
    const h = next.hypotheses?.find(x => x.id === edit.hypothesis)
    if (h) h.test = edit.test
  }
  busy.value = tr('protocol.saving')
  actionError.value = null
  try {
    const rev = await saveStructure(next)
    notice.value = tr('protocol.edit.saved', { rev })
    fix.value = null
    await load()
    await check()
  }
  catch (err) {
    actionError.value = err instanceof Error ? err.message : tr('protocol.saveFailed')
    busy.value = null
  }
}

function downloadYaml() {
  if (doc.value) saveTextFile(`${project.project?.name ?? 'protocol'}.yaml`, doc.value.yaml, 'application/yaml')
}
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader :title="tr('protocol.title')" :subtitle="doc ? tr('protocol.subtitle', { rev: doc.rev, messages: messages.length }) : ''">
        <template v-if="doc">
          <button class="pl-btn h-7" type="button" :disabled="!!busy" @click="confirmRebuild = true">{{ tr('protocol.rebuild') }}</button>
          <button class="pl-btn h-7" type="button" @click="downloadYaml">
            <UIcon name="i-lucide-download" class="size-4" aria-hidden="true" /> {{ tr('protocol.yamlFile') }}
          </button>
          <button class="pl-btn h-7" type="button" :disabled="!!busy" :title="tr('protocol.newHint')" @click="newInput?.click()">
            <UIcon name="i-lucide-file-plus-2" class="size-4" aria-hidden="true" /> {{ tr('protocol.new') }}
          </button>
          <input ref="newInput" type="file" accept=".pcap,.pcapng,.cap" class="hidden" @change="onNewFile">
          <button class="pl-btn pl-btn-primary h-7" type="button" :disabled="!!busy" :title="tr('protocol.checkHint')" @click="check()">
            <UIcon name="i-lucide-circle-check-big" class="size-4" aria-hidden="true" /> {{ tr('protocol.check') }}
          </button>
        </template>
      </CommonPanelHeader>

      <div v-if="confirmRebuild" class="flex flex-wrap items-center gap-3 border-b border-pl-line bg-pl-panel px-4 py-2.5">
        <span>{{ tr('protocol.rebuildConfirm') }}</span>
        <button class="pl-btn pl-btn-primary h-7" type="button" @click="build">{{ tr('protocol.rebuildYes') }}</button>
        <button class="pl-btn h-7" type="button" @click="confirmRebuild = false">{{ tr('protocol.edit.cancel') }}</button>
      </div>
      <p v-if="busy" class="flex items-center gap-2 border-b border-pl-line px-4 py-2.5" aria-live="polite">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" /> {{ busy }}
      </p>
      <p v-if="actionError" class="border-b border-pl-line px-4 py-2.5 text-pl-st-violation" role="alert">{{ actionError }}</p>
      <p v-if="notice && !busy" class="border-b border-pl-line px-4 py-2.5 text-pl-st-rule" aria-live="polite">{{ notice }}</p>

      <div v-if="loading" class="p-6 text-pl-muted">{{ tr('common.loading') }}</div>
      <div v-else-if="loadError" class="p-6" role="alert">
        {{ loadError }} <button class="pl-btn ml-3" type="button" @click="load">{{ tr('common.retry') }}</button>
      </div>

      <div v-else-if="!doc" class="mx-auto max-w-[680px] px-6 py-16">
        <UIcon name="i-lucide-table-properties" class="size-8 text-pl-wine-text" aria-hidden="true" />
        <h2 class="mt-4 mb-2 font-display text-2xl font-semibold text-pl-fg-strong">{{ tr('protocol.empty.title') }}</h2>
        <p class="mb-6 leading-relaxed text-pl-muted">{{ tr('protocol.empty.lead') }}</p>
        <p v-if="!project.sources.length" class="text-pl-fg">{{ tr('protocol.empty.noSources') }}</p>
        <button v-else class="pl-btn pl-btn-primary h-9 px-4 text-sm" type="button" :disabled="!!busy" @click="build">{{ tr('protocol.build') }}</button>
      </div>

      <div v-else class="flex flex-col gap-4 p-4">
        <div class="flex items-start gap-3 rounded-md border border-pl-line bg-pl-panel px-4 py-3">
          <UIcon name="i-lucide-brackets" class="mt-0.5 size-4 shrink-0 text-pl-muted" aria-hidden="true" />
          <div>
            <div class="pl-caption mb-0.5">{{ tr('protocol.framing') }}</div>
            <div class="text-pl-fg-strong">{{ framingText(doc.structure) }}</div>
          </div>
          <div v-if="run" class="ml-auto shrink-0 text-right text-pl-muted">
            {{ tr('protocol.lastCheck', { messages: run.head.summary.messages, unknown: run.head.summary.unknownBytes }) }}
          </div>
        </div>
        <div v-if="isExample && !exampleNewLoaded && !busy" class="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-pl-line px-4 py-2.5">
          <span class="text-pl-muted">{{ tr('protocol.exampleNew') }}</span>
          <button class="pl-btn h-7" type="button" @click="checkExampleNew">{{ tr('protocol.exampleNewButton') }}</button>
        </div>
        <div v-if="lastNew && run && !busy" class="flex flex-wrap items-center gap-3 rounded-md border px-4 py-2.5" :class="run.head.summary.counterexamples ? 'border-pl-st-violation' : 'border-pl-st-rule'" aria-live="polite">
          <UIcon :name="run.head.summary.counterexamples ? 'i-lucide-circle-alert' : 'i-lucide-circle-check'" class="size-5" :class="run.head.summary.counterexamples ? 'text-pl-st-violation' : 'text-pl-st-rule'" aria-hidden="true" />
          <span class="text-pl-fg-strong">{{ tr('protocol.newResult', { name: lastNew, n: run.head.summary.messages, ok: run.head.summary.counts.matched ?? 0, bad: run.head.summary.counterexamples }) }}</span>
          <NuxtLink :to="{ path: '/verify', query: { run: run.head.id } }" class="text-pl-wine-text hover:underline">{{ tr('protocol.newDetails') }}</NuxtLink>
        </div>
        <p v-if="stale" class="flex items-center gap-2 text-pl-st-hypothesis">
          <UIcon name="i-lucide-rotate-ccw" class="size-4" aria-hidden="true" /> {{ tr('protocol.check.stale') }}
        </p>

        <div class="grid min-h-0 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <nav :aria-label="tr('protocol.commands')">
            <div class="pl-caption mb-2">{{ tr('protocol.commands') }}</div>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
              <li v-for="m in messages" :key="m.id">
                <button
                  type="button"
                  class="flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left"
                  :class="m.id === selectedId ? 'border-pl-wine-text bg-pl-wine-soft' : 'border-transparent hover:bg-pl-raise'"
                  :aria-current="m.id === selectedId ? 'true' : undefined"
                  @click="selectedId = m.id; editing = null; fix = null"
                >
                  <UIcon :name="kindOf(m) === 'request' ? 'i-lucide-arrow-right' : kindOf(m) === 'response' ? 'i-lucide-arrow-left' : 'i-lucide-minus'" class="mt-0.5 size-4 shrink-0 text-pl-muted" aria-hidden="true" />
                  <span class="min-w-0 flex-1">
                    <span class="block font-semibold text-pl-fg-strong">{{ titleOf(m) }}</span>
                    <span v-if="countOf(m) !== null" class="block text-xs text-pl-muted">{{ tr('protocol.count', { n: countOf(m)! }) }}</span>
                  </span>
                  <UIcon v-if="messageHasProblem(m)" name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0 text-pl-st-violation" :aria-label="tr('protocol.problems')" />
                </button>
              </li>
            </ul>
          </nav>

          <div v-if="selected" class="min-w-0">
            <div class="mb-2 flex items-baseline gap-3">
              <h2 class="m-0 font-display text-lg font-semibold text-pl-fg-strong">{{ titleOf(selected) }}</h2>
              <span class="font-mono text-xs text-pl-muted">{{ selected.id }}</span>
            </div>
            <table class="pl-table w-full table-fixed">
              <thead>
                <tr>
                  <th class="w-[64px]">{{ tr('protocol.col.bytes') }}</th>
                  <th class="w-[160px]">{{ tr('protocol.col.name') }}</th>
                  <th class="w-[190px]">{{ tr('protocol.col.type') }}</th>
                  <th>{{ tr('protocol.col.meaning') }}</th>
                  <th class="w-[170px]">{{ tr('protocol.col.check') }}</th>
                  <th class="w-[150px]">{{ tr('protocol.col.status') }}</th>
                  <th class="w-[90px]" />
                </tr>
              </thead>
              <tbody>
                <tr v-if="common.length" class="cursor-pointer" @click="headerOpen = !headerOpen">
                  <td colspan="7" class="text-pl-muted">
                    <button type="button" class="flex items-center gap-2 hover:text-pl-fg-strong" :aria-expanded="headerOpen">
                      <UIcon :name="headerOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" aria-hidden="true" />
                      {{ tr('protocol.header', { bytes: headerBytes, n: common.length }) }}
                      <UIcon v-if="headerProblem" name="i-lucide-circle-alert" class="size-4 text-pl-st-violation" :aria-label="tr('protocol.problems')" />
                    </button>
                  </td>
                </tr>
                <tr v-for="{ f, i, header } in rows" :key="`${f.name}-${i}`" :class="header && 'bg-pl-panel'" :aria-selected="editing?.index === i || fix?.field === f">
                  <td class="font-mono whitespace-nowrap">{{ bytesOf(f) }}</td>
                  <td>
                    <span class="font-semibold text-pl-fg-strong">{{ nameLabel(f) }}</span>
                    <span v-if="nameLabel(f) !== f.name" class="block font-mono text-xs text-pl-muted">{{ f.name }}</span>
                  </td>
                  <td class="text-pl-fg">{{ typeLabel(f.type) }}</td>
                  <td class="text-pl-fg">{{ meaningOf(f) || '—' }}</td>
                  <td>
                    <span v-if="checkOf(f).tone === 'bad'" class="text-pl-st-violation">
                      {{ checkOf(f).text }} ·
                      <button class="underline underline-offset-2 hover:text-pl-fg-strong" type="button" @click="openFix(f)">{{ tr('protocol.fix.title') }}</button>
                    </span>
                    <span v-else :class="checkOf(f).tone === 'ok' ? 'text-pl-st-rule' : 'text-pl-muted'">{{ checkOf(f).text || '—' }}</span>
                  </td>
                  <td><CommonStatusBadge :status="f.status" :label="tr(`protocol.status.${f.status}` as MessageKey)" /></td>
                  <td><button class="pl-btn pl-btn-ghost h-6" type="button" @click="startEdit(selected, i)">{{ tr('protocol.edit') }}</button></td>
                </tr>
                <tr v-if="!rows.some(r => !r.header)">
                  <td colspan="7" class="text-pl-muted">{{ tr('protocol.noOwnFields') }}</td>
                </tr>
              </tbody>
            </table>

            <form v-if="editing" class="mt-4 flex flex-col gap-3 rounded-md border border-pl-line bg-pl-panel px-4 py-3.5" @submit.prevent="saveEdit">
              <div class="font-semibold text-pl-fg-strong">{{ tr('protocol.edit.title', { name: editing.name }) }}</div>
              <div class="flex flex-wrap gap-4">
                <label class="flex flex-col gap-1">
                  <span class="pl-caption">{{ tr('protocol.edit.name') }}</span>
                  <input v-model="editing.name" class="h-8 w-56 rounded border border-pl-line bg-pl-raise px-2.5 font-mono text-pl-fg-strong outline-none focus:border-pl-wine-text" spellcheck="false">
                </label>
                <label class="flex flex-col gap-1">
                  <span class="pl-caption">{{ tr('protocol.edit.type') }}</span>
                  <select v-model="editing.type" class="h-8 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg">
                    <option v-for="t in EDIT_TYPES" :key="t" :value="t">{{ typeLabel(t) }}</option>
                  </select>
                </label>
                <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
                  <legend class="pl-caption mb-1">{{ tr('protocol.edit.status') }}</legend>
                  <span class="pl-seg" role="radiogroup">
                    <button v-for="s in (['rule', 'hypothesis', 'unknown'] as const)" :key="s" type="button" role="radio" :aria-checked="editing.status === s" @click="editing.status = s">{{ tr(`protocol.status.${s}`) }}</button>
                  </span>
                </fieldset>
              </div>
              <p class="m-0 text-xs text-pl-muted">{{ tr('protocol.edit.statusHint') }}</p>
              <div class="flex gap-2">
                <button class="pl-btn pl-btn-primary h-8" type="submit" :disabled="!!busy">{{ tr('protocol.edit.save') }}</button>
                <button class="pl-btn h-8" type="button" @click="editing = null">{{ tr('protocol.edit.cancel') }}</button>
              </div>
            </form>

            <div v-if="fix" class="mt-4 flex flex-col gap-2.5 rounded-md border border-pl-st-violation bg-pl-panel px-4 py-3.5" aria-live="polite">
              <div class="font-semibold text-pl-fg-strong">{{ tr('protocol.fix.title') }} · {{ nameLabel(fix.field) }}</div>
              <p v-if="fix.state === 'loading'" class="m-0 text-pl-muted">{{ tr('protocol.fix.loading') }}</p>
              <p v-else-if="fix.state === 'error' || !fix.view?.fixes.length" class="m-0 text-pl-muted">{{ tr('protocol.fix.none') }}</p>
              <template v-else>
                <div v-for="(o, k) in fix.view!.fixes.slice(0, 3)" :key="k" class="flex flex-wrap items-center gap-3">
                  <span class="text-pl-fg-strong">{{ o.summary }}</span>
                  <span class="text-pl-muted">{{ o.effect }}</span>
                  <button class="pl-btn pl-btn-primary h-7" type="button" :disabled="!!busy" @click="applyFix(o.edit)">{{ tr('protocol.fix.apply') }}</button>
                </div>
              </template>
            </div>
          </div>
        </div>

        <details v-if="draftSteps.length" class="rounded-md border border-pl-line bg-pl-panel px-4 py-3">
          <summary class="cursor-pointer font-semibold text-pl-fg-strong">{{ tr('protocol.howFound') }}</summary>
          <dl class="mt-2.5 mb-0 grid gap-x-4 gap-y-1.5 sm:grid-cols-[200px_minmax(0,1fr)]">
            <template v-for="s in draftSteps" :key="s.title">
              <dt class="text-pl-muted">{{ s.title }}</dt>
              <dd class="m-0 text-pl-fg">{{ s.detail }}</dd>
            </template>
          </dl>
        </details>
      </div>
    </section>
  </div>
</template>
