<script setup lang="ts">
import type { DraftView, FixHintsView, InterpretationView } from '~/data/views'
import { STATUS } from '~/utils/status'
import type { FieldHints } from '~/api/types'
import { parseForm, setFieldAttr } from '~/utils/interp-form'
import { applyFixEdit } from '~/utils/interp-fix'
import { tokenizeYamlLine } from '~/utils/yaml-tokens'

const data = useData()
const workspace = useWorkspaceStore()
const project = useProjectStore()
const { data: view, error, refresh, pending } = await useAsyncData('interpretation', () => data.getInterpretation())
const { data: streams } = await useAsyncData('interp-streams', async () => {
  const page = await data.listConnections({ limit: 200 })
  return page.items.flatMap(c => c.streams.filter(s => s.dataBytes > 0).map(s => ({ id: s.id, label: `${c.id} ${s.direction === 'a_to_b' ? 'a→b' : 'b→a'} · ${s.dataBytes} байт` })))
}, { default: () => [] as { id: string, label: string }[] })
const { data: revisions, refresh: refreshRevisions } = await useAsyncData('interp-revisions', () => data.getInterpretationRevisions(), { default: () => [] as number[] })

const TEMPLATE = `format: protoledger/interpretation@1
scope:
  direction: any
framing:
  kind: length_prefixed
  length: { at: 0, type: u16be, adjust: 0 }
  status: hypothesis
messages: []
`

const mode = ref<'yaml' | 'form'>('yaml')
const text = ref('')
const original = ref('')
const basedOn = ref<number | null>(null)
const stream = ref<string | null>(null)
const result = ref<Pick<InterpretationView, 'tree' | 'preview' | 'violations'> | null>(null)
const problem = ref<string | null>(null)
const previewing = ref(false)
const saving = ref(false)
const notice = ref<string | null>(null)
const selectedLine = ref<number | null>(null)

watch(view, (v) => {
  if (!v) return
  original.value = v.yaml.map(l => l.text).join('\n')
  text.value = v.rev ? original.value : TEMPLATE
  basedOn.value = v.rev
  stream.value = v.stream
  result.value = v.rev ? { tree: v.tree, preview: v.preview, violations: v.violations } : null
  selectedLine.value = v.selectedLine || null
}, { immediate: true })

const dirty = computed(() => !!view.value && text.value !== original.value)
const nextRev = computed(() => (revisions.value[0] ?? view.value?.rev ?? 0) + 1)

// Строка ошибки из ответа движка («line 3 column 5: …») — подсвечиваем её в редакторе.
const problemLine = computed(() => {
  const m = problem.value?.match(/line (\d+)/)
  return m ? Number(m[1]) : null
})

// Нарушение → строка поля: тип сообщения и имя поля; для гипотезы — поля с `hypothesis: Hn`.
// Итоги прогона относятся к сохранённой ревизии — показываем их, пока текст не меняли.
const lineIssues = computed(() => {
  const map = new Map<number, string[]>()
  const put = (line: number, msg: string) => map.set(line, [...(map.get(line) ?? []), msg])
  const form = parseForm(text.value)
  const name = (v: string | undefined) => (v ?? '').replace(/^"(.*)"$/, '$1')
  for (const v of result.value?.violations ?? []) {
    for (const m of form) {
      if (v.messageId && m.id !== v.messageId) continue
      for (const f of m.fields) {
        const n = name(f.attrs.name)
        const hit = v.kind === 'hypothesis' ? name(f.attrs.hypothesis) === v.field : n === v.field || v.field.endsWith(`.${n}`)
        if (hit) put(f.line, `${v.detail}${v.count > 1 ? ` · в ${v.count} сообщ.` : ''}`)
      }
    }
  }
  if (!dirty.value) {
    for (const h of view.value?.runIssues ?? []) {
      for (const m of form) for (const f of m.fields) if (name(f.attrs.hypothesis) === h.id) put(f.line, `${h.id}: ${h.label}`)
    }
  }
  return map
})
const issueList = computed(() => [...lineIssues.value].sort((a, b) => a[0] - b[0]))

