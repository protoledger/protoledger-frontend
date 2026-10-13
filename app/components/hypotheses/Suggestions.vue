<script setup lang="ts">
import type { Suggestion } from '~/api/types'
import type { SuggestionsView } from '~/data/views'

const open = defineModel<boolean>('open', { default: false })
// Утверждения уже созданных гипотез: ту же заготовку второй раз не принимаем.
const props = defineProps<{ existing: string[] }>()
const emit = defineEmits<{ accepted: [ids: string[]] }>()

const data = useData()
const draft = useDraftAction()
const workspace = useWorkspaceStore()
const view = ref<SuggestionsView | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)
const chosen = ref<number[]>([])
const busy = ref(false)
const failures = ref<string[]>([])

const key = (s: Suggestion) => `${s.messageId}·${s.param}`
const exists = (s: Suggestion) => props.existing.includes(s.hypothesis.statement)
// Тест без поля в описании проверять не на чем — такую заготовку сначала поддерживает правка описания.
const blocked = (s: Suggestion) => !s.field || exists(s)

async function load() {
  pending.value = true
  error.value = null
  failures.value = []
  try {
    view.value = await data.getSuggestions()
    chosen.value = view.value.items.flatMap((s, i) => (blocked(s) ? [] : [i]))
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось получить заготовки'
  }
  finally {
    pending.value = false
  }
}
watch(open, (v) => { if (v) void load() })

async function accept() {
  if (!view.value) return
  busy.value = true
  failures.value = []
  const ids: string[] = []
  for (const i of chosen.value) {
    const s = view.value.items[i]!
    try {
      const id = await data.acceptSuggestion(s)
      if (!id) {
        busy.value = false
        open.value = false
        return draft('Заготовки приняты')
      }
      ids.push(id)
      workspace.log(`Гипотеза ${id} из заготовки: ${s.hypothesis.statement}`)
    }
    catch (e) {
      failures.value.push(`${key(s)}: ${e instanceof Error ? e.message : 'не удалось принять'}`)
    }
  }
  busy.value = false
  if (ids.length) emit('accepted', ids)
  if (!failures.value.length) open.value = false
}
</script>

<template>
  <UModal v-model:open="open" title="Заготовки гипотез" description="Байты, совпавшие со значениями журнала действий: наблюдение и гипотеза с готовым тестом">
    <template #body>
      <p v-if="pending" class="m-0 text-pl-muted" aria-live="polite">Ищу связи байтов с журналом…</p>
      <p v-else-if="error" class="m-0 text-pl-st-violation" role="alert">{{ error }}</p>
      <template v-else-if="view">
        <p v-if="view.note" class="m-0 text-pl-muted">{{ view.note }}</p>
        <form v-else id="suggestions-form" class="flex flex-col gap-2.5" @submit.prevent="accept">
          <p class="m-0 text-pl-muted">Совпадение на примерах — основание для гипотезы, а не вывод: после принятия запустите проверку.</p>
          <label v-for="(s, i) in view.items" :key="key(s)" class="flex items-start gap-2 rounded border border-pl-line p-2.5" :class="{ 'opacity-70': blocked(s) }">
            <input v-model="chosen" type="checkbox" :value="i" :disabled="blocked(s)" class="mt-1">
            <span class="flex min-w-0 flex-col gap-1">
              <span class="flex flex-wrap items-center gap-1.5">
                <span class="font-mono">{{ safeText(s.messageId) }}</span>
                <span class="text-pl-muted">↔ {{ safeText(s.param) }}</span>
                <CommonStatusBadge status="hypothesis" :label="`${s.matches} / ${s.samples}`" />
                <span v-if="exists(s)" class="text-xs text-pl-muted">уже есть</span>
              </span>
              <span>{{ safeText(s.hypothesis.statement) }}</span>
              <span class="font-mono text-xs break-words text-pl-muted">{{ safeText(s.hypothesis.test) }}</span>
              <span v-if="!s.field && s.newField" class="text-xs">
                Сначала добавьте в описание поле <span class="font-mono">{{ safeText(s.newField.name) }}</span> ({{ s.newField.type }} с байта {{ s.newField.at }})
                — <NuxtLink to="/interpretation" class="text-pl-wine-text hover:underline">в редактор</NuxtLink>
              </span>
            </span>
          </label>
          <p v-if="view.truncated" class="m-0 text-xs text-pl-muted">Показаны не все связи: часть сообщений не вошла в анализ (предел).</p>
          <ul v-if="failures.length" class="m-0 list-none p-0 text-pl-st-violation" role="alert">
            <li v-for="f in failures" :key="f">{{ safeText(f) }}</li>
          </ul>
        </form>
      </template>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2.5">
        <button class="pl-btn" type="button" @click="open = false">Отмена</button>
        <button v-if="view && !view.note" class="pl-btn pl-btn-primary" type="submit" form="suggestions-form" :disabled="busy || !chosen.length">
          {{ busy ? 'Принимаю…' : `Принять выбранные (${chosen.length})` }}
        </button>
      </div>
    </template>
  </UModal>
</template>
