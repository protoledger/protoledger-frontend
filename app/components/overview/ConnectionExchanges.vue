<script setup lang="ts">
import type { ExchangePairPage } from '~/api/types'
import { formatCount } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'

// Пары запрос→ответ соединения: движок сопоставляет ходы сторон по времени.
const props = defineProps<{ connection: string }>()
const emit = defineEmits<{ jump: [stream: string, start: number, end: number] }>()

const data = useData()
const page = ref<ExchangePairPage | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)

async function load(more = false) {
  pending.value = true
  error.value = null
  try {
    const next = await data.getExchangePairs(props.connection, more ? page.value?.items.length ?? 0 : 0)
    page.value = more && page.value ? { ...next, items: [...page.value.items, ...next.items] } : next
  }
  catch (e) {
    page.value = null
    error.value = e instanceof Error ? e.message : 'Не удалось сопоставить запросы и ответы'
  }
  finally {
    pending.value = false
  }
}
watch(() => props.connection, () => load(), { immediate: true })

const CERTAINTY: Record<string, { status: KnowledgeStatus, label: string, title: string }> = {
  certain: { status: 'rule', label: 'однозначно', title: 'Один запрос и один ответ' },
  ordered: { status: 'hypothesis', label: 'по порядку', title: 'Запросов и ответов поровну, сопоставлены по порядку — это допущение' },
  ambiguous: { status: 'ambiguous', label: 'неоднозначно', title: 'Число запросов и ответов разное — чей ответ, неизвестно' },
  unanswered: { status: 'unknown', label: 'без ответа', title: 'Запрос без ответа' },
  unsolicited: { status: 'unknown', label: 'без запроса', title: 'Ответ без запроса' },
}

function ms(ns: number | null | undefined) {
  if (ns === null || ns === undefined) return '—'
  return `${(ns / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: ns < 1e7 ? 2 : 0 })} мс`
}

function time(ns: number) {
  const d = new Date(Math.floor(ns / 1e6))
  return `${d.toLocaleTimeString('ru-RU', { timeZone: 'UTC' })}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}

const stats = computed(() => {
  const s = page.value?.stats
  if (!s) return []
  return [
    ['обменов', formatCount(s.exchanges)],
    ['однозначно', formatCount(s.certain)],
    ['по порядку', formatCount(s.ordered)],
    ['неоднозначно', formatCount(s.ambiguous)],
    ['без ответа', formatCount(s.unanswered)],
    ['без запроса', formatCount(s.unsolicited)],
    ['задержка, медиана', ms(s.medianDelayNs)],
    ['мин – макс', `${ms(s.minDelayNs)} – ${ms(s.maxDelayNs)}`],
  ]
})
</script>

<template>
  <div class="pl-scroll flex min-h-0 flex-1 flex-col">
    <p v-if="error" class="m-3 text-pl-muted" role="alert">{{ safeText(error) }}</p>
    <p v-else-if="pending && !page" class="m-3 text-pl-muted" aria-live="polite">Сопоставляю запросы и ответы…</p>
    <template v-if="page">
      <dl class="m-0 flex flex-wrap gap-x-5 gap-y-1 border-b border-pl-line px-3 py-2.5 [&_dd]:m-0 [&_dd]:font-semibold [&_dd]:text-pl-fg-strong [&_dt]:text-pl-muted">
        <div v-for="[k, v] in stats" :key="k" class="flex gap-1.5"><dt>{{ k }}</dt><dd>{{ v }}</dd></div>
      </dl>
      <p class="m-0 px-3 pt-2 text-xs text-pl-muted">Задержка — по меткам времени захвата: от последнего кадра запроса до первого кадра ответа.</p>
      <p v-if="!page.items.length" class="m-3 text-pl-muted">В соединении нет сообщений для сопоставления.</p>
      <table v-else class="pl-table">
        <thead><tr><th>Время</th><th>Запрос</th><th>Ответ</th><th class="text-right" title="По меткам времени захвата: от последнего кадра запроса до первого кадра ответа">Задержка</th><th>Пара</th></tr></thead>
        <tbody>
          <tr v-for="(p, i) in page.items" :key="i">
            <td class="whitespace-nowrap">{{ time((p.requests[0] ?? p.responses[0])!.firstTsNs) }}</td>
            <td>
              <button v-for="m in p.requests" :key="m.start" type="button" class="mr-1.5 font-mono text-pl-wine-text hover:underline" @click="emit('jump', m.stream, m.start, m.end)">{{ m.messageId ? safeText(m.messageId) : `[${m.start}, ${m.end})` }}</button>
              <span v-if="!p.requests.length" class="text-pl-muted">—</span>
            </td>
            <td>
              <button v-for="m in p.responses" :key="m.start" type="button" class="mr-1.5 font-mono text-pl-wine-text hover:underline" @click="emit('jump', m.stream, m.start, m.end)">{{ m.messageId ? safeText(m.messageId) : `[${m.start}, ${m.end})` }}</button>
              <span v-if="!p.responses.length" class="text-pl-muted">—</span>
            </td>
            <td class="text-right whitespace-nowrap">{{ ms(p.delayNs) }}</td>
            <td><span :title="CERTAINTY[p.certainty]?.title"><CommonStatusBadge :status="CERTAINTY[p.certainty]?.status ?? 'unknown'" :label="CERTAINTY[p.certainty]?.label ?? p.certainty" /></span></td>
          </tr>
        </tbody>
      </table>
      <button v-if="page.items.length < page.total" class="pl-btn pl-btn-ghost m-3 self-start" type="button" :disabled="pending" @click="load(true)">
        Показать ещё ({{ formatCount(page.total - page.items.length) }})
      </button>
    </template>
  </div>
</template>
