<script setup lang="ts">
import type { InterpretationView } from '~/data/views'
import { STATUS } from '~/utils/status'
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
const result = ref<Pick<InterpretationView, 'tree' | 'preview'> | null>(null)
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
  result.value = v.rev ? { tree: v.tree, preview: v.preview } : null
  selectedLine.value = v.selectedLine || null
}, { immediate: true })

const dirty = computed(() => !!view.value && text.value !== original.value)
const nextRev = computed(() => (revisions.value[0] ?? view.value?.rev ?? 0) + 1)

// Строка ошибки из ответа движка («line 3 column 5: …») — подсвечиваем её в редакторе.
const problemLine = computed(() => {
  const m = problem.value?.match(/line (\d+)/)
  return m ? Number(m[1]) : null
})

const lines = computed(() => {
  const marks = view.value?.yaml ?? []
  return text.value.split('\n').map((t, i) => ({
    n: i + 1,
    tokens: tokenizeYamlLine(safeText(t)),
    // Значки статусов — от последнего разбора, только пока строка не менялась.
    mark: marks[i]?.text === t ? marks[i]?.mark : undefined,
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
        <div class="pl-seg" role="radiogroup" aria-label="Вид">
          <button type="button" role="radio" :aria-checked="mode === 'yaml'" @click="mode = 'yaml'">YAML</button>
          <button type="button" role="radio" :aria-checked="mode === 'form'" @click="mode = 'form'">Форма</button>
        </div>
        <button class="pl-btn pl-btn-primary h-7" type="button" :disabled="saving || (!dirty && !!view?.rev)" title="Сохранить ревизией (Ctrl+S)" @click="save">
          {{ saving ? 'Сохраняю…' : `Сохранить rev ${nextRev}` }}
        </button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <div v-if="mode === 'yaml'" class="pl-scroll flex-1 py-2 font-mono text-[12.5px] leading-[21px]">
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
        <div v-else class="p-4 text-pl-muted">
          Форма редактирования полей строится по той же структуре; пока доступен вид YAML.
        </div>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="selectedLine ? `Строка ${selectedLine}` : 'Предпросмотр'">
      <div v-if="view" class="pl-scroll flex-1">
        <div v-if="problem" class="m-3 border border-pl-st-violation/60 p-2.5" role="alert">
          <CommonStatusBadge status="violation" label="ошибка в тексте" />
          <pre class="mt-2 mb-0 font-mono text-[11.5px] whitespace-pre-wrap text-pl-fg">{{ problem }}</pre>
        </div>
        <p v-if="notice" class="m-3 text-pl-st-rule" aria-live="polite">{{ notice }}</p>

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
