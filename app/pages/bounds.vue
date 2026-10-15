<script setup lang="ts">
import { onWatcherCleanup } from 'vue'
import type { FramingDetail, FramingView } from '~/data/views'

const data = useData()
const draft = useDraftAction()
const workspace = useWorkspaceStore()
const project = useProjectStore()
const { connection, stream } = useCurrentStream()
const { ensure, at } = useStreamBytes(stream)
const range = ref<{ start: number, end: number } | null>(null)
const view = ref<FramingView | null>(null)
const selected = ref(0)
const error = ref<string | null>(null)
const detail = ref<FramingDetail | null>(null)
const detailError = ref<string | null>(null)
const applying = ref(false)
const applied = ref<string | null>(null)

// Поток или кандидат сменились раньше ответа — старый ответ не показываем.
watch(stream, async (s) => {
  let stale = false
  onWatcherCleanup(() => { stale = true })
  if (!s) return
  view.value = null
  error.value = null
  try {
    const v = await data.getFraming(s.id)
    if (stale) return
    view.value = v
    selected.value = 0
  }
  catch (e) {
    if (!stale) error.value = e instanceof Error ? e.message : tr('bounds.findFailed')
  }
}, { immediate: true })

const candidate = computed(() => view.value?.candidates[selected.value] ?? null)

watch([candidate, stream], async ([c, s]) => {
  let stale = false
  onWatcherCleanup(() => { stale = true })
  detail.value = null
  detailError.value = null
  applied.value = null
  if (!c || !s) return
  try {
    const d = await data.getFramingDetail(s.id, c.spec)
    if (!stale) detail.value = d
  }
  catch (e) {
    if (!stale) detailError.value = e instanceof Error ? e.message : tr('bounds.applyFailed')
  }
}, { immediate: true })

// В редакторе несохранённая правка: фрейминг сохранится в ревизию без неё — сначала предупреждаем.
const confirmApply = ref(false)
watch(candidate, () => { confirmApply.value = false })
async function applyFraming() {
  const c = candidate.value
  if (!c) return
  if (workspace.interpDraft && !confirmApply.value) {
    confirmApply.value = true
    return
  }
  confirmApply.value = false
  applying.value = true
  try {
    const rev = await data.applyFraming(c.spec)
    if (rev === null) return draft(tr('bounds.applied'))
    applied.value = tr('bounds.savedRevision', { rev })
    workspace.log(tr('bounds.logFraming', { hypothesis: c.evidence.hypothesis, rev }))
    void project.load()
  }
  catch (e) {
    applied.value = e instanceof Error ? tr('bounds.notSavedWith', { message: e.message }) : tr('bounds.notSaved')
  }
  finally {
    applying.value = false
  }
}

const starts = computed(() => new Set(detail.value?.messageStarts ?? []))
const maxVar = computed(() => Math.max(0.001, ...(detail.value?.variability ?? [1])))
const cap = 'pl-caption m-0 px-3 pt-3.5 pb-2'
</script>

