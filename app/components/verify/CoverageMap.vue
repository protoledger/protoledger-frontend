<script setup lang="ts">
import type { CoverageStatus, CoverageView } from '~/data/views'

const data = useData()
const view = ref<CoverageView | null>(null)
const state = ref<'idle' | 'loading' | 'error'>('idle')
const error = ref<string | null>(null)

async function load() {
  state.value = 'loading'
  error.value = null
  try {
    view.value = await data.getCoverage()
    state.value = 'idle'
  }
  catch (e) {
    state.value = 'error'
    error.value = e instanceof Error ? e.message : 'Карта покрытия недоступна'
  }
}
onMounted(load)

// Цвета языка статусов: «не описано» — штриховка, чтобы отличалось не только цветом.
const FILL: Record<CoverageStatus, string> = {
  rule: 'bg-pl-st-rule',
  hypothesis: 'bg-pl-st-hypothesis',
  unknown: 'bg-pl-st-unknown',
  none: 'bg-hatch-gap',
}

function width(bytes: number, total: number) {
  return `${total ? (bytes / total) * 100 : 0}%`
}

function typeTotal(t: CoverageView['types'][number]) {
  return t.totals.rule + t.totals.hypothesis + t.totals.unknown + t.totals.none
}

function regionLength(t: CoverageView['types'][number]) {
  return Math.max(1, ...t.regions.map(r => r.end))
}
</script>

<template>
  <section aria-label="Покрытие описанием">
    <h3 class="pl-caption mt-5 mb-2">Покрытие байтов описанием</h3>
    <p v-if="state === 'loading'" class="text-pl-muted" aria-live="polite">Считаю покрытие…</p>
    <p v-else-if="state === 'error'" class="text-pl-muted">{{ safeText(error) }}</p>
    <template v-else-if="view">
      <p class="mt-0 mb-2">
        Описано <b class="text-pl-fg-strong">{{ view.described }}</b> байтов сообщений.
        <span class="text-pl-muted">«Не описано» и «неизвестно» — что ещё предстоит понять.</span>
      </p>
      <div class="flex h-4 gap-px" role="img" :aria-label="view.totals.map(t => `${t.label}: ${t.bytes} байт`).join(', ')">
        <span v-for="t in view.totals.filter(x => x.bytes)" :key="t.status" :class="FILL[t.status]" :style="{ width: width(t.bytes, view.totals.reduce((n, x) => n + x.bytes, 0)) }" :title="`${t.label}: ${t.bytes} байт`" />
      </div>
      <div class="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-pl-muted">
        <span v-for="t in view.totals" :key="t.status" class="flex items-center gap-1.5"><i class="size-2.5" :class="FILL[t.status]" /> {{ t.label }} · {{ t.bytes }}</span>
      </div>
      <p v-if="view.incomplete" class="text-pl-st-hypothesis">Разбор прерван по времени — посчитана часть записей.</p>

      <table class="pl-table mt-3">
        <thead><tr><th>Тип</th><th class="text-right">Сообщ.</th><th>Длина</th><th class="w-1/2">Раскладка байтов</th></tr></thead>
        <tbody>
          <tr v-for="t in view.types" :key="t.id">
            <td class="font-mono">{{ safeText(t.id) }}</td>
            <td class="text-right">{{ t.messages }}</td>
            <td class="whitespace-nowrap">{{ t.length }}</td>
            <td>
              <div class="relative h-4 bg-pl-panel" role="img" :aria-label="`${t.id}: ${t.regions.map(r => `${r.start}–${r.end - 1} ${r.label}`).join(', ')}`">
                <span
                  v-for="(r, i) in t.regions"
                  :key="i"
                  class="absolute inset-y-0 border-r border-pl-bg"
                  :class="FILL[r.status]"
                  :style="{ left: width(r.start, regionLength(t)), width: width(r.end - r.start, regionLength(t)), opacity: 0.35 + 0.65 * r.share }"
                  :title="`байты ${r.start}–${r.end - 1}: ${safeText(r.label)}${r.share < 1 ? ` · в ${Math.round(r.share * 100)}% сообщений` : ''}`"
                />
              </div>
              <span class="text-[11px] text-pl-muted">
                описано {{ Math.round(((t.totals.rule + t.totals.hypothesis) / Math.max(1, typeTotal(t))) * 100) }}%<template v-if="t.truncated"> · показаны первые 256 байт</template>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>
  </section>
</template>
