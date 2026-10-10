<script setup lang="ts">
import type { Hypothesis } from '~/data/draft'
import type { KnowledgeStatus } from '~/utils/status'

const data = useData()
const draft = useDraftAction()
const { data: view, error, refresh, pending } = await useAsyncData('hypotheses', () => data.getHypotheses())
const selected = ref('H4')

// «Поддержана на N примерах», а не «подтверждена»: гипотеза не становится фактом.
const BADGE: Record<Hypothesis['status'], { status: KnowledgeStatus, label: (h: Hypothesis) => string }> = {
  supported: { status: 'hypothesis', label: h => `поддержана ${h.support}` },
  refuted: { status: 'violation', label: h => `опровергнута · ${h.support}` },
  untested: { status: 'unknown', label: () => 'не проверена' },
}
</script>

<template>
  <div class="grid h-full grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] [&>*]:min-h-0 [&>*]:min-w-0 [&>*]:border-r [&>*]:border-pl-line">
    <section class="pl-scroll">
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
          <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Открытые вопросы</h3>
          <ul class="mx-3 mb-4 list-disc pl-5">
            <li v-for="q in view.questions" :key="q" class="py-0.5">{{ q }}</li>
          </ul>
        </template>
      </CommonAsyncState>
    </section>

    <section v-if="view" class="pl-scroll">
      <CommonPanelHeader :title="`${view.selected.id} · ${view.selected.title}`">
        <CommonStatusBadge status="violation" label="опровергнута" />
      </CommonPanelHeader>
      <p v-if="selected !== view.selected.id" class="p-4 text-pl-muted">В примере данных подробно описана только {{ view.selected.id }}.</p>
      <template v-else>
        <dl class="pl-dl">
          <dt>Утверждение</dt><dd>{{ view.selected.claim }}</dd>
          <dt>Тест</dt><dd class="font-mono">{{ view.selected.test }}</dd>
          <dt>Область</dt><dd>{{ view.selected.scope }}</dd>
          <dt>Основания</dt><dd>{{ view.selected.basis }}</dd>
        </dl>
        <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">Контрпримеры</h3>
        <table class="pl-table">
          <thead><tr><th>Где</th><th>Ожидалось</th><th>Получено</th><th /></tr></thead>
          <tbody>
            <tr v-for="c in view.selected.counterexamples" :key="c.where">
              <td>{{ c.where }}</td><td>{{ c.expected }}</td><td>{{ c.got }}</td>
              <td class="text-right"><NuxtLink to="/overview" class="pl-btn pl-btn-ghost h-6">в поток</NuxtLink></td>
            </tr>
          </tbody>
        </table>
        <p class="px-3 mt-2 text-pl-muted">{{ view.selected.note }}</p>
        <h3 class="pl-caption m-0 px-3 pt-3.5 pb-2">История статуса</h3>
        <table class="pl-table">
          <tbody>
            <tr v-for="r in view.selected.history" :key="r.run">
              <td :class="{ 'text-pl-muted': r.stale }">{{ r.run }} · {{ r.time }}</td>
              <td><CommonStatusBadge :status="r.status === 'refuted' ? 'violation' : 'hypothesis'" :label="r.label" /></td>
              <td>{{ r.scope }} <CommonStatusBadge v-if="r.stale" status="stale" /></td>
            </tr>
          </tbody>
        </table>
        <div class="flex gap-2 p-3">
          <NuxtLink to="/interpretation" class="pl-btn pl-btn-primary">Исправить в интерпретации</NuxtLink>
          <button class="pl-btn" type="button" @click="draft('Вопрос добавлен')">Добавить вопрос</button>
        </div>
      </template>
    </section>
  </div>
</template>
