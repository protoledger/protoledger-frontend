<script setup lang="ts">
import type { AnchorRef, Hypothesis, HypothesisDetail } from '~/data/views'
import type { KnowledgeStatus } from '~/utils/status'

const data = useData()
const draft = useDraftAction()
const workspace = useWorkspaceStore()
const { data: view, error, refresh, pending } = await useAsyncData('hypotheses', () => data.getHypotheses())
const route = useRoute()
const selected = ref<string | null>(typeof route.query.h === 'string' ? route.query.h : null)
watch(() => route.query.h, (h) => { if (typeof h === 'string') selected.value = h })
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
const { data: observations, refresh: refreshObservations } = await useAsyncData('hyp-observations', () => data.getObservations(), { default: () => [] as { id: string, text: string, where?: string, anchor?: AnchorRef }[] })
const creating = ref(false)
const form = reactive({ statement: '', test: '', basis: [] as string[] })
const formError = ref<string | null>(null)
const busy = ref(false)

async function createHypothesis() {
  if (!form.statement.trim()) {
    formError.value = tr('hypotheses.err.statementRequired')
    return
  }
  busy.value = true
  formError.value = null
  try {
    const id = await data.createHypothesis({ statement: form.statement.trim(), test: form.test.trim(), basis: form.basis })
    if (!id) {
      creating.value = false
      return draft(tr('hypotheses.toast.added'))
    }
    workspace.log(tr('hypotheses.log.created', { id, statement: form.statement.trim() }))
    Object.assign(form, { statement: '', test: '', basis: [] })
    creating.value = false
    await refresh()
    selected.value = id
  }
  catch (e) {
    formError.value = e instanceof Error ? e.message : tr('hypotheses.err.create')
  }
  finally {
    busy.value = false
  }
}

const suggesting = ref(false)
async function onSuggestionsAccepted(ids: string[]) {
  await refresh()
  selected.value = ids[0] ?? selected.value
}

// Статус — решение исследователя; тест его не меняет.
const MARKS = [['supported', 'hypotheses.mark.supported'], ['refuted', 'hypotheses.mark.refuted'], ['untested', 'hypotheses.mark.untested'], ['superseded', 'hypotheses.mark.superseded']] as const
const markError = ref<string | null>(null)
async function mark(status: Hypothesis['status']) {
  if (!detail.value || detail.value.marked === status) return
  markError.value = null
  try {
    const saved = await data.setHypothesisStatus(detail.value.id, status)
    if (!saved) return draft(tr('hypotheses.toast.statusChanged'))
    workspace.log(tr('hypotheses.log.status', { id: detail.value.id, status: tr(MARKS.find(m => m[0] === status)![1]) }))
    await refresh()
    await loadDetail(detail.value.id)
  }
  catch (e) {
    markError.value = e instanceof Error ? e.message : tr('hypotheses.err.status')
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
    if (!await data.createQuestion(text)) return draft(tr('hypotheses.toast.questionAdded'))
    workspace.log(tr('hypotheses.log.question', { text }))
    question.value = ''
    await refresh()
  }
  catch (e) {
    questionError.value = e instanceof Error ? e.message : tr('hypotheses.err.addQuestion')
  }
}

// Вопрос закрывают ответом; удалить — второе нажатие подтверждает.
const answering = ref<string | null>(null)
const answer = ref('')
const confirmDelete = ref<string | null>(null)
async function closeQuestion(id: string) {
  questionError.value = null
  try {
    if (!await data.updateQuestion(id, { status: 'closed', ...(answer.value.trim() ? { answer: answer.value.trim() } : {}) })) return draft(tr('hypotheses.toast.questionClosed'))
    workspace.log(answer.value.trim() ? tr('hypotheses.log.questionClosedAnswer', { id, answer: answer.value.trim() }) : tr('hypotheses.log.questionClosed', { id }))
    answering.value = null
    answer.value = ''
    await refresh()
  }
  catch (e) {
    questionError.value = e instanceof Error ? e.message : tr('hypotheses.err.closeQuestion')
  }
}
async function deleteQuestion(id: string) {
  if (confirmDelete.value !== id) {
    confirmDelete.value = id
    return
  }
  confirmDelete.value = null
  questionError.value = null
  try {
    if (!await data.deleteQuestion(id)) return draft(tr('hypotheses.toast.questionDeleted'))
    workspace.log(tr('hypotheses.log.questionDeleted', { id }))
    await refresh()
  }
  catch (e) {
    questionError.value = e instanceof Error ? e.message : tr('hypotheses.err.deleteQuestion')
  }
}

