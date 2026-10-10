<script setup lang="ts">
import { STATUS } from '~/utils/status'
import { tokenizeYamlLine } from '~/utils/yaml-tokens'

const data = useData()
const draft = useDraftAction()
const { data: view, error, refresh, pending } = await useAsyncData('interpretation', () => data.getInterpretation())
const mode = ref<'yaml' | 'form'>('yaml')
const selectedLine = ref<number | null>(null)
const fixed = ref(false)

watchEffect(() => {
  if (view.value && selectedLine.value === null) selectedLine.value = view.value.selectedLine
})

const lines = computed(() => (view.value?.yaml ?? []).map((l, i) => {
  const text = fixed.value && i + 1 === view.value?.field.line ? l.text.replace('u16be, status: hypothesis', 'i32be, status: hypothesis') : l.text
  const mark = fixed.value && i + 1 === view.value?.field.line ? 'hypothesis' : l.mark
  return { n: i + 1, tokens: tokenizeYamlLine(text), mark }
}))

const cap = 'pl-caption m-0 px-3 pt-3.5 pb-2'

const TOKEN: Record<string, string> = {
  key: 'text-pl-st-ambiguous',
  string: 'text-pl-st-rule',
  number: 'text-pl-st-hypothesis',
  comment: 'text-pl-muted italic',
  punct: 'text-pl-fg',
  plain: '',
}

function applyFix() {
  fixed.value = true
  draft('Тип поля изменён на i32be — перепроверьте на корпусе')
}
</script>

<template>
  <div class="flex h-full">
    <ShellSidePanel id="interp-tree" title="Структура" :subtitle="view ? `rev ${view.rev}` : ''" :width="260">
      <ul v-if="view" class="pl-scroll m-0 flex-1 list-none px-0 py-2">
        <InterpTreeNode v-for="(n, k) in view.tree" :key="k" :node="n" :depth="0" />
      </ul>
    </ShellSidePanel>

    <section class="flex min-w-0 flex-1 flex-col">
      <CommonPanelHeader title="interpretation.yaml" :subtitle="view?.dirty || fixed ? 'изменено · не сохранено в ревизию' : 'сохранено'">
        <div class="pl-seg" role="radiogroup" aria-label="Вид">
          <button type="button" role="radio" :aria-checked="mode === 'yaml'" @click="mode = 'yaml'">YAML</button>
          <button type="button" role="radio" :aria-checked="mode === 'form'" @click="mode = 'form'">Форма</button>
        </div>
        <button v-if="view" class="pl-btn pl-btn-primary h-7" type="button" @click="draft(`Ревизия rev ${view.rev + 1} сохранена`)">Сохранить rev {{ view.rev + 1 }}</button>
      </CommonPanelHeader>
      <CommonAsyncState :pending="pending" :error="error?.message" :empty="!view" @retry="refresh()">
        <div v-if="mode === 'yaml'" class="pl-scroll flex-1 py-2 font-mono text-[12.5px] leading-[21px]" role="listbox" aria-label="Строки интерпретации">
          <div
            v-for="l in lines"
            :key="l.n"
            class="flex cursor-text whitespace-pre hover:bg-pl-raise"
            :class="[l.n === selectedLine && 'bg-pl-raise', l.mark === 'violation' && 'bg-pl-st-violation/10']"
            role="option"
            :aria-selected="l.n === selectedLine"
            @click="selectedLine = l.n"
          >
            <span class="grid w-[22px] place-items-center">
              <UIcon v-if="l.mark" :name="STATUS[l.mark].icon" class="size-3" :style="{ color: STATUS[l.mark].color }" :aria-label="STATUS[l.mark].label" />
            </span>
            <span class="w-[34px] pr-3.5 text-right text-pl-muted">{{ l.n }}</span>
            <span><span v-for="(t, j) in l.tokens" :key="j" :class="TOKEN[t.kind]">{{ t.text }}</span></span>
          </div>
        </div>
        <div v-else class="p-4 text-pl-muted">
          Форма редактирования полей строится по той же структуре; пока доступен вид YAML.
        </div>
      </CommonAsyncState>
    </section>

    <ShellInspectorContent :title="selectedLine ? `Строка ${selectedLine}` : 'Предпросмотр'">
      <div v-if="view" class="pl-scroll flex-1">
        <h3 :class="cap">Предпросмотр · поток {{ view.preview.stream }}</h3>
        <dl class="pl-dl">
          <template v-for="r in view.preview.rows" :key="r.label">
            <dt>{{ r.label }}</dt><dd>{{ r.value }}</dd>
          </template>
        </dl>
        <h3 :class="cap">Поле в строке {{ view.field.line }}</h3>
        <dl class="pl-dl">
          <dt>Статус</dt><dd><CommonStatusBadge :status="view.field.status" /> → {{ view.field.ref }}</dd>
          <dt>Проверка</dt>
          <dd>
            <CommonStatusBadge v-if="!fixed" status="violation" :label="`${view.field.counterexamples} контрпример`" />
            <CommonStatusBadge v-else status="stale" label="нужна перепроверка" />
          </dd>
          <dt>Где</dt><dd>{{ view.field.where }}</dd>
        </dl>
        <h3 :class="cap">Быстрое исправление</h3>
        <div class="px-3">
          <button class="pl-btn" type="button" :disabled="fixed" @click="applyFix">{{ view.quickFix.label }}</button>
          <p class="mt-2 text-pl-muted">{{ view.quickFix.note }}</p>
        </div>
      </div>
    </ShellInspectorContent>
  </div>
</template>
