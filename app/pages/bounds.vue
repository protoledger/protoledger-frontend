<script setup lang="ts">
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

watch(stream, async (s) => {
  if (!s) return
  view.value = null
  error.value = null
  try {
    view.value = await data.getFraming(s.id)
    selected.value = 0
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось найти кандидатов'
  }
}, { immediate: true })

const candidate = computed(() => view.value?.candidates[selected.value] ?? null)

watch([candidate, stream], async ([c, s]) => {
  detail.value = null
  detailError.value = null
  applied.value = null
  if (!c || !s) return
  try {
    detail.value = await data.getFramingDetail(s.id, c.spec)
  }
  catch (e) {
    detailError.value = e instanceof Error ? e.message : 'Не удалось применить кандидата к потоку'
  }
}, { immediate: true })

async function applyFraming() {
  const c = candidate.value
  if (!c) return
  applying.value = true
  try {
    const rev = await data.applyFraming(c.spec)
    if (rev === null) return draft('Фрейминг применён')
    applied.value = `Сохранено в интерпретацию: ревизия ${rev}.`
    workspace.log(`Фрейминг «${c.evidence.hypothesis}» → интерпретация rev ${rev}`)
    void project.load()
  }
  catch (e) {
    applied.value = e instanceof Error ? `Не сохранено: ${e.message}` : 'Не сохранено'
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
    <ShellSidePanel id="bounds-candidates" title="Кандидаты поля длины" :subtitle="view?.searchRange" :width="400">
      <div class="pl-scroll flex-1">
        <CommonAsyncState :pending="!view && !error" :error="error" :empty="!view">
          <template v-if="view">
            <p v-for="n in view.notes" :key="n" class="px-3 pt-3 text-pl-muted">{{ n }}</p>
            <table v-if="view.candidates.length" class="pl-table">
              <thead><tr><th>Смещ.</th><th>Тип</th><th>Попр.</th><th class="text-right">Доля</th></tr></thead>
              <tbody>
                <tr v-for="(c, i) in view.candidates" :key="c.id" :aria-selected="i === selected" @click="selected = i">
                  <td>{{ c.offset }}</td>
                  <td>{{ c.type }}</td>
                  <td>{{ c.adjust > 0 ? `+${c.adjust}` : c.adjust }}</td>
                  <td class="text-right whitespace-nowrap">{{ c.messages }} сообщ. · <b :class="{ 'text-pl-st-rule': i === 0 }">{{ c.share }}</b></td>
                </tr>
              </tbody>
            </table>
            <h3 :class="cap">Сигнатуры на началах</h3>
            <p v-if="!view.signatures.length" class="px-3 text-pl-muted">Общих начал не найдено.</p>
            <div class="flex flex-wrap gap-2 px-3">
              <CommonStatusBadge v-for="s in view.signatures" :key="s.label" :status="s.ok ? 'rule' : 'unknown'" :label="`${s.label} · ${s.matched} / ${s.total}`" />
            </div>
            <template v-if="detail">
              <h3 :class="cap">Изменчивость по смещениям</h3>
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
      <CommonPanelHeader title="Наложение на поток" :subtitle="connection ? `${connection.id.split(':')[1]} · границы сегментов и сообщений одновременно` : ''" />
      <div class="flex gap-4 border-b border-pl-line px-3 py-1.5 text-pl-muted">
        <span><i class="mr-1 inline-block h-3 w-0.5 bg-pl-st-violation align-middle" /> начало сообщения ({{ starts.size }})</span>
        <span><i class="mr-1 inline-block h-3 w-0.5 bg-pl-wine-text align-middle" /> сегмент TCP</span>
        <span v-if="detailError" class="text-pl-st-violation" role="alert">{{ detailError }}</span>
      </div>
      <div class="min-h-0 flex-1">
        <OverviewHexView v-if="stream" v-model:range="range" :stream="stream" :at="at" :ensure="ensure" :message-starts="starts" />
      </div>
    </section>

    <ShellInspectorContent title="Основания">
      <div v-if="candidate" class="pl-scroll flex-1">
        <dl class="pl-dl grid-cols-[110px_minmax(0,1fr)]">
          <dt>Гипотеза</dt><dd>{{ candidate.evidence.hypothesis }}</dd>
          <dt>Подтверждено</dt><dd>{{ candidate.evidence.confirmed }}</dd>
          <dt>Область</dt><dd>{{ safeText(candidate.evidence.scope) }}</dd>
        </dl>
        <h3 :class="cap">Контрпримеры</h3>
        <p v-if="!candidate.evidence.counterexamples.length" class="px-3 text-pl-muted">Контрпримеров нет.</p>
        <table v-else class="pl-table">
          <tbody>
            <tr v-for="c in candidate.evidence.counterexamples" :key="c.message">
              <td>{{ safeText(c.message) }}</td>
              <td><CommonStatusBadge :status="c.status" /> {{ safeText(c.note) }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-3 text-pl-muted">{{ safeText(candidate.evidence.note) }}</p>
        <p class="px-3 text-pl-muted">Это подсказка по данным, а не вывод: применённый фрейминг попадёт в интерпретацию со статусом «гипотеза».</p>
      </div>
      <p v-else class="p-3 text-pl-muted">Кандидатов нет.</p>
      <footer class="flex flex-col items-start gap-2 border-t border-pl-line px-3 py-2.5">
        <button class="pl-btn pl-btn-primary" type="button" :disabled="!candidate || applying" @click="applyFraming">Применить как фрейминг</button>
        <span v-if="applied" aria-live="polite">{{ applied }}</span>
      </footer>
    </ShellInspectorContent>
  </div>
</template>
