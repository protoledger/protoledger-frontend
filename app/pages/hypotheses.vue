<script setup lang="ts">
import type { AnchorRef, Hypothesis, HypothesisDetail } from '~/data/views'
import type { KnowledgeStatus } from '~/utils/status'

const data = useData()
const draft = useDraftAction()
const workspace = useWorkspaceStore()
const { data: view, error, refresh, pending } = await useAsyncData('hypotheses', () => data.getHypotheses())
const selected = ref<string | null>(null)
const detail = ref<HypothesisDetail | null>(null)
const detailState = ref<'idle' | 'loading' | 'error'>('idle')

watchEffect(() => {
  if (!selected.value && view.value?.items[0]) selected.value = view.value.items.find(h => h.status === 'refuted')?.id ?? view.value.items[0].id
})

async function loadDetail(id: string | null) {
  detail.value = null
  if (!id) return
  detailState.value = 'loading'
  try {
    detail.value = await data.getHypothesisDetail(id)
    detailState.value = 'idle'
  }
  catch {
    detailState.value = 'error'
  }
}
watch(selected, loadDetail, { immediate: true })

// Новая гипотеза: утверждение, тест-выражение и наблюдения-основания.
const { data: observations } = await useAsyncData('hyp-observations', () => data.getObservations(), { default: () => [] as { id: string, text: string }[] })
const creating = ref(false)
const form = reactive({ statement: '', test: '', basis: [] as string[] })
const formError = ref<string | null>(null)
const busy = ref(false)

async function createHypothesis() {
  if (!form.statement.trim()) {
    formError.value = 'Сформулируйте утверждение'
    return
  }
  busy.value = true
  formError.value = null
  try {
    const id = await data.createHypothesis({ statement: form.statement.trim(), test: form.test.trim(), basis: form.basis })
    if (!id) {
      creating.value = false
      return draft('Гипотеза добавлена')
    }
    workspace.log(`Гипотеза ${id}: ${form.statement.trim()}`)
    Object.assign(form, { statement: '', test: '', basis: [] })
    creating.value = false
    await refresh()
    selected.value = id
  }
  catch (e) {
    formError.value = e instanceof Error ? e.message : 'Не удалось создать гипотезу'
  }
  finally {
    busy.value = false
  }
}

// Статус — решение исследователя; тест его не меняет.
const MARKS = [['supported', 'поддержана'], ['refuted', 'опровергнута'], ['untested', 'не проверена'], ['superseded', 'заменена']] as const
const markError = ref<string | null>(null)
async function mark(status: Hypothesis['status']) {
  if (!detail.value || detail.value.marked === status) return
  markError.value = null
  try {
    const saved = await data.setHypothesisStatus(detail.value.id, status)
    if (!saved) return draft('Статус гипотезы изменён')
    workspace.log(`Гипотеза ${detail.value.id}: статус «${MARKS.find(m => m[0] === status)?.[1]}»`)
    await refresh()
    await loadDetail(detail.value.id)
  }
  catch (e) {
    markError.value = e instanceof Error ? e.message : 'Не удалось изменить статус'
  }
}

const question = ref('')
const questionInput = ref<HTMLInputElement | null>(null)
const questionError = ref<string | null>(null)
async function addQuestion() {
  const text = question.value.trim()
  if (!text) return
  questionError.value = null
  try {
    if (!await data.createQuestion(text)) return draft('Вопрос добавлен')
    workspace.log(`Вопрос: ${text}`)
    question.value = ''
    await refresh()
  }
  catch (e) {
    questionError.value = e instanceof Error ? e.message : 'Не удалось добавить вопрос'
  }
}

function openAnchor(a: AnchorRef | undefined) {
  if (!a) return navigateTo('/overview')
  const cut = a.stream.lastIndexOf(':')
  return navigateTo({ path: '/overview', query: { conn: a.stream.slice(0, cut), dir: a.stream.slice(cut + 1), from: String(a.start), to: String(a.end) } })
}

