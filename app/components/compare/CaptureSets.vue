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
    error.value = e instanceof Error ? e.message : 'Не удалось сравнить наборы'
  }
  finally {
    pending.value = false
  }
}

const ms = (ns: number) => `${(ns / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} мс`
const range = (v: { min: number | null, max: number | null, distinct: number }) => (v.min === null ? '—' : `${v.min}…${v.max} · ${v.distinct > 64 ? '>64' : v.distinct} знач.`)
const CHANGE = { new: 'только во втором', missing: 'только в первом', same: 'в обоих' }
const allSummary = ref(false)
watch(result, () => { allSummary.value = false })
const summary = computed(() => (allSummary.value ? result.value?.summary : result.value?.summary.slice(0, 8)) ?? [])
const changedTypes = computed(() => result.value?.types.filter(t => t.change !== 'same') ?? [])
</script>

<template>
  <CommonPanelHeader title="Наборы записей" subtitle="одно описание на двух наборах — что отличается">
    <div class="pl-seg" role="radiogroup" aria-label="Что сравнивать">
      <button type="button" role="radio" :aria-checked="false" @click="mode = 'actions'">Действия</button>
      <button type="button" role="radio" :aria-checked="true">Наборы записей</button>
    </div>
  </CommonPanelHeader>
  <div class="flex flex-col gap-3 p-3">
    <p class="m-0 text-pl-muted">Отметьте записи первого (A) и второго (B) набора: например, до и после обновления прошивки или штатную работу и сбой. Описание — текущая ревизия.</p>
    <table class="pl-table max-w-[640px]">
      <thead><tr><th>Запись</th><th>Набор</th></tr></thead>
      <tbody>
        <tr v-for="s in project.sources" :key="s.sha256">
          <td>{{ safeText(s.name) }}</td>
          <td>
            <span class="pl-seg" role="radiogroup" :aria-label="`Набор для ${s.name}`">
              <button type="button" role="radio" :aria-checked="side[s.sha256] === 'a'" @click="put(s.sha256, 'a')">A</button>
              <button type="button" role="radio" :aria-checked="side[s.sha256] === 'b'" @click="put(s.sha256, 'b')">B</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="flex items-center gap-2">
      <button class="pl-btn pl-btn-primary" type="button" :disabled="pending || !setA.length || !setB.length" @click="run">{{ pending ? 'Сравниваю…' : 'Сравнить' }}</button>
      <span class="text-pl-muted">A: {{ setA.length }} · B: {{ setB.length }}</span>
    </div>
    <p v-if="error" class="m-0 text-pl-st-violation" role="alert">{{ safeText(error) }}</p>

    <template v-if="result">
      <dl class="pl-dl max-w-[640px] grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] p-0">
        <dt />
        <dd class="font-semibold">A</dd><dd class="font-semibold">B</dd>
        <dt>Записей</dt><dd>{{ result.a.sources }}</dd><dd>{{ result.b.sources }}</dd>
        <dt>Сообщений</dt><dd>{{ formatCount(result.a.messages) }}</dd><dd>{{ formatCount(result.b.messages) }}</dd>
      </dl>
      <h3 class="pl-caption m-0">Главное</h3>
      <p v-if="!result.summary.length" class="m-0 text-pl-muted">Отличий в типах, значениях полей и задержках не нашлось.</p>
      <ul v-else class="m-0 list-disc pl-5">
        <li v-for="(l, i) in summary" :key="i">{{ safeText(l) }}</li>
      </ul>
      <button v-if="!allSummary && result.summary.length > 8" class="pl-btn pl-btn-ghost self-start" type="button" @click="allSummary = true">ещё {{ result.summary.length - 8 }}</button>
      <p v-if="result.incomplete" class="m-0 text-pl-st-hypothesis">Сравнение прервано по времени — показана часть отличий.</p>

      <template v-if="changedTypes.length">
        <h3 class="pl-caption m-0">Типы сообщений</h3>
        <table class="pl-table">
          <thead><tr><th>Тип</th><th class="text-right">A</th><th class="text-right">B</th><th>Где</th></tr></thead>
          <tbody>
            <tr v-for="t in changedTypes" :key="t.messageId ?? '?'">
              <td class="font-mono">{{ t.messageId ? safeText(t.messageId) : 'тип не определён' }}</td>
              <td class="text-right">{{ t.a }}</td><td class="text-right">{{ t.b }}</td>
              <td>{{ CHANGE[t.change] }}</td>
            </tr>
          </tbody>
        </table>
      </template>

      <template v-if="result.fields.length">
        <h3 class="pl-caption m-0">Значения полей</h3>
        <table class="pl-table">
          <thead><tr><th>Поле</th><th>A</th><th>B</th><th>Появились</th><th>Пропали</th></tr></thead>
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
        <h3 class="pl-caption m-0">Время ответа</h3>
        <table class="pl-table">
          <thead><tr><th>Запрос</th><th class="text-right">Медиана A</th><th class="text-right">Медиана B</th><th class="text-right">B / A</th></tr></thead>
          <tbody>
            <tr v-for="t in result.timing" :key="t.messageId">
              <td class="font-mono">{{ safeText(t.messageId) }}</td>
              <td class="text-right whitespace-nowrap">{{ ms(t.a.medianNs) }} · {{ t.a.pairs }} пар</td>
              <td class="text-right whitespace-nowrap">{{ ms(t.b.medianNs) }} · {{ t.b.pairs }} пар</td>
              <td class="text-right" :class="{ 'font-semibold text-pl-st-hypothesis': t.ratioPermille >= 1500 || t.ratioPermille <= 667 }">×{{ (t.ratioPermille / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) }}</td>
            </tr>
          </tbody>
        </table>
      </template>
    </template>
  </div>
</template>