// Наблюдения: правка комментария и удаление; на которое ссылается гипотеза, движок удалить не даст.
const editingObs = ref<string | null>(null)
const obsComment = ref('')
const obsError = ref<string | null>(null)
async function saveObservation(id: string) {
  obsError.value = null
  try {
    if (!await data.updateObservation(id, obsComment.value.trim())) return draft(tr('hypotheses.toast.observationChanged'))
    workspace.log(tr('hypotheses.log.observationChanged', { id }))
    editingObs.value = null
    await refreshObservations()
  }
  catch (e) {
    obsError.value = e instanceof Error ? e.message : tr('hypotheses.err.observationSave')
  }
}
async function deleteObservation(id: string) {
  if (confirmDelete.value !== id) {
    confirmDelete.value = id
    return
  }
  confirmDelete.value = null
  obsError.value = null
  try {
    if (!await data.deleteObservation(id)) return draft(tr('hypotheses.toast.observationDeleted'))
    workspace.log(tr('hypotheses.log.observationDeleted', { id }))
    await refreshObservations()
  }
  catch (e) {
    obsError.value = e instanceof Error ? e.message : tr('hypotheses.err.observationDelete')
  }
}

function openAnchor(a: AnchorRef | undefined) {
  return navigateTo(a ? anchorRoute(a) : '/overview')
}

// «Поддержана на N примерах», а не «подтверждена»: гипотеза не становится фактом.
const BADGE: Record<Hypothesis['status'], { status: KnowledgeStatus, label: (h: Hypothesis) => string }> = {
  supported: { status: 'hypothesis', label: h => (h.support ? tr('hypotheses.badge.supportedN', { n: h.support }) : tr('hypotheses.badge.supported')) },
  refuted: { status: 'violation', label: h => (h.support ? tr('hypotheses.badge.refutedN', { n: h.support }) : tr('hypotheses.badge.refuted')) },
  untested: { status: 'unknown', label: () => tr('hypotheses.badge.untested') },
  superseded: { status: 'stale', label: () => tr('hypotheses.badge.superseded') },
}
</script>