// «Поддержана на N примерах», а не «подтверждена»: гипотеза не становится фактом.
const BADGE: Record<Hypothesis['status'], { status: KnowledgeStatus, label: (h: Hypothesis) => string }> = {
  supported: { status: 'hypothesis', label: h => (h.support ? `поддержана ${h.support}` : 'поддержана') },
  refuted: { status: 'violation', label: h => `опровергнута · ${h.support}` },
  untested: { status: 'unknown', label: () => 'не проверена' },
  superseded: { status: 'stale', label: () => 'заменена' },
}
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader title="Гипотезы" :subtitle="view ? String(view.items.length) : ''">
        <button class="pl-btn pl-btn-ghost h-7" type="button" @click="creating = true">+ гипотеза</button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <template v-if="view">
          <table class="pl-table">
            <tbody>
              <tr v-for="h in view.items" :key="h.id" :aria-selected="h.id === selected" @click="selected = h.id">
                <td class="w-14 font-semibold">{{ h.id }}</td>
                <td>
                  <div>{{ safeText(h.text) }}</div>
                  <CommonStatusBadge class="mt-1" :status="BADGE[h.status].status" :label="BADGE[h.status].label(h)" />
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!view.items.length" class="p-3 text-pl-muted">Гипотез пока нет.</p>
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Открытые вопросы</h3>
          <p v-if="!view.questions.length" class="px-3 text-pl-muted">Открытых вопросов нет.</p>
          <ul class="mx-3 mb-2 list-disc pl-5">
            <li v-for="q in view.questions" :key="q" class="py-0.5">{{ safeText(q) }}</li>
          </ul>
          <form class="mx-3 mb-4 flex gap-2" @submit.prevent="addQuestion">
            <input
              id="new-question"
              ref="questionInput"
              v-model="question"
              class="h-7 min-w-0 flex-1 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong outline-none focus:border-pl-wine-text"
              placeholder="Новый открытый вопрос…"
              aria-label="Новый открытый вопрос"
            >
            <button class="pl-btn h-7" type="submit" :disabled="!question.trim()">Добавить</button>
          </form>
          <p v-if="questionError" class="mx-3 text-pl-st-violation" role="alert">{{ questionError }}</p>
        </template>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="detail ? `${detail.id} · ${detail.title}` : 'Гипотеза'">
      <p v-if="detailState === 'loading'" class="p-3 text-pl-muted" aria-live="polite">Проверяю гипотезу на записях…</p>
      <p v-else-if="detailState === 'error'" class="p-3 text-pl-st-violation" role="alert">Не удалось загрузить гипотезу.</p>
      <p v-else-if="!detail" class="p-3 text-pl-muted">{{ !view?.items.length ? 'Гипотез пока нет.' : data.kind === 'mock' ? 'В примере данных подробно описана только H4.' : 'Выберите гипотезу.' }}</p>
      <div v-else class="pl-scroll flex-1">
        <div class="px-3 pt-3"><CommonStatusBadge :status="BADGE[detail.status].status" :label="BADGE[detail.status].label({ id: detail.id, text: detail.title, status: detail.status, support: detail.support })" /></div>
        <div class="flex flex-col gap-1.5 px-3 pt-3">
          <span class="pl-caption">Статус, по вашему решению</span>
          <div class="flex flex-wrap gap-1.5" role="group" aria-label="Статус гипотезы">
            <button v-for="[v, l] in MARKS" :key="v" type="button" class="pl-chip" :aria-pressed="detail.marked === v" @click="mark(v)">{{ l }}</button>
          </div>
          <span v-if="markError" class="text-pl-st-violation" role="alert">{{ markError }}</span>
        </div>
        <dl class="pl-dl">
          <dt>Утверждение</dt><dd>{{ safeText(detail.claim) }}</dd>
          <dt>Тест</dt><dd class="font-mono">{{ safeText(detail.test) }}</dd>
          <dt>Область</dt><dd>{{ safeText(detail.scope) }}</dd>
          <dt>Основания</dt><dd>{{ safeText(detail.basis) }}</dd>
        </dl>
        <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Контрпримеры</h3>
        <p v-if="!detail.counterexamples.length" class="px-3 text-pl-muted">Контрпримеров нет.</p>
        <ul v-else class="m-0 list-none p-0">
          <li v-for="c in detail.counterexamples" :key="c.where" class="border-b border-pl-line px-3 py-2.5">
            <div class="flex items-start justify-between gap-2">
              <span class="min-w-0 break-words text-pl-fg-strong">{{ safeText(c.where) }}</span>
              <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="openAnchor(c.anchor)">в поток</button>
            </div>
            <dl class="m-0 mt-1.5 grid grid-cols-[86px_minmax(0,1fr)] gap-x-2 gap-y-1 [&_dd]:m-0 [&_dd]:font-mono [&_dd]:break-words [&_dt]:text-pl-muted">
              <dt>Ожидалось</dt><dd>{{ safeText(c.expected) }}</dd>
              <dt>Получено</dt><dd>{{ safeText(c.got) }}</dd>
            </dl>
          </li>
        </ul>
        <p v-if="detail.note" class="mt-2 px-3 text-pl-muted">{{ safeText(detail.note) }}</p>
        <template v-if="detail.history.length">
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">История статуса</h3>
          <table class="pl-table">
            <tbody>
              <tr v-for="r in detail.history" :key="r.run">
                <td :class="{ 'text-pl-muted': r.stale }">{{ r.run }} · {{ r.time }}</td>
                <td><CommonStatusBadge :status="r.status === 'refuted' ? 'violation' : 'hypothesis'" :label="r.label" /></td>
                <td>{{ safeText(r.scope) }} <CommonStatusBadge v-if="r.stale" status="stale" /></td>
              </tr>
            </tbody>
          </table>
        </template>
        <div class="flex flex-wrap gap-2 p-3">
          <NuxtLink to="/interpretation" class="pl-btn pl-btn-primary">Исправить в интерпретации</NuxtLink>
          <button class="pl-btn" type="button" @click="questionInput?.focus()">Добавить вопрос</button>
        </div>
      </div>
    </ShellInspectorContent>

    <UModal v-model:open="creating" title="Новая гипотеза" description="Утверждение, тест и наблюдения, на которых оно основано">
      <template #body>
        <form id="hypothesis-form" class="flex flex-col gap-3" @submit.prevent="createHypothesis">
          <label class="flex flex-col gap-1">
            <span class="pl-caption">Утверждение *</span>
            <textarea id="hyp-statement" v-model="form.statement" rows="2" class="rounded border border-pl-line bg-pl-raise px-2 py-1.5 text-pl-fg-strong outline-none focus:border-pl-wine-text" placeholder="value в запросе равно параметру действия" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="pl-caption">Тест</span>
            <input id="hyp-test" v-model="form.test" class="h-[30px] rounded border border-pl-line bg-pl-raise px-2 font-mono text-pl-fg-strong outline-none focus:border-pl-wine-text" placeholder="value == action.params.value" spellcheck="false">
            <span class="text-xs text-pl-muted">Поля сообщения, <code class="font-mono">response.*</code>, <code class="font-mono">action.params.*</code>, <code class="font-mono">action.result.*</code>. Без теста гипотеза остаётся «не проверена».</span>
          </label>
          <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
            <legend class="pl-caption mb-1">Основания</legend>
            <p v-if="!observations.length" class="m-0 text-pl-muted">Наблюдений пока нет — их создают из выделения байтов в «Обзоре» и «Сравнении».</p>
            <label v-for="o in observations" :key="o.id" class="flex items-start gap-1.5">
              <input v-model="form.basis" type="checkbox" :value="o.id" class="mt-0.5"> <b class="font-semibold">{{ o.id }}</b> {{ safeText(o.text) }}
            </label>
          </fieldset>
          <p v-if="formError" class="m-0 text-pl-st-violation" role="alert">{{ formError }}</p>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <button class="pl-btn" type="button" @click="creating = false">Отмена</button>
          <button class="pl-btn pl-btn-primary" type="submit" form="hypothesis-form" :disabled="busy">{{ busy ? 'Создаю…' : 'Создать' }}</button>
        </div>
      </template>
    </UModal>
  </div>
</template>
