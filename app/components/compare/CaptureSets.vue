<script setup lang="ts">
import type { Comparison } from '~/api/types'
import { formatCount } from '~/utils/bytes'

// Одно описание на двух наборах записей: до и после прошивки, норма и сбой, два экземпляра устройства.
const mode = defineModel<'actions' | 'sets'>('mode', { required: true })

const data = useData()
const project = useProjectStore()
const side = ref<Record<string, 'a' | 'b' | undefined>>({})
const result = ref<Comparison | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)

const setA = computed(() => project.sources.filter(s => side.value[s.sha256] === 'a').map(s => s.sha256))
const setB = computed(() => project.sources.filter(s => side.value[s.sha256] === 'b').map(s => s.sha256))

function put(sha: string, v: 'a' | 'b') {
  side.value = { ...side.value, [sha]: side.value[sha] === v ? undefined : v }
}

async function run() {
  pending.value = true
  error.value = null
  try {
    result.value = await data.compareCaptures(setA.value, setB.value)
  }
  catch (e) {
    result.value = null
    error.value = e instanceof Error ? e.message : tr('compare.sets.failed')
  }
  finally {
    pending.value = false
  }
}

const ms = (ns: number) => tr('common.ms', { n: (ns / 1e6).toLocaleString(intlLocale(), { maximumFractionDigits: 2 }) })
const range = (v: { min: number | null, max: number | null, distinct: number }) => (v.min === null ? '—' : `${v.min}…${v.max} · ${tr('compare.values.count', { n: v.distinct > 64 ? '>64' : v.distinct })}`)
const CHANGE = { new: () => tr('compare.change.new'), missing: () => tr('compare.change.missing'), same: () => tr('compare.change.same') }
const allSummary = ref(false)
watch(result, () => { allSummary.value = false })
const summary = computed(() => (allSummary.value ? result.value?.summary : result.value?.summary.slice(0, 8)) ?? [])
const changedTypes = computed(() => result.value?.types.filter(t => t.change !== 'same') ?? [])
</script>