// Быстрое исправление: движок перебирает типы той же ширины и предлагает тот, где противоречий меньше.
const unq = (v: string | undefined) => (v ?? '').replace(/^"(.*)"$/, '$1')
const fieldAt = computed(() => {
  for (const m of parseForm(text.value)) {
    for (const f of m.fields) {
      if (f.line === selectedLine.value) return { line: f.line, message: m.id, name: `${f.group ? `${f.group}.` : ''}${unq(f.attrs.name)}`, type: unq(f.attrs.type) }
    }
  }
  return null
})
const hint = ref<FieldHints | null>(null)
const hintState = ref<'idle' | 'loading' | 'error'>('idle')
watch([fieldAt, () => issueList.value.length], async ([f]) => {
  hint.value = null
  hintState.value = 'idle'
  if (!f || !lineIssues.value.has(f.line) || !/^[ui]\d/.test(f.type)) return
  hintState.value = 'loading'
  try {
    hint.value = await data.getFieldHints(f.message, f.name, dirty.value ? text.value : undefined)
    hintState.value = 'idle'
  }
  catch {
    hintState.value = 'error'
  }
})
const hintCurrent = computed(() => hint.value?.candidates.find(c => c.current) ?? null)
const hintBest = computed(() => hint.value?.candidates.find(c => c.type === hint.value?.suggested) ?? null)

function applyHint() {
  const h = hint.value
  if (!h?.suggested) return
  let t = text.value
  // Одно поле в запросе и ответе меняется вместе: строки не сдвигаются, номера из разбора остаются верными.
  for (const m of parseForm(t)) {
    if (!h.messages.includes(m.id)) continue
    for (const f of m.fields) {
      if (`${f.group ? `${f.group}.` : ''}${unq(f.attrs.name)}` === h.field && unq(f.attrs.type) === h.currentType) t = setFieldAttr(t, f.line, 'type', h.suggested)
    }
  }
  workspace.log(`Быстрое исправление: ${h.field} ${h.currentType} → ${h.suggested} (${h.messages.join(', ')})`)
  text.value = t
}

// Переход к строке из списка нарушений: выделить и прокрутить редактор (строка — 21px).
const editorScroll = ref<HTMLElement | null>(null)
function goToLine(line: number) {
  selectedLine.value = line
  mode.value = 'yaml'
  void nextTick(() => editorScroll.value?.scrollTo({ top: Math.max(0, (line - 4) * 21) }))
}

const lines = computed(() => {
  const marks = view.value?.yaml ?? []
  return text.value.split('\n').map((t, i) => ({
    n: i + 1,
    tokens: tokenizeYamlLine(safeText(t)),
    // Значки статусов — от последнего разбора, только пока строка не менялась.
    mark: lineIssues.value.has(i + 1) ? 'violation' as const : marks[i]?.text === t ? marks[i]?.mark : undefined,
  }))
})

let timer: ReturnType<typeof setTimeout> | undefined
function schedulePreview() {
  clearTimeout(timer)
  timer = setTimeout(runPreview, 700)
}

async function runPreview() {
  if (!stream.value) return
  previewing.value = true
  try {
    result.value = await data.previewInterpretation(stream.value, dirty.value || !view.value?.rev ? text.value : undefined)
    problem.value = null
  }
  catch (e) {
    problem.value = e instanceof Error ? e.message : 'Не удалось применить интерпретацию'
  }
  finally {
    previewing.value = false
  }
}

watch(text, () => {
  notice.value = null
  schedulePreview()
})
watch(stream, () => runPreview())
onBeforeUnmount(() => clearTimeout(timer))
// Новая интерпретация: шаблон разбираем сразу, чтобы было видно, что он даёт на потоке.
onMounted(() => {
  if (view.value && !view.value.rev) void runPreview()
})

