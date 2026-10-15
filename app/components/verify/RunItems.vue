<script setup lang="ts">
import type { RunItemPage } from '~/api/types'
import type { ResultCategory } from '~/data/views'
import { formatCount } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'

// Все сообщения корпуса прогона с категорией: от сводки — к конкретным байтам.
const props = defineProps<{ runId: string, categories: { key: ResultCategory, label: string, count: number }[] }>()

type Category = RunItemPage['items'][number]['category']
const API_CATEGORIES: Category[] = ['matched', 'violated', 'incomplete', 'ambiguous', 'unmatched', 'limit_exceeded']

const data = useData()
const project = useProjectStore()
const open = ref(false)
const category = ref<Category | ''>('')
const messageId = ref('')
const page = ref<RunItemPage | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)

const options = computed(() => props.categories.filter(c => c.count && (API_CATEGORIES as string[]).includes(c.key)))

async function load(more = false) {
  pending.value = true
  error.value = null
  try {
    const next = await data.getRunItems(props.runId, { category: category.value || undefined, messageId: messageId.value.trim() || undefined, offset: more ? page.value?.items.length ?? 0 : 0 })
    page.value = more && page.value ? { ...next, items: [...page.value.items, ...next.items] } : next
  }
  catch (e) {
    page.value = null
    error.value = e instanceof Error ? e.message : tr('verify.items.loadFailed')
  }
  finally {
    pending.value = false
  }
}
watch(open, (v) => { if (v && !page.value) void load() })
watch(category, () => { if (open.value) void load() })

const STATUS: Record<string, { status: KnowledgeStatus, label: string }> = {
  matched: { status: 'rule', get label() { return tr('verify.cat.matched') } },
  violated: { status: 'violation', get label() { return tr('verify.cat.violated') } },
  incomplete: { status: 'gap', get label() { return tr('verify.cat.incomplete') } },
  ambiguous: { status: 'ambiguous', get label() { return tr('verify.cat.ambiguous') } },
  unmatched: { status: 'unknown', get label() { return tr('verify.cat.unmatched') } },
  limit_exceeded: { status: 'violation', get label() { return tr('verify.cat.limitExceeded') } },
}

function link(stream: string, start: number, end: number) {
  const cut = stream.lastIndexOf(':')
  return { path: '/overview', query: { conn: stream.slice(0, cut), dir: stream.slice(cut + 1), from: String(start), to: String(end) } }
}

// Номер соединения повторяется в каждой записи: показываем и запись (её sha256 начинается с префикса потока).
function where(stream: string) {
  const [prefix = '', conn, dir] = stream.split(':')
  const source = project.sources.length > 1 ? project.sources.find(s => s.sha256.startsWith(prefix))?.name : undefined
  return `${source ? `${source} · ` : ''}${conn} ${dir === 'ba' ? 'b→a' : 'a→b'}`
}
</script>

<template>
  <details class="mt-5" :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary class="pl-caption cursor-pointer">{{ tr('verify.items.title') }}</summary>
    <form class="mt-2 flex flex-wrap items-center gap-2" @submit.prevent="load()">
      <select v-model="category" class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg" :aria-label="tr('verify.col.category')">
        <option value="">{{ tr('verify.items.allCategories') }}</option>
        <option v-for="c in options" :key="c.key" :value="c.key">{{ c.label }} · {{ formatCount(c.count) }}</option>
      </select>
      <input v-model="messageId" class="h-7 w-48 rounded border border-pl-line bg-pl-raise px-2 font-mono text-pl-fg-strong" :placeholder="tr('verify.items.typePlaceholder')" :aria-label="tr('verify.items.messageType')">
      <button class="pl-btn h-7" type="submit" :disabled="pending">{{ tr('verify.show') }}</button>
      <span v-if="page" class="text-pl-muted">{{ tr('verify.msgCount', { n: formatCount(page.total) }) }}</span>
    </form>
    <p v-if="error" class="m-0 mt-2 text-pl-st-violation" role="alert">{{ safeText(error) }}</p>
    <table v-if="page?.items.length" class="pl-table mt-2">
      <thead><tr><th>{{ tr('verify.col.stream') }}</th><th>{{ tr('verify.col.bytes') }}</th><th>{{ tr('verify.col.type') }}</th><th>{{ tr('verify.col.category') }}</th></tr></thead>
      <tbody>
        <tr v-for="it in page.items" :key="`${it.stream}-${it.start}`">
          <td class="whitespace-nowrap">{{ safeText(where(it.stream)) }}</td>
          <td><NuxtLink :to="link(it.stream, it.start, it.end)" class="font-mono text-pl-wine-text hover:underline">[{{ it.start }}, {{ it.end }})</NuxtLink></td>
          <td class="font-mono">{{ it.messageId ? safeText(it.messageId) : tr('verify.typeUnknown') }}</td>
          <td><CommonStatusBadge :status="STATUS[it.category]?.status ?? 'unknown'" :label="STATUS[it.category]?.label ?? it.category" /></td>
        </tr>
      </tbody>
    </table>
    <p v-else-if="page" class="m-0 mt-2 text-pl-muted">{{ tr('verify.items.noMessages') }}</p>
    <button v-if="page && page.items.length < page.total" class="pl-btn pl-btn-ghost mt-2" type="button" :disabled="pending" @click="load(true)">
      {{ tr('common.showMore', { n: formatCount(page.total - page.items.length) }) }}
    </button>
  </details>
</template>
