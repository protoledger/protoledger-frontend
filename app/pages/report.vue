<script setup lang="ts">
import { reportBlocks } from '~/utils/report-blocks'
import { saveTextFile } from '~/utils/save-file'

const data = useData()
const draft = useDraftAction()
const workspace = useWorkspaceStore()
const live = data.kind === 'live'

// Пример данных — структурный вид; движок присылает готовый Markdown отчёта.
const { data: view, error: sampleError, pending: samplePending, refresh: refreshSample } = await useAsyncData('report-sample', () => (live ? Promise.resolve(null) : data.getReport()))
const { data: runs } = await useAsyncData('report-runs', () => data.listRuns(), { default: () => [] as { id: string, label: string, stale: boolean }[] })
const runId = ref<string>('')
const { data: report, error, pending, refresh } = await useAsyncData('report', () => (live ? data.generateReport('md', runId.value || undefined) : Promise.resolve(null)), { watch: [runId] })

const blocks = computed(() => (report.value ? reportBlocks(report.value.content) : []))
const sections = computed(() => blocks.value.filter(b => b.kind === 'heading' && b.level > 1))
const exporting = ref<string | null>(null)
const exportError = ref<string | null>(null)

async function exportReport(format: 'md' | 'html') {
  exporting.value = format
  exportError.value = null
  try {
    const r = await data.generateReport(format, runId.value || undefined)
    if (!r) return draft(format === 'html' ? 'Экспорт HTML' : 'Экспорт Markdown')
    saveTextFile(r.fileName, r.content, format === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8')
    workspace.log(`Отчёт сохранён: ${r.fileName}`)
  }
  catch (e) {
    exportError.value = e instanceof Error ? e.message : 'Не удалось собрать отчёт'
  }
  finally {
    exporting.value = null
  }
}

async function exportInterpretation() {
  exportError.value = null
  try {
    const v = await data.getInterpretation()
    if (!v.rev || !live) return draft('Экспорт интерпретации YAML')
    const name = `interpretation.rev${v.rev}.yaml`
    saveTextFile(name, v.yaml.map(l => l.text).join('\n'), 'application/yaml;charset=utf-8')
    workspace.log(`Интерпретация сохранена: ${name}`)
  }
  catch (e) {
    exportError.value = e instanceof Error ? e.message : 'Не удалось получить интерпретацию'
  }
}

const h2 = 'mt-6 mb-2 font-display text-[17px] font-semibold text-pl-wine'
const tableCls = 'mt-2.5 w-full border-collapse text-[12.5px] [&_td]:border-b [&_td]:border-pl-line [&_td]:px-2.5 [&_td]:py-1.5 [&_td]:align-top [&_td]:break-words [&_th]:bg-pl-raise [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:tracking-[0.06em] [&_th]:uppercase'
</script>

<template>
  <div class="flex h-full">
    <ShellSidePanel id="report-sections" title="Разделы" :width="230">
      <ol v-if="live" class="pl-scroll m-0 flex-1 list-none py-1.5">
        <li v-for="s in sections" :key="s.kind === 'heading' ? s.id : ''">
          <a v-if="s.kind === 'heading'" :href="`#${s.id}`" class="block py-1.5 pr-3 hover:bg-pl-raise" :class="s.level === 3 ? 'pl-9 text-pl-muted' : 'pl-6'">{{ s.text }}</a>
        </li>
      </ol>
      <ol v-else-if="view" class="pl-scroll m-0 flex-1 list-none py-1.5">
        <li v-for="(s, i) in view.sections" :key="s"><a :href="`#sec-${i + 1}`" class="block px-6 py-1.5 hover:bg-pl-raise">{{ i + 1 }}. {{ s }}</a></li>
      </ol>
    </ShellSidePanel>

    <section class="pl-scroll min-w-0 flex-1 px-6 py-[18px]">
      <!-- Отчёт движка: блоки выводятся только интерполяцией текста, HTML в страницу не попадает. -->
      <CommonAsyncState v-if="live" :pending="pending" :error="error?.message" :empty="!report" empty-text="Отчёта пока нет." @retry="refresh()">
        <article v-if="report" class="light mx-auto max-w-[820px] border-t-4 border-pl-wine bg-pl-card px-11 py-10 text-sm leading-relaxed text-pl-card-fg">
          <template v-for="(b, i) in blocks" :key="i">
            <h1 v-if="b.kind === 'heading' && b.level === 1" :id="b.id" class="mt-0 mb-4 font-display text-2xl font-semibold">{{ b.text }}</h1>
            <h2 v-else-if="b.kind === 'heading' && b.level === 2" :id="b.id" :class="h2">{{ b.text }}</h2>
            <h3 v-else-if="b.kind === 'heading'" :id="b.id" class="mt-4 mb-1.5 font-display text-[15px] font-semibold">{{ b.text }}</h3>
            <p v-else-if="b.kind === 'paragraph'" class="my-2 max-w-[70ch]">{{ safeText(b.text, 20000) }}</p>
            <ul v-else-if="b.kind === 'list'" class="my-2 list-disc pl-5">
              <li v-for="(item, j) in b.items" :key="j">{{ safeText(item) }}</li>
            </ul>
            <div v-else-if="b.kind === 'table'" class="overflow-x-auto">
              <table :class="tableCls">
                <thead><tr><th v-for="(h, j) in b.head" :key="j">{{ safeText(h) }}</th></tr></thead>
                <tbody>
                  <tr v-for="(row, r) in b.rows" :key="r"><td v-for="(c, j) in row" :key="j">{{ safeText(c) }}</td></tr>
                </tbody>
              </table>
            </div>
          </template>
        </article>
      </CommonAsyncState>

      <CommonAsyncState v-else :pending="samplePending" :error="sampleError?.message" :empty="!view" @retry="refreshSample()">
        <!-- Предпросмотр — светлая карточка, как экспортированный HTML; статусы в светлой палитре. -->
        <article v-if="view" class="light mx-auto max-w-[760px] border-t-4 border-pl-wine bg-pl-card px-11 py-10 text-sm leading-relaxed text-pl-card-fg">
          <p class="text-pl-muted">{{ view.meta }}</p>
          <h1 class="mt-1 mb-4 font-display text-2xl font-semibold">{{ safeText(view.title) }}</h1>
          <h2 id="sec-1" :class="h2">1. Итог</h2>
          <p>{{ safeText(view.summary) }}</p>
          <table :class="tableCls">
            <thead><tr><th>Поле</th><th>Тип</th><th>Статус</th><th>Основания</th></tr></thead>
            <tbody>
              <tr v-for="f in view.fields" :key="f.name">
                <td class="font-mono">{{ safeText(f.name) }}</td><td>{{ f.type }}</td>
                <td><CommonStatusBadge :status="f.status" /></td><td>{{ safeText(f.basis) }}</td>
              </tr>
            </tbody>
          </table>
          <h2 id="sec-2" :class="h2">2. Данные и область</h2>
          <p>{{ safeText(view.scope) }}</p>
          <h2 id="sec-7" :class="h2">7. Открытые вопросы</h2>
          <ul class="list-disc pl-5"><li v-for="q in view.questions" :key="q">{{ safeText(q) }}</li></ul>
        </article>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent title="Экспорт">
      <div class="flex flex-col gap-1.5 p-3">
        <label for="report-run" class="pl-caption">Прогон в отчёте</label>
        <select id="report-run" v-model="runId" class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg">
          <option value="">последний</option>
          <option v-for="r in runs" :key="r.id" :value="r.id">{{ r.id }} · {{ safeText(r.label) }}{{ r.stale ? ' · устарел' : '' }}</option>
        </select>
        <p class="m-0 text-pl-muted">Устаревший прогон помечается в тексте отчёта.</p>
      </div>
      <div class="flex flex-col gap-2 border-t border-pl-line p-3">
        <button class="pl-btn pl-btn-primary justify-center" type="button" :disabled="!!exporting" @click="exportReport('html')">{{ exporting === 'html' ? 'Собираю…' : 'Скачать HTML' }}</button>
        <button class="pl-btn justify-center" type="button" :disabled="!!exporting" @click="exportReport('md')">{{ exporting === 'md' ? 'Собираю…' : 'Скачать Markdown' }}</button>
        <button class="pl-btn justify-center" type="button" @click="exportInterpretation">Интерпретация YAML</button>
        <p v-if="exportError" class="m-0 text-pl-st-violation" role="alert">{{ exportError }}</p>
        <p class="m-0 text-pl-muted">HTML-отчёт самодостаточен: экранирован, без скриптов и внешних ресурсов — открывается как файл.</p>
      </div>
    </ShellInspectorContent>
  </div>
</template>