async function save() {
  if (saving.value || (!dirty.value && view.value?.rev)) return
  saving.value = true
  notice.value = null
  try {
    const res = await data.saveInterpretation(text.value)
    problem.value = null
    if (res.created) {
      workspace.log(`Сохранена ревизия интерпретации rev ${res.rev}`)
      await Promise.all([refresh(), refreshRevisions(), project.load()])
      notice.value = `Сохранена ревизия ${res.rev}`
    }
    else {
      original.value = text.value
      notice.value = `Смысл не изменился — остаётся ревизия ${res.rev}`
    }
  }
  catch (e) {
    problem.value = e instanceof Error ? e.message : 'Не удалось сохранить интерпретацию'
  }
  finally {
    saving.value = false
  }
}

async function loadRevision(rev: number) {
  try {
    text.value = await data.getInterpretationRevision(rev)
    basedOn.value = rev
  }
  catch (e) {
    problem.value = e instanceof Error ? e.message : 'Не удалось открыть ревизию'
  }
}

function applyFix() {
  const fix = view.value?.quickFix
  if (!fix) return
  const rows = text.value.split('\n')
  const i = fix.line - 1
  if (rows[i] === undefined || !rows[i].includes(fix.from)) return
  rows[i] = rows[i].replace(fix.from, fix.to)
  text.value = rows.join('\n')
  selectedLine.value = fix.line
}

function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void save()
  }
}

function caretLine(e: Event) {
  const el = e.target as HTMLTextAreaElement
  selectedLine.value = el.value.slice(0, el.selectionStart).split('\n').length
}

const subtitle = computed(() => {
  if (!view.value?.rev) return dirty.value || text.value ? 'новая · ещё не сохранена' : 'ещё не создана'
  if (dirty.value) return basedOn.value && basedOn.value !== view.value.rev ? `изменено на основе rev ${basedOn.value}` : 'изменено · не сохранено в ревизию'
  return `ревизия ${view.value.rev}`
})

// Черновик описания: движок собирает текст из подсказок, в редактор он попадает несохранённым.
const route = useRoute()
const draftState = ref<'idle' | 'loading' | 'error'>('idle')
const draftView = ref<DraftView | null>(null)
const draftError = ref<string | null>(null)
const draftStreams = ref<string[]>([])
const confirmReplace = ref(false)
watch(streams, (list) => {
  if (!draftStreams.value.length) draftStreams.value = list.map(s => s.id)
}, { immediate: true })

async function makeDraft() {
  if (draftState.value === 'loading') return
  if (!draftStreams.value.length) {
    draftState.value = 'error'
    draftError.value = 'Выберите хотя бы один поток.'
    return
  }
  draftState.value = 'loading'
  draftError.value = null
  confirmReplace.value = false
  try {
    draftView.value = await data.getDraft(draftStreams.value)
    draftState.value = 'idle'
    workspace.log(`Черновик описания по ${draftStreams.value.length} потокам`)
  }
  catch (e) {
    draftState.value = 'error'
    draftError.value = e instanceof Error ? e.message : 'Не удалось собрать черновик'
  }
}

function useDraft() {
  const d = draftView.value
  if (!d) return
  // Стартовый шаблон — не правки исследователя: заменяем его без вопроса.
  const edited = text.value !== (view.value?.rev ? original.value : TEMPLATE)
  if (edited && !confirmReplace.value) {
    confirmReplace.value = true
    return
  }
  text.value = d.yaml
  basedOn.value = null
  mode.value = 'yaml'
  confirmReplace.value = false
  notice.value = 'Черновик в редакторе: проверьте предпросмотр и сохраните ревизию.'
}

onMounted(() => {
  if (route.query.draft === '1') void makeDraft()
  if (typeof route.query.fixFor === 'string') void loadFixes(route.query.fixFor)
})

// «Как исправить» гипотезу описания: движок перебирает знак, порядок байтов, ширину и масштаб;
// правка вносится в текст несохранённой — проверка и сохранение за исследователем.
const fixes = ref<FixHintsView | null>(null)
const fixState = ref<'idle' | 'loading' | 'error'>('idle')
const fixError = ref<string | null>(null)