<template>
  <CommonPanelHeader :title="tr('compare.mode.sets')" :subtitle="tr('compare.sets.subtitle')">
    <div class="pl-seg" role="radiogroup" :aria-label="tr('compare.what')">
      <button type="button" role="radio" :aria-checked="false" @click="mode = 'actions'">{{ tr('compare.mode.actions') }}</button>
      <button type="button" role="radio" :aria-checked="true">{{ tr('compare.mode.sets') }}</button>
    </div>
  </CommonPanelHeader>
  <div class="flex flex-col gap-3 p-3">
    <p class="m-0 text-pl-muted">{{ tr('compare.sets.hint') }}</p>
    <table class="pl-table max-w-[640px]">
      <thead><tr><th>{{ tr('compare.sets.colCapture') }}</th><th>{{ tr('compare.sets.colSet') }}</th></tr></thead>
      <tbody>
        <tr v-for="s in project.sources" :key="s.sha256">
          <td>{{ safeText(s.name) }}</td>
          <td>
            <span class="pl-seg" role="radiogroup" :aria-label="tr('compare.sets.setFor', { name: s.name })">
              <button type="button" role="radio" :aria-checked="side[s.sha256] === 'a'" @click="put(s.sha256, 'a')">A</button>
              <button type="button" role="radio" :aria-checked="side[s.sha256] === 'b'" @click="put(s.sha256, 'b')">B</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="flex items-center gap-2">
      <button class="pl-btn pl-btn-primary" type="button" :disabled="pending || !setA.length || !setB.length" @click="run">{{ pending ? tr('compare.sets.comparing') : tr('compare.sets.run') }}</button>
      <span class="text-pl-muted">A: {{ setA.length }} · B: {{ setB.length }}</span>
    </div>
    <p v-if="error" class="m-0 text-pl-st-violation" role="alert">{{ safeText(error) }}</p>

    <template v-if="result">
      <dl class="pl-dl max-w-[640px] grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] p-0">
        <dt />
        <dd class="font-semibold">A</dd><dd class="font-semibold">B</dd>
        <dt>{{ tr('compare.sets.captures') }}</dt><dd>{{ result.a.sources }}</dd><dd>{{ result.b.sources }}</dd>
        <dt>{{ tr('compare.sets.messages') }}</dt><dd>{{ formatCount(result.a.messages) }}</dd><dd>{{ formatCount(result.b.messages) }}</dd>
      </dl>
      <h3 class="pl-caption m-0">{{ tr('compare.sets.key') }}</h3>
      <p v-if="!result.summary.length" class="m-0 text-pl-muted">{{ tr('compare.sets.noDiff') }}</p>
      <ul v-else class="m-0 list-disc pl-5">
        <li v-for="(l, i) in summary" :key="i">{{ safeText(l) }}</li>
      </ul>
      <button v-if="!allSummary && result.summary.length > 8" class="pl-btn pl-btn-ghost self-start" type="button" @click="allSummary = true">{{ tr('compare.sets.more', { n: result.summary.length - 8 }) }}</button>
      <p v-if="result.incomplete" class="m-0 text-pl-st-hypothesis">{{ tr('compare.sets.incomplete') }}</p>

      <template v-if="changedTypes.length">
        <h3 class="pl-caption m-0">{{ tr('compare.sets.types') }}</h3>
        <table class="pl-table">
          <thead><tr><th>{{ tr('compare.sets.colType') }}</th><th class="text-right">A</th><th class="text-right">B</th><th>{{ tr('compare.sets.colWhere') }}</th></tr></thead>
          <tbody>
            <tr v-for="t in changedTypes" :key="t.messageId ?? '?'">
              <td class="font-mono">{{ t.messageId ? safeText(t.messageId) : tr('compare.sets.unknownType') }}</td>
              <td class="text-right">{{ t.a }}</td><td class="text-right">{{ t.b }}</td>
              <td>{{ CHANGE[t.change]() }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-if="result.fields.length">
        <h3 class="pl-caption m-0">{{ tr('compare.sets.fields') }}</h3>
        <table class="pl-table">
          <thead><tr><th>{{ tr('compare.sets.colField') }}</th><th>A</th><th>B</th><th>{{ tr('compare.sets.appeared') }}</th><th>{{ tr('compare.sets.gone') }}</th></tr></thead>
          <tbody>
            <tr v-for="f in result.fields" :key="`${f.messageId}.${f.field}`">
              <td class="font-mono">{{ safeText(f.messageId) }}.{{ safeText(f.field) }}</td>
              <td class="whitespace-nowrap">{{ range(f.a) }}</td>
              <td class="whitespace-nowrap">{{ range(f.b) }}</td>
              <td class="font-mono">{{ f.newValues.map(v => safeText(v)).join(', ') || '—' }}</td>
              <td class="font-mono">{{ f.goneValues.map(v => safeText(v)).join(', ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-if="result.timing.length">
        <h3 class="pl-caption m-0">{{ tr('compare.sets.timing') }}</h3>
        <p class="m-0 text-xs text-pl-muted">{{ tr('compare.sets.timingHint') }}</p>
        <table class="pl-table">
          <thead><tr><th>{{ tr('compare.sets.colRequest') }}</th><th class="text-right">{{ tr('compare.sets.medianA') }}</th><th class="text-right">{{ tr('compare.sets.medianB') }}</th><th class="text-right">B / A</th></tr></thead>
          <tbody>
            <tr v-for="t in result.timing" :key="t.messageId">
              <td class="font-mono">{{ safeText(t.messageId) }}</td>
              <td class="text-right whitespace-nowrap">{{ ms(t.a.medianNs) }} · {{ tr('compare.sets.pairs', { n: t.a.pairs }) }}</td>
              <td class="text-right whitespace-nowrap">{{ ms(t.b.medianNs) }} · {{ tr('compare.sets.pairs', { n: t.b.pairs }) }}</td>
              <td class="text-right" :class="{ 'font-semibold text-pl-st-hypothesis': t.ratioPermille >= 1500 || t.ratioPermille <= 667 }">×{{ (t.ratioPermille / 1000).toLocaleString(intlLocale(), { maximumFractionDigits: 2 }) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </template>
  </div>
</template>
