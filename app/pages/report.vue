<script setup lang="ts">
const data = useData()
const draft = useDraftAction()
const { data: view, error, refresh, pending } = await useAsyncData('report', () => data.getReport())

const h2 = 'mt-6 mb-2 font-display text-[17px] font-semibold text-pl-wine'
</script>

<template>
  <div class="grid h-full grid-cols-[230px_minmax(0,1fr)]">
    <aside class="border-r border-pl-line">
      <CommonPanelHeader title="Разделы" />
      <ol v-if="view" class="m-0 list-none py-1.5">
        <li v-for="(s, i) in view.sections" :key="s"><a :href="`#sec-${i + 1}`" class="block px-6 py-1.5 hover:bg-pl-raise">{{ i + 1 }}. {{ s }}</a></li>
      </ol>
      <div class="flex flex-col gap-2 border-t border-pl-line p-3">
        <button class="pl-btn pl-btn-primary justify-center" type="button" @click="draft('Экспорт HTML')">Экспорт HTML</button>
        <button class="pl-btn justify-center" type="button" @click="draft('Экспорт интерпретации YAML')">Интерпретация YAML</button>
      </div>
    </aside>
    <section class="pl-scroll px-6 py-[18px]">
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <!-- Предпросмотр — светлая карточка, как экспортированный HTML; статусы в светлой палитре. -->
        <article v-if="view" class="light mx-auto max-w-[760px] border-t-4 border-pl-wine bg-pl-card px-11 py-10 text-sm leading-relaxed text-pl-card-fg">
          <p class="text-pl-muted">{{ view.meta }}</p>
          <h1 class="mt-1 mb-4 font-display text-2xl font-semibold">{{ view.title }}</h1>
          <h2 id="sec-1" :class="h2">1. Итог</h2>
          <p>{{ view.summary }}</p>
          <table class="mt-2.5 w-full border-collapse [&_td]:border-b [&_td]:border-pl-line [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:bg-pl-raise [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:tracking-[0.06em] [&_th]:uppercase">
            <thead><tr><th>Поле</th><th>Тип</th><th>Статус</th><th>Основания</th></tr></thead>
            <tbody>
              <tr v-for="f in view.fields" :key="f.name">
                <td class="font-mono">{{ f.name }}</td><td>{{ f.type }}</td>
                <td><CommonStatusBadge :status="f.status" /></td><td>{{ f.basis }}</td>
              </tr>
            </tbody>
          </table>
          <h2 id="sec-2" :class="h2">2. Данные и область</h2>
          <p>{{ view.scope }}</p>
          <h2 id="sec-7" :class="h2">7. Открытые вопросы</h2>
          <ul class="list-disc pl-5"><li v-for="q in view.questions" :key="q">{{ q }}</li></ul>
        </article>
      </CommonAsyncState>
    </section>
  </div>
</template>