async function loadFixes(hypothesis: string) {
  fixState.value = 'loading'
  fixError.value = null
  try {
    fixes.value = await data.getFixHints(hypothesis, dirty.value ? text.value : undefined)
    fixState.value = 'idle'
  }
  catch (e) {
    fixState.value = 'error'
    fixError.value = e instanceof Error ? e.message : 'Подсказка исправления недоступна'
  }
}

function applySuggestedFix(index: number) {
  const fix = fixes.value?.fixes[index]
  if (!fix) return
  const res = applyFixEdit(text.value, fix.edit)
  if (!res.changed) {
    problem.value = `Не нашла в тексте место для правки «${fix.summary}».`
    return
  }
  text.value = res.text
  mode.value = 'yaml'
  workspace.log(`Исправление ${fixes.value!.hypothesis}: ${fix.summary}`)
  notice.value = `Внесено: ${fix.summary}. Проверьте предпросмотр, сохраните ревизию и перепроверьте.`
}

const cap = 'pl-caption m-0 px-3 pt-3.5 pb-2'
const TOKEN: Record<string, string> = {
  key: 'text-pl-st-ambiguous',
  string: 'text-pl-st-rule',
  number: 'text-pl-st-hypothesis',
  comment: 'text-pl-muted italic',
  punct: 'text-pl-fg',
  plain: '',
}
</script>

