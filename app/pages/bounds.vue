<script setup lang="ts">
import type { FramingView } from '~/data/views'

const data = useData()
const draft = useDraftAction()
const { connection, stream } = useCurrentStream()
const { ensure, at } = useStreamBytes(stream)
const range = ref<{ start: number, end: number } | null>(null)
const view = ref<FramingView | null>(null)
const selected = ref(0)
const error = ref<string | null>(null)

watch(stream, async (s) => {
  if (!s) return
  try {
    view.value = await data.getFraming(s.id)
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось найти кандидатов'
  }
}, { immediate: true })

const starts = computed(() => new Set(view.value?.messageStarts ?? []))
const maxVar = computed(() => Math.max(...(view.value?.variability ?? [1])))

const cap = 'pl-caption m-0 px-3 pt-3.5 pb-2'

function share(c: { matched: number, total: number }) {
  return `${((c.matched / c.total) * 100).toFixed(1).replace('.', ',')}%`
}
</script>

<template>
  <div class="flex h-full">
    <ShellSidePanel id="bounds-candidates" title="Кандидаты поля длины" :subtitle="view?.searchRange" :width="400">
      <div class="pl-scroll flex-1">
        <CommonAsyncState :pending="!view" :error="error" :empty="!view">
          <template v-if="view">
            <table class="pl-table">
              <thead><tr><th>Смещ.</th><th>Тип</th><th>Попр.</th><th class="text-right">Доля</th></tr></thead>
              <tbody>
                <tr v-for="(c, i) in view.candidates" :key="i" :aria-selected="i === selected" @click="selected = i">
                  <td>{{ c.offset }}</td>
                  <td>{{ c.type }}</td>
                  <td>{{ c.adjust > 0 ? `+${c.adjust}` : c.adjust }}</td>
                  <td class="text-right whitespace-nowrap">{{ c.matched }} / {{ c.total }} · <b :class="{ 'text-pl-st-rule': i === 0 }">{{ share(c) }}</b></td>
                </tr>
              </tbody>
            </table>
            <h3 :class="cap">Сигнатуры на началах</h3>
            <div class="flex flex-wrap gap-2 px-3">
              <CommonStatusBadge v-for="s in view.signatures" :key="s.label" :status="s.ok ? 'rule' : 'unknown'" :label="`${s.label} · ${s.matched} / ${s.total}`" />
            </div>
            <h3 :class="cap">Изменчивость по смещениям</h3>
            <div class="flex h-[90px] items-end gap-1.5 px-3" role="img" :aria-label="view.variabilityNote">
              <div v-for="(v, i) in view.variability" :key="i" class="flex h-full flex-1 flex-col justify-end">
                <span class="min-h-[3px]" :class="v < 0.2 ? 'bg-pl-raise' : 'bg-pl-st-hypothesis'" :style="{ height: `${(v / maxVar) * 100}%` }" />
                <span class="mt-1 text-center text-[11px] text-pl-muted">{{ i }}</span>
              </div>
            </div>
            <p class="px-3 text-pl-muted">{{ view.variabilityNote }}</p>
          </template>
        </CommonAsyncState>
      </div>
    </ShellSidePanel>

    <section class="flex min-w-0 flex-1 flex-col">
      <CommonPanelHeader title="Наложение на поток" :subtitle="connection ? `${connection.id.split(':')[1]} · границы сегментов и сообщений одновременно` : ''" />
      <div class="flex gap-4 border-b border-pl-line px-3 py-1.5 text-pl-muted">
        <span><i class="mr-1 inline-block h-3 w-0.5 bg-pl-st-violation align-middle" /> начало сообщения</span>
        <span><i class="mr-1 inline-block h-3 w-0.5 bg-pl-wine-text align-middle" /> сегмент TCP</span>
      </div>
      <div class="min-h-0 flex-1">
        <OverviewHexView v-if="stream" v-model:range="range" :stream="stream" :at="at" :ensure="ensure" :message-starts="starts" />
      </div>
    </section>

    <ShellInspectorContent title="Основания">
      <div v-if="view" class="pl-scroll flex-1">
        <dl class="pl-dl grid-cols-[110px_minmax(0,1fr)]">
          <dt>Гипотеза</dt><dd>{{ view.evidence.hypothesis }}</dd>
          <dt>Подтверждено</dt><dd>{{ view.evidence.confirmed }}</dd>
          <dt>Область</dt><dd>{{ view.evidence.scope }}</dd>
        </dl>
        <h3 :class="cap">Контрпримеры</h3>
        <table class="pl-table">
          <tbody>
            <tr v-for="c in view.evidence.counterexamples" :key="c.message">
              <td>{{ c.message }}</td>
              <td><CommonStatusBadge :status="c.status" /> {{ c.note }}</td>
            </tr>
          </tbody>
        </table>
        <p class="px-3 text-pl-muted">{{ view.evidence.note }}</p>
      </div>
      <footer class="border-t border-pl-line px-3 py-2.5">
        <button class="pl-btn pl-btn-primary" type="button" @click="draft('Фрейминг применён')">Применить как фрейминг</button>
      </footer>
    </ShellInspectorContent>
  </div>
</template>