<template>
  <div class="flex h-full">
    <section class="pl-scroll min-w-0 flex-1">
      <CommonPanelHeader :title="tr('hypotheses.title')" :subtitle="view ? String(view.items.length) : ''">
        <button class="pl-btn pl-btn-ghost h-7" type="button" :title="tr('hypotheses.suggestionsHint')" @click="suggesting = true">{{ tr('hypotheses.suggestions') }}</button>
        <button class="pl-btn pl-btn-ghost h-7" type="button" @click="creating = true">{{ tr('hypotheses.add') }}</button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <template v-if="view">
          <table
            class="pl-table"
            :tabindex="view.items.length ? 0 : undefined"
            :aria-label="tr('hypotheses.tableLabel')"
            @keydown="(e: KeyboardEvent) => { const i = stepIndex(e, view!.items.findIndex(h => h.id === selected), view!.items.length); if (i !== null) { selected = view!.items[i]!.id; revealSelected(e) } }"
          >
            <tbody>
              <tr v-for="h in view.items" :key="h.id" :aria-selected="h.id === selected" @click="selected = h.id">
                <td class="w-14 font-semibold">{{ h.id }}</td>
                <td>
                  <div>{{ safeText(h.text) }}</div>
                  <div class="mt-1 flex flex-wrap items-center gap-1.5">
                    <CommonStatusBadge :status="BADGE[h.status].status" :label="BADGE[h.status].label(h)" />
                    <CommonStatusBadge v-if="h.run" :status="h.run.status" :label="h.run.label" :title="tr('hypotheses.runHint')" />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!view.items.length" class="p-3 text-pl-muted">{{ tr('hypotheses.none') }}</p>
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">{{ tr('hypotheses.openQuestions') }}</h3>
          <p v-if="!view.questions.length" class="px-3 text-pl-muted">{{ tr('hypotheses.noQuestions') }}</p>
          <ul class="mx-3 mb-2 list-none p-0">
            <li v-for="q in view.questions" :key="q.id" class="flex flex-col gap-1 border-b border-pl-line py-1.5">
              <div class="flex items-start gap-2">
                <span class="min-w-0 flex-1">{{ safeText(q.text) }}</span>
                <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" :aria-expanded="answering === q.id" @click="answering = answering === q.id ? null : q.id; answer = ''">{{ tr('hypotheses.answer') }}</button>
                <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="deleteQuestion(q.id)">{{ confirmDelete === q.id ? tr('common.confirmDelete') : tr('common.delete') }}</button>
              </div>
              <form v-if="answering === q.id" class="flex gap-2" @submit.prevent="closeQuestion(q.id)">
                <input v-model="answer" class="h-7 min-w-0 flex-1 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong focus:border-pl-wine-text" :placeholder="tr('hypotheses.answerOptional')" :aria-label="tr('hypotheses.answerTo', { text: q.text })">
                <button class="pl-btn h-7" type="submit">{{ tr('hypotheses.closeQuestion') }}</button>
              </form>
            </li>
          </ul>
          <form class="mx-3 mb-4 flex gap-2" @submit.prevent="addQuestion">
            <input
              id="new-question"
              ref="questionInput"
              v-model="question"
              class="h-7 min-w-0 flex-1 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong focus:border-pl-wine-text"
              :placeholder="tr('hypotheses.newQuestionHint')"
              :aria-label="tr('hypotheses.newQuestion')"
            >
            <button class="pl-btn h-7" type="submit" :disabled="!question.trim()">{{ tr('hypotheses.addQuestionBtn') }}</button>
          </form>
          <p v-if="questionError" class="mx-3 text-pl-st-violation" role="alert">{{ questionError }}</p>
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">{{ tr('hypotheses.observations', { n: observations.length }) }}</h3>
          <p v-if="!observations.length" class="px-3 text-pl-muted">{{ tr('hypotheses.noObservations') }}</p>
          <ul class="mx-3 mb-4 list-none p-0">
            <li v-for="o in observations" :key="o.id" class="flex flex-col gap-1 border-b border-pl-line py-1.5">
              <div v-if="editingObs !== o.id" class="flex items-start gap-2">
                <b class="flex-none font-semibold">{{ o.id }}</b>
                <span class="min-w-0 flex-1">
                  {{ safeText(o.text) }}
                  <NuxtLink v-if="o.anchor" :to="anchorRoute(o.anchor)" class="block font-mono text-xs text-pl-wine-text hover:underline" :title="tr('compare.toBytes')">{{ safeText(o.where ?? '') }}</NuxtLink>
                  <span v-else-if="o.where" class="block font-mono text-xs text-pl-muted">{{ safeText(o.where) }}</span>
                </span>
                <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="editingObs = o.id; obsComment = o.text">{{ tr('common.edit') }}</button>
                <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="deleteObservation(o.id)">{{ confirmDelete === o.id ? tr('common.confirmDelete') : tr('common.delete') }}</button>
              </div>
              <form v-else class="flex gap-2" @submit.prevent="saveObservation(o.id)">
                <input v-model="obsComment" class="h-7 min-w-0 flex-1 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong focus:border-pl-wine-text" :aria-label="tr('hypotheses.observationComment', { id: o.id })">
                <button class="pl-btn h-7" type="submit">{{ tr('common.save') }}</button>
                <button class="pl-btn pl-btn-ghost h-7" type="button" @click="editingObs = null">{{ tr('common.cancel') }}</button>
              </form>
            </li>
          </ul>
          <p v-if="obsError" class="mx-3 text-pl-st-violation" role="alert">{{ safeText(obsError) }}</p>
        </template>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="detail ? `${detail.id} · ${detail.title}` : tr('hypotheses.inspector')">
      <p v-if="detailState === 'loading'" class="p-3 text-pl-muted" aria-live="polite">{{ tr('hypotheses.checking') }}</p>
      <p v-else-if="detailState === 'error'" class="p-3 text-pl-st-violation" role="alert">{{ tr('hypotheses.loadFailed') }}</p>
      <p v-else-if="!detail" class="p-3 text-pl-muted">{{ !view?.items.length ? tr('hypotheses.none') : data.kind === 'mock' ? tr('hypotheses.sampleOnlyH4') : tr('hypotheses.selectOne') }}</p>
      <div v-else class="pl-scroll flex-1">
        <div class="px-3 pt-3"><CommonStatusBadge :status="BADGE[detail.status].status" :label="BADGE[detail.status].label({ id: detail.id, text: detail.title, status: detail.status, support: detail.support, run: null })" /></div>
        <div class="flex flex-col gap-1.5 px-3 pt-3">
          <span class="pl-caption">{{ tr('hypotheses.statusDecision') }}</span>
          <div class="flex flex-wrap gap-1.5" role="group" :aria-label="tr('hypotheses.statusGroup')">
            <button v-for="[v, l] in MARKS" :key="v" type="button" class="pl-chip" :aria-pressed="detail.marked === v" @click="mark(v)">{{ tr(l) }}</button>
          </div>
          <span v-if="markError" class="text-pl-st-violation" role="alert">{{ markError }}</span>
        </div>
        <dl class="pl-dl">
          <dt>{{ tr('hypotheses.claim') }}</dt><dd>{{ safeText(detail.claim) }}</dd>
          <dt>{{ tr('hypotheses.test') }}</dt><dd class="font-mono">{{ safeText(detail.test) }}</dd>
          <dt>{{ tr('hypotheses.scope') }}</dt><dd>{{ safeText(detail.scope) }}</dd>
          <dt>{{ tr('hypotheses.basis') }}</dt><dd>{{ safeText(detail.basis) }}</dd>
        </dl>
        <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">{{ tr('hypotheses.counterexamples') }}</h3>
        <p v-if="!detail.counterexamples.length" class="px-3 text-pl-muted">{{ tr('hypotheses.noCounterexamples') }}</p>
        <ul v-else class="m-0 list-none p-0">
          <li v-for="c in detail.counterexamples" :key="c.where" class="border-b border-pl-line px-3 py-2.5">
            <div class="flex items-start justify-between gap-2">
              <span class="min-w-0 break-words text-pl-fg-strong">{{ safeText(c.where) }}</span>
              <button class="pl-btn pl-btn-ghost h-6 flex-none" type="button" @click="openAnchor(c.anchor)">{{ tr('hypotheses.toStream') }}</button>
            </div>
            <dl class="m-0 mt-1.5 grid grid-cols-[86px_minmax(0,1fr)] gap-x-2 gap-y-1 [&_dd]:m-0 [&_dd]:font-mono [&_dd]:break-words [&_dt]:text-pl-muted">
              <dt>{{ tr('hypotheses.expected') }}</dt><dd>{{ safeText(c.expected) }}</dd>
              <dt>{{ tr('hypotheses.got') }}</dt><dd>{{ safeText(c.got) }}</dd>
            </dl>
          </li>
        </ul>
        <p v-if="detail.note" class="mt-2 px-3 text-pl-muted">{{ safeText(detail.note) }}</p>
        <template v-if="detail.history.length">
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">{{ tr('hypotheses.history') }}</h3>
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
          <NuxtLink to="/interpretation" class="pl-btn pl-btn-primary">{{ tr('hypotheses.fixInInterp') }}</NuxtLink>
          <button class="pl-btn" type="button" @click="questionInput?.focus()">{{ tr('hypotheses.addQuestion') }}</button>
        </div>
      </div>
    </ShellInspectorContent>

    <HypothesesSuggestions v-model:open="suggesting" :existing="view?.items.map(h => h.text) ?? []" @accepted="onSuggestionsAccepted" />

    <UModal v-model:open="creating" :title="tr('hypotheses.newTitle')" :description="tr('hypotheses.newDescription')">
      <template #body>
        <form id="hypothesis-form" class="flex flex-col gap-3" @submit.prevent="createHypothesis">
          <label class="flex flex-col gap-1">
            <span class="pl-caption">{{ tr('hypotheses.statementLabel') }}</span>
            <textarea id="hyp-statement" v-model="form.statement" rows="2" class="rounded border border-pl-line bg-pl-raise px-2 py-1.5 text-pl-fg-strong focus:border-pl-wine-text" :placeholder="tr('hypotheses.statementHint')" />
          </label>
          <label class="flex flex-col gap-1">
            <span class="pl-caption">{{ tr('hypotheses.test') }}</span>
            <input id="hyp-test" v-model="form.test" class="h-[30px] rounded border border-pl-line bg-pl-raise px-2 font-mono text-pl-fg-strong focus:border-pl-wine-text" placeholder="value == action.params.value" spellcheck="false">
            <span class="text-xs text-pl-muted">{{ tr('hypotheses.testFields') }} <code class="font-mono">response.*</code>, <code class="font-mono">action.params.*</code>, <code class="font-mono">action.result.*</code>. {{ tr('hypotheses.testNote') }}</span>
          </label>
          <fieldset class="m-0 flex flex-col gap-1 border-0 p-0">
            <legend class="pl-caption mb-1">{{ tr('hypotheses.basis') }}</legend>
            <p v-if="!observations.length" class="m-0 text-pl-muted">{{ tr('hypotheses.noObservations') }}</p>
            <label v-for="o in observations" :key="o.id" class="flex items-start gap-1.5">
              <input v-model="form.basis" type="checkbox" :value="o.id" class="mt-0.5"> <b class="font-semibold">{{ o.id }}</b> {{ safeText(o.text) }}
            </label>
          </fieldset>
          <p v-if="formError" class="m-0 text-pl-st-violation" role="alert">{{ formError }}</p>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2.5">
          <button class="pl-btn" type="button" @click="creating = false">{{ tr('common.cancel') }}</button>
          <button class="pl-btn pl-btn-primary" type="submit" form="hypothesis-form" :disabled="busy">{{ busy ? tr('hypotheses.creating') : tr('hypotheses.create') }}</button>
        </div>
      </template>
    </UModal>
  </div>
</template>