<template>
  <div class="flex h-full">
    <ShellSidePanel id="interp-tree" title="Структура" :subtitle="view?.rev ? `rev ${view.rev}` : ''" :width="260">
      <ul v-if="result" class="pl-scroll m-0 flex-1 list-none px-0 py-2">
        <InterpTreeNode v-for="(n, k) in result.tree" :key="k" :node="n" :depth="0" />
      </ul>
      <p v-else class="m-0 p-3 text-pl-muted">Структура появится после первого разбора.</p>
    </ShellSidePanel>

    <section class="flex min-w-0 flex-1 flex-col">
      <CommonPanelHeader title="interpretation.yaml" :subtitle="subtitle">
        <select
          v-if="revisions.length"
          class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg"
          aria-label="Открыть ревизию"
          :value="''"
          @change="loadRevision(Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>ревизии…</option>
          <option v-for="r in revisions" :key="r" :value="r">rev {{ r }}{{ r === view?.rev ? ' · текущая' : '' }}</option>
        </select>
        <button class="pl-btn h-7" type="button" :disabled="draftState === 'loading'" title="Собрать описание из подсказок движка: границы, типы, поля, связи с журналом" @click="makeDraft">
          <UIcon name="i-lucide-wand-sparkles" class="size-4" aria-hidden="true" />
          {{ draftState === 'loading' ? 'Собираю черновик…' : 'Черновик описания' }}
        </button>
        <div class="pl-seg" role="radiogroup" aria-label="Вид">
          <button type="button" role="radio" :aria-checked="mode === 'yaml'" @click="mode = 'yaml'">YAML</button>
          <button type="button" role="radio" :aria-checked="mode === 'form'" @click="mode = 'form'">Форма</button>
        </div>
        <button class="pl-btn pl-btn-primary h-7" type="button" :disabled="saving || (!dirty && !!view?.rev)" title="Сохранить ревизией (Ctrl+S)" @click="save">
          {{ saving ? 'Сохраняю…' : `Сохранить rev ${nextRev}` }}
        </button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <div v-if="mode === 'yaml'" ref="editorScroll" class="pl-scroll flex-1 py-2 font-mono text-[12.5px] leading-[21px]">
          <div class="flex min-w-max">
            <div class="flex-none select-none" aria-hidden="true">
              <div v-for="l in lines" :key="l.n" class="flex h-[21px]" :class="[l.n === selectedLine && 'bg-pl-raise', l.n === problemLine && 'bg-pl-st-violation/15']">
                <span class="grid w-[22px] place-items-center">
                  <UIcon v-if="l.n === problemLine" :name="STATUS.violation.icon" class="size-3" :style="{ color: STATUS.violation.color }" />
                  <UIcon v-else-if="l.mark" :name="STATUS[l.mark].icon" class="size-3" :style="{ color: STATUS[l.mark].color }" />
                </span>
                <span class="w-[34px] pr-3.5 text-right text-pl-muted">{{ l.n }}</span>
              </div>
            </div>
            <!-- Подсветка рисуется под прозрачным полем ввода: выделение и курсор — у textarea. -->
            <div class="relative min-w-0 flex-1">
              <pre class="pointer-events-none m-0 pr-6 font-mono whitespace-pre" aria-hidden="true"><div v-for="l in lines" :key="l.n" class="h-[21px]" :class="[l.n === selectedLine && 'bg-pl-raise', l.n === problemLine && 'bg-pl-st-violation/15']"><span v-for="(t, j) in l.tokens" :key="j" :class="TOKEN[t.kind]">{{ t.text }}</span>&#8203;</div></pre>
              <textarea
                id="interp-yaml"
                v-model="text"
                class="absolute inset-0 m-0 resize-none overflow-hidden border-0 bg-transparent p-0 pr-6 font-mono text-[12.5px] leading-[21px] whitespace-pre text-transparent caret-pl-fg-strong outline-none selection:bg-pl-wine-soft"
                wrap="off"
                spellcheck="false"
                autocomplete="off"
                aria-label="Текст интерпретации, YAML"
                @keydown="onKey"
                @click="caretLine"
                @keyup="caretLine"
              />
            </div>
          </div>
        </div>
        <InterpFormView v-else v-model="text" :selected-line="selectedLine" @select="selectedLine = $event" />
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="selectedLine ? `Строка ${selectedLine}` : 'Предпросмотр'">
      <div v-if="view" class="pl-scroll flex-1">
        <div v-if="problem" class="m-3 border border-pl-st-violation/60 p-2.5" role="alert">
          <CommonStatusBadge status="violation" label="ошибка в тексте" />
          <pre class="mt-2 mb-0 font-mono text-[11.5px] whitespace-pre-wrap text-pl-fg">{{ problem }}</pre>
        </div>
        <p v-if="notice" class="m-3 text-pl-st-rule" aria-live="polite">{{ notice }}</p>

        <template v-if="fixState !== 'idle' || fixes">
          <h3 :class="cap">Как исправить {{ fixes?.hypothesis ?? route.query.fixFor }}</h3>
          <div class="flex flex-col gap-2 px-3 pb-2">
            <p v-if="fixState === 'loading'" class="m-0 text-pl-muted" aria-live="polite">Перебираю знак, порядок байтов, ширину поля и масштаб…</p>
            <p v-else-if="fixState === 'error'" class="m-0 text-pl-muted">{{ safeText(fixError) }}</p>
            <template v-else-if="fixes">
              <p class="m-0 font-mono text-xs break-all text-pl-muted">{{ safeText(fixes.test) }}</p>
              <p class="m-0 text-pl-muted">Сейчас: {{ fixes.before }}.</p>
              <p v-if="!fixes.fixes.length" class="m-0 text-pl-muted">Правка знака, порядка байтов, ширины или масштаба контрпримеры не убирает — дело в другом.</p>
              <div v-for="(f, i) in fixes.fixes" :key="i" class="border border-pl-line p-2.5">
                <div class="flex items-start justify-between gap-2">
                  <b class="font-semibold text-pl-fg-strong">{{ safeText(f.summary) }}</b>
                  <CommonStatusBadge :status="f.after === 0 ? 'rule' : 'hypothesis'" :label="f.after === 0 ? 'контрпримеров нет' : `осталось ${f.after}`" />
                </div>
                <p class="mt-1 mb-2 text-pl-muted">{{ safeText(f.effect) }}</p>
                <button class="pl-btn" type="button" @click="applySuggestedFix(i)">Применить</button>
              </div>
            </template>
          </div>
        </template>

        <template v-if="draftState !== 'idle' || draftView">
          <h3 :class="cap">Черновик описания</h3>
          <div class="flex flex-col gap-2 px-3 pb-2">
            <details class="text-pl-muted">
              <summary class="cursor-pointer">Потоки: {{ draftStreams.length }} из {{ streams.length }}</summary>
              <div class="mt-1 flex gap-3">
                <button class="text-pl-wine-text hover:underline" type="button" @click="draftStreams = streams.map(s => s.id)">все</button>
                <button class="text-pl-wine-text hover:underline" type="button" @click="draftStreams = []">снять все</button>
              </div>
              <label v-for="s in streams" :key="s.id" class="flex items-center gap-2 py-0.5 text-pl-fg">
                <input v-model="draftStreams" type="checkbox" :value="s.id">
                {{ safeText(s.label) }}
              </label>
            </details>
            <p v-if="draftState === 'loading'" class="m-0 text-pl-muted" aria-live="polite">Движок ищет границы, типы, поля, связи с журналом и контрольную сумму…</p>
            <p v-else-if="draftState === 'error'" class="m-0 text-pl-st-violation" role="alert">{{ draftError }}</p>
            <template v-if="draftView && draftState !== 'loading'">
              <dl class="pl-dl p-0">
                <template v-for="r in draftView.summary" :key="r.label">
                  <dt>{{ r.label }}</dt><dd>{{ r.value }}</dd>
                </template>
              </dl>
              <p v-if="draftView.incomplete" class="m-0 text-pl-st-hypothesis">Часть шагов не успела выполниться — черновик неполный.</p>
              <ol class="m-0 flex list-decimal flex-col gap-1 pl-5">
                <li v-for="(st, i) in draftView.steps" :key="i">
                  <b class="font-semibold text-pl-fg-strong">{{ safeText(st.title) }}</b>
                  <span class="text-pl-muted"> — {{ safeText(st.detail) }}</span>
                </li>
              </ol>
              <p class="m-0 text-pl-muted">Каждое поле черновика — гипотеза с основанием. Это подсказки по данным: проверка и сохранение — за вами.</p>
              <div class="flex flex-wrap gap-2">
                <button class="pl-btn pl-btn-primary" type="button" @click="useDraft">{{ confirmReplace ? 'Заменить текст в редакторе' : 'Подставить в редактор' }}</button>
                <button class="pl-btn" type="button" @click="makeDraft">Пересобрать</button>
              </div>
              <p v-if="confirmReplace" class="m-0 text-pl-st-hypothesis" role="alert">В редакторе несохранённые правки — они заменятся черновиком.</p>
            </template>
          </div>
        </template>

        <h3 :class="cap">Предпросмотр</h3>
        <div class="px-3">
          <select v-model="stream" class="h-7 w-full rounded border border-pl-line bg-pl-raise px-2 text-pl-fg" aria-label="Поток для предпросмотра">
            <option v-if="!streams.length" :value="stream">{{ result?.preview.stream ?? 'нет потоков' }}</option>
            <option v-for="s in streams" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </div>
        <dl v-if="result" class="pl-dl" :class="previewing && 'opacity-60'" aria-live="polite">
          <template v-for="r in result.preview.rows" :key="r.label">
            <dt>{{ r.label }}</dt><dd>{{ r.value }}</dd>
          </template>
        </dl>
        <p v-else class="m-0 px-3 py-2 text-pl-muted">Начните с шаблона слева: разбор обновляется при правке.</p>

        <template v-if="selectedLine && lineIssues.get(selectedLine)">
          <h3 :class="cap">Поле в строке {{ selectedLine }}</h3>
          <ul class="m-0 flex list-none flex-col gap-1.5 px-3 pb-2">
            <li v-for="(msg, i) in lineIssues.get(selectedLine)" :key="i" class="flex items-start gap-1.5">
              <UIcon :name="STATUS.violation.icon" class="mt-1 size-3 flex-none" :style="{ color: STATUS.violation.color }" aria-hidden="true" />
              <span>{{ safeText(msg) }}</span>
            </li>
          </ul>
        </template>
        <template v-if="hintState !== 'idle' || hint">
          <h3 :class="cap">Быстрое исправление</h3>
          <div class="flex flex-col gap-2 px-3 pb-2">
            <p v-if="hintState === 'loading'" class="m-0 text-pl-muted" aria-live="polite">Подбираю тип по значениям в записях…</p>
            <p v-else-if="hintState === 'error'" class="m-0 text-pl-muted">Подсказка для этого поля недоступна.</p>
            <template v-else-if="hint && hint.suggested && hintCurrent && hintBest">
              <button class="pl-btn pl-btn-primary self-start" type="button" @click="applyHint">Тип {{ hint.currentType }} → {{ hint.suggested }}</button>
              <p class="m-0 text-pl-muted">
                Контрпримеров {{ hintCurrent.counterexamples }} → {{ hintBest.counterexamples }}; значения от {{ hintBest.min }} до {{ hintBest.max }}<template v-if="hintBest.negative">, отрицательных {{ hintBest.negative }}</template>.
                Меняется в: {{ hint.messages.join(', ') }}. Это подсказка по данным — решение и сохранение ревизии за вами.
              </p>
            </template>
            <p v-else-if="hint" class="m-0 text-pl-muted">Тип той же ширины противоречий не убирает — дело не в знаке или порядке байтов.</p>
          </div>
        </template>

        <template v-if="issueList.length">
          <h3 :class="cap">Нарушения · {{ issueList.length }} {{ issueList.length === 1 ? 'строка' : 'строк' }}</h3>
          <ul class="m-0 list-none p-0">
            <li v-for="[line, msgs] in issueList" :key="line">
              <button class="flex w-full items-start gap-2 px-3 py-1 text-left hover:bg-pl-raise" type="button" :aria-current="line === selectedLine" @click="goToLine(line)">
                <span class="w-12 flex-none font-mono text-pl-muted">стр. {{ line }}</span>
                <span class="min-w-0 truncate" :title="safeText(msgs.join('; '))">{{ safeText(msgs[0]) }}{{ msgs.length > 1 ? ` (+${msgs.length - 1})` : '' }}</span>
              </button>
            </li>
          </ul>
        </template>

        <h3 :class="cap">Выражения в when, check и тестах</h3>
        <dl class="pl-dl pt-0 [&_dt]:font-mono [&_dt]:text-pl-fg-strong">
          <dt>action.params.x</dt><dd>параметр действия из журнала; вложенные — через точку</dd>
          <dt>response.x</dt><dd>поле парного ответа</dd>
          <dt>dec(x, n)</dt><dd>число с n знаками после запятой как целое: <span class="font-mono">dec(action.params.threshold_c, 2) == -250</span></dd>
        </dl>

        <template v-if="view.field">
          <h3 :class="cap">Поле в строке {{ view.field.line }}</h3>
          <dl class="pl-dl">
            <dt>Статус</dt><dd><CommonStatusBadge :status="view.field.status" /> → {{ view.field.ref }}</dd>
            <dt>Проверка</dt><dd><CommonStatusBadge status="violation" :label="`${view.field.counterexamples} контрпример`" /></dd>
            <dt>Где</dt><dd>{{ view.field.where }}</dd>
          </dl>
        </template>
        <template v-if="view.quickFix">
          <h3 :class="cap">Быстрое исправление</h3>
          <div class="px-3">
            <button class="pl-btn" type="button" @click="applyFix">{{ view.quickFix.label }}</button>
            <p class="mt-2 text-pl-muted">{{ view.quickFix.note }}</p>
          </div>
        </template>
      </div>
    </ShellInspectorContent>
  </div>
</template>