<template>
  <div class="flex h-full">
    <ShellSidePanel id="bounds-candidates" :title="tr('bounds.candidates')" :subtitle="view?.searchRange" :width="400">
      <div class="pl-scroll flex-1">
        <CommonAsyncState :pending="!view && !error" :error="error" :empty="!view">
          <template v-if="view">
            <p v-for="n in view.notes" :key="n" class="px-3 pt-3 text-pl-muted">{{ n }}</p>
            <table
              v-if="view.candidates.length"
              class="pl-table"
              tabindex="0"
              :aria-label="tr('bounds.candidatesAria')"
              @keydown="(e: KeyboardEvent) => { const i = stepIndex(e, selected, view!.candidates.length); if (i !== null) { selected = i; revealSelected(e) } }"
            >
              <thead><tr><th>{{ tr('bounds.col.offset') }}</th><th>{{ tr('bounds.col.type') }}</th><th>{{ tr('bounds.col.adjust') }}</th><th class="text-right">{{ tr('bounds.col.share') }}</th></tr></thead>
              <tbody>
                <tr v-for="(c, i) in view.candidates" :key="c.id" :aria-selected="i === selected" @click="selected = i">
                  <td>{{ c.offset }}</td>
                  <td>{{ c.type }}</td>
                  <td>{{ c.adjust > 0 ? `+${c.adjust}` : c.adjust }}</td>
                  <td class="text-right whitespace-nowrap">{{ tr('bounds.msgCount', { n: c.messages }) }} · <b :class="{ 'text-pl-st-rule': i === 0 }">{{ c.share }}</b></td>
                </tr>
              </tbody>
            </table>
            <h3 :class="cap">{{ tr('bounds.signatures') }}</h3>
            <p v-if="!view.signatures.length" class="px-3 text-pl-muted">{{ tr('bounds.noCommonStarts') }}</p>
            <div class="flex flex-wrap gap-2 px-3">
              <CommonStatusBadge v-for="s in view.signatures" :key="s.label" :status="s.ok ? 'rule' : 'unknown'" :label="`${s.label} · ${s.matched} / ${s.total}`" />
            </div>
            <template v-if="detail">
              <h3 :class="cap">{{ tr('bounds.variability') }}</h3>
              <div class="flex h-[90px] items-end gap-1.5 px-3" role="img" :aria-label="detail.variabilityNote">
                <div v-for="(v, i) in detail.variability" :key="i" class="flex h-full flex-1 flex-col justify-end">
                  <span class="min-h-[3px]" :class="v / maxVar < 0.2 ? 'bg-pl-raise' : 'bg-pl-st-hypothesis'" :style="{ height: `${(v / maxVar) * 100}%` }" />
                  <span class="mt-1 text-center text-[11px] text-pl-muted">{{ i }}</span>
                </div>
              </div>
              <p class="px-3 text-pl-muted">{{ detail.variabilityNote }}</p>
            </template>
          </template>
        </CommonAsyncState>
      </div>
    </ShellSidePanel>

    <section class="flex min-w-0 flex-1 flex-col">
      <CommonPanelHeader :title="tr('bounds.overlay')" :subtitle="connection ? `${connection.id.split(':')[1]} · ${tr('bounds.overlayHint')}` : ''" />
      <div class="flex gap-4 border-b border-pl-line px-3 py-1.5 text-pl-muted">
        <span><i class="mr-1 inline-block h-3 w-0.5 bg-pl-st-violation align-middle" /> {{ tr('bounds.msgStart') }} ({{ starts.size }})</span>
        <span><i class="mr-1 inline-block h-3 w-0.5 bg-pl-wine-text align-middle" /> {{ tr('bounds.tcpSegment') }}</span>
        <span v-if="detailError" class="text-pl-st-violation" role="alert">{{ detailError }}</span>
      </div>
      <div class="min-h-0 flex-1">
        <OverviewHexView v-if="stream" v-model:range="range" :stream="stream" :at="at" :ensure="ensure" :message-starts="starts" />
      </div>
    </section>

    <ShellInspectorContent :title="tr('bounds.evidence')">
      <div v-if="candidate" class="pl-scroll flex-1">
        <dl class="pl-dl grid-cols-[110px_minmax(0,1fr)]">
          <dt>{{ tr('bounds.hypothesis') }}</dt><dd>{{ candidate.evidence.hypothesis }}</dd>
          <dt>{{ tr('bounds.confirmed') }}</dt><dd>{{ candidate.evidence.confirmed }}</dd>
          <dt>{{ tr('bounds.scope') }}</dt><dd>{{ safeText(candidate.evidence.scope) }}</dd>
        </dl>
        <h3 :class="cap">{{ tr('bounds.counterexamples') }}</h3>
        <p v-if="!candidate.evidence.counterexamples.length" class="px-3 text-pl-muted">{{ tr('bounds.noCounterexamples') }}</p>
        <table v-else class="pl-table">
          <tbody>
            <tr v-for="c in candidate.evidence.counterexamples" :key="c.message">
              <td>{{ safeText(c.message) }}</td>
              <td><CommonStatusBadge :status="c.status" /> {{ safeText(c.note) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-3 text-pl-muted">{{ safeText(candidate.evidence.note) }}</p>
        <p class="px-3 text-pl-muted">{{ tr('bounds.hint') }}</p>
      </div>
      <p v-else class="p-3 text-pl-muted">{{ tr('bounds.noCandidates') }}</p>
      <footer class="flex flex-col items-start gap-2 border-t border-pl-line px-3 py-2.5">
        <div class="flex flex-wrap gap-2">
          <button class="pl-btn pl-btn-primary" type="button" :disabled="!candidate || applying" @click="applyFraming">{{ confirmApply ? tr('bounds.applyAnyway') : tr('bounds.applyAsFraming') }}</button>
          <NuxtLink to="/interpretation?draft=1" class="pl-btn" :title="tr('bounds.draftTitle')">{{ tr('bounds.draft') }}</NuxtLink>
        </div>
        <span v-if="confirmApply" class="text-pl-st-hypothesis" role="alert">{{ tr('bounds.confirmWarn') }}</span>
        <span v-if="applied" aria-live="polite">{{ applied }}</span>
      </footer>
    </ShellInspectorContent>
  </div>
</template>
