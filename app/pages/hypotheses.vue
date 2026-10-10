<script setup lang="ts">
import type { Hypothesis, HypothesisDetail } from '~/data/views'
import type { KnowledgeStatus } from '~/utils/status'

const data = useData()
const draft = useDraftAction()
const { data: view, error, refresh, pending } = await useAsyncData('hypotheses', () => data.getHypotheses())
const selected = ref<string | null>(null)
const detail = ref<HypothesisDetail | null>(null)
const detailState = ref<'idle' | 'loading' | 'error'>('idle')

watchEffect(() => {
  if (!selected.value && view.value?.items[0]) selected.value = view.value.items.find(h => h.status === 'refuted')?.id ?? view.value.items[0].id
})

watch(selected, async (id) => {
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
}, { immediate: true })

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
        <button class="pl-btn pl-btn-ghost h-7" type="button" @click="draft('Гипотеза добавлена')">+ гипотеза</button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <template v-if="view">
          <table class="pl-table">
            <tbody>
              <tr v-for="h in view.items" :key="h.id" :aria-selected="h.id === selected" @click="selected = h.id">
                <td class="w-14 font-semibold">{{ h.id }}</td>
                <td>
                  <div>{{ h.text }}</div>
                  <CommonStatusBadge class="mt-1" :status="BADGE[h.status].status" :label="BADGE[h.status].label(h)" />
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!view.items.length" class="p-3 text-pl-muted">Гипотез пока нет.</p>
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Открытые вопросы</h3>
          <p v-if="!view.questions.length" class="px-3 text-pl-muted">Открытых вопросов нет.</p>
          <ul class="mx-3 mb-4 list-disc pl-5">
            <li v-for="q in view.questions" :key="q" class="py-0.5">{{ q }}</li>
          </ul>
        </template>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="detail ? `${detail.id} · ${detail.title}` : 'Гипотеза'">
      <p v-if="detailState === 'loading'" class="p-3 text-pl-muted" aria-live="polite">Проверяю гипотезу на записях…</p>
      <p v-else-if="detailState === 'error'" class="p-3 text-pl-st-violation" role="alert">Не удалось загрузить гипотезу.</p>
      <p v-else-if="!detail" class="p-3 text-pl-muted">{{ !view?.items.length ? 'Гипотез пока нет.' : data.kind === 'mock' ? 'В примере данных подробно описана только H4.' : 'Выберите гипотезу.' }}</p>
      <div v-else class="pl-scroll flex-1">
        <div class="px-3 pt-3"><CommonStatusBadge :status="BADGE[detail.status].status" :label="BADGE[detail.status].label({ id: detail.id, text: detail.title, status: detail.status, support: detail.support })" /></div>
        <dl class="pl-dl">
          <dt>Утверждение</dt><dd>{{ detail.claim }}</dd>
          <dt>Тест</dt><dd class="font-mono">{{ detail.test }}</dd>
          <dt>Область</dt><dd>{{ detail.scope }}</dd>
          <dt>Основания</dt><dd>{{ detail.basis }}</dd>
        </dl>
        <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Контрпримеры</h3>
        <p v-if="!detail.counterexamples.length" class="px-3 text-pl-muted">Контрпримеров нет.</p>
        <table v-else class="pl-table">
          <thead><tr><th>Где</th><th>Ожидалось</th><th>Получено</th><th /></tr></thead>
          <tbody>
            <tr v-for="c in detail.counterexamples" :key="c.where">
              <td>{{ c.where }}</td><td>{{ c.expected }}</td><td>{{ c.got }}</td>
              <td class="text-right"><NuxtLink to="/overview" class="pl-btn pl-btn-ghost h-6">в поток</NuxtLink></td>
            </tr>
          </tbody>
        </table>
        <p v-if="detail.note" class="mt-2 px-3 text-pl-muted">{{ detail.note }}</p>
        <template v-if="detail.history.length">
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">История статуса</h3>
          <table class="pl-table">
            <tbody>
              <tr v-for="r in detail.history" :key="r.run">
                <td :class="{ 'text-pl-muted': r.stale }">{{ r.run }} · {{ r.time }}</td>
                <td><CommonStatusBadge :status="r.status === 'refuted' ? 'violation' : 'hypothesis'" :label="r.label" /></td>
                <td>{{ r.scope }} <CommonStatusBadge v-if="r.stale" status="stale" /></td>
              </tr>
            </tbody>
          </table>
        </template>
        <div class="flex flex-wrap gap-2 p-3">
          <NuxtLink to="/interpretation" class="pl-btn pl-btn-primary">Исправить в интерпретации</NuxtLink>
          <button class="pl-btn" type="button" @click="draft('Вопрос добавлен')">Добавить вопрос</button>
        </div>
      </div>
    </ShellInspectorContent>
  </div>
</template>
