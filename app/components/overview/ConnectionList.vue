<script setup lang="ts">
import type { Connection, ConnectionFlag } from '~/api/types'
import { formatCount } from '~/utils/bytes'
import { FLAG_STATUS } from '~/utils/status'

const props = defineProps<{ selectedId: string | null }>()
const emit = defineEmits<{ select: [connection: Connection] }>()

const data = useData()
const PAGE = 100

const port = ref<number | undefined>(undefined)
const flag = ref<ConnectionFlag | undefined>(undefined)
const items = ref<Connection[]>([])
const total = ref(0)
const pending = ref(false)
const error = ref<string | null>(null)

async function load(reset: boolean) {
  pending.value = true
  error.value = null
  try {
    const page = await data.listConnections({ port: port.value, flag: flag.value, limit: PAGE, offset: reset ? 0 : items.value.length })
    items.value = reset ? page.items : [...items.value, ...page.items]
    total.value = page.total
    if (reset && !props.selectedId && page.items[0]) emit('select', page.items.find(c => c.flags.includes('gaps')) ?? page.items[0])
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить соединения'
  }
  finally {
    pending.value = false
  }
}

watch([port, flag], () => load(true), { immediate: true })

const filterLabel = computed(() => {
  const parts = []
  if (port.value) parts.push(`порт ${port.value}`)
  if (flag.value) parts.push(FLAG_STATUS[flag.value]?.label ?? flag.value)
  return parts.length ? `фильтр: ${parts.join(', ')}` : 'все'
})

function short(id: string) {
  return id.split(':')[1] ?? id
}

const CLOSE: Record<Connection['close'], string> = { fin: 'FIN', rst: 'RST', open: 'не закрыто' }

const tag = 'rounded-[3px] border border-pl-line px-1.5 text-[11px] text-pl-muted'

function onKey(e: KeyboardEvent) {
  const i = items.value.findIndex(c => c.id === props.selectedId)
  const next = e.key === 'ArrowDown' ? items.value[i + 1] : e.key === 'ArrowUp' ? items.value[i - 1] : undefined
  if (next) {
    e.preventDefault()
    emit('select', next)
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <CommonPanelHeader title="Соединения" :subtitle="`${formatCount(total)} · ${filterLabel}`" />
    <div class="flex flex-wrap gap-1.5 border-b border-pl-line px-2.5 py-2">
      <button class="pl-chip" :aria-pressed="port === 5020" type="button" @click="port = port === 5020 ? undefined : 5020">Порт 5020</button>
      <button class="pl-chip" :aria-pressed="flag === 'gaps'" type="button" @click="flag = flag === 'gaps' ? undefined : 'gaps'">Есть дыры</button>
      <button class="pl-chip" :aria-pressed="flag === 'bad_checksum'" type="button" @click="flag = flag === 'bad_checksum' ? undefined : 'bad_checksum'">Плохой checksum</button>
    </div>
    <div class="pl-scroll flex-1" tabindex="0" aria-label="Список соединений: стрелки вверх и вниз" @keydown="onKey">
      <CommonAsyncState :pending="pending" :error="error" :empty="!items.length" empty-text="Соединений по фильтру нет." @retry="load(true)">
        <table class="pl-table">
          <thead><tr><th>№</th><th>A → B</th><th class="text-right">Кадры</th></tr></thead>
          <tbody>
            <tr v-for="c in items" :key="c.id" :aria-selected="c.id === selectedId" @click="emit('select', c)">
              <td class="w-16">{{ short(c.id) }}</td>
              <td>
                <div>{{ c.a.address }}:{{ c.a.port }} → {{ c.b.address }}:{{ c.b.port }}</div>
                <div class="mt-1 flex flex-wrap gap-1">
                  <CommonStatusBadge v-for="f in c.flags" :key="f" :status="FLAG_STATUS[f]?.status ?? 'unknown'" :label="FLAG_STATUS[f]?.label ?? f" />
                  <span :class="tag">{{ CLOSE[c.close] }}</span>
                  <span v-if="!c.rolesKnown" :class="tag">роли неизвестны</span>
                </div>
              </td>
              <td class="text-right whitespace-nowrap">{{ formatCount(c.frameCount) }}</td>
            </tr>
          </tbody>
        </table>
        <button v-if="items.length < total" class="pl-btn pl-btn-ghost m-3" type="button" :disabled="pending" @click="load(false)">
          Показать ещё ({{ formatCount(total - items.length) }})
        </button>
      </CommonAsyncState>
    </div>
  </section>
</template>
