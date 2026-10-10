<script setup lang="ts">
import type { Connection } from '~/api/types'
import { formatCount } from '~/utils/bytes'

const route = useRoute()
const router = useRouter()
const selection = useSelectionStore()
const data = useData()

const connection = ref<Connection | null>(null)
const dir = ref<'ab' | 'ba'>(route.query.dir === 'ba' ? 'ba' : 'ab')
const stream = computed(() => connection.value?.streams.find(s => s.id.endsWith(`:${dir.value}`)) ?? null)
const { ensure, at, segments, error } = useStreamBytes(stream)
const hex = ref<{ scrollIntoView: (offset: number) => void } | null>(null)

const range = computed({
  get: () => selection.range,
  set: (v) => { selection.range = v },
})

// Якорь в адресе: ?conn=…&dir=ab&from=…&to=… — ссылка ведёт к тем же байтам.
// Запоминаем его до того, как список соединений выберет первое по умолчанию.
const initial = { ...route.query }
async function restoreFromQuery() {
  const id = typeof initial.conn === 'string' ? initial.conn : null
  if (!id) return
  const page = await data.listConnections({ limit: 500 })
  const found = page.items.find(c => c.id === id)
  if (!found) return
  select(found)
  const from = Number(initial.from)
  const to = Number(initial.to)
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
    await nextTick()
    selection.range = { start: from, end: to }
    hex.value?.scrollIntoView(from)
  }
}
onMounted(restoreFromQuery)

function select(c: Connection) {
  connection.value = c
  if (!c.streams.some(s => s.id.endsWith(`:${dir.value}`))) dir.value = 'ab'
  selection.selectStream(c.id, stream.value?.id ?? '')
}

watch([connection, dir, () => selection.range], () => {
  if (!connection.value) return
  if (stream.value) selection.streamId = stream.value.id
  const q: Record<string, string> = { conn: connection.value.id, dir: dir.value }
  if (selection.range) Object.assign(q, { from: String(selection.range.start), to: String(selection.range.end) })
  void router.replace({ query: q })
})

watch(dir, () => { selection.range = null })

const roleLabel = computed(() => {
  const c = connection.value
  if (!c) return { ab: 'a → b', ba: 'b → a' }
  return c.rolesKnown
    ? { ab: 'клиент → сервер', ba: 'сервер → клиент' }
    : { ab: `${c.a.port} → ${c.b.port}`, ba: `${c.b.port} → ${c.a.port}` }
})

function jump(offset: number) {
  selection.range = { start: offset, end: offset + 1 }
  hex.value?.scrollIntoView(offset)
}
</script>

<template>
  <div class="flex h-full">
    <ShellSidePanel id="overview-connections" title="Соединения" :width="420" :min="300">
      <OverviewConnectionList :selected-id="connection?.id ?? null" @select="select" />
    </ShellSidePanel>

    <section class="flex min-w-0 flex-1 flex-col">
      <CommonPanelHeader
        :title="connection ? `Поток ${connection.id.split(':')[1]}` : 'Поток'"
        :subtitle="stream ? `собран по seq · ${formatCount(stream.length)} байт${stream.startAvailable ? '' : ' · начало не захвачено'}` : ''"
      >
        <div v-if="connection" class="pl-seg" role="radiogroup" aria-label="Направление">
          <button v-for="d in (['ab', 'ba'] as const)" :key="d" type="button" role="radio" :aria-checked="dir === d" @click="dir = d">{{ roleLabel[d] }}</button>
        </div>
      </CommonPanelHeader>
      <template v-if="stream">
        <OverviewSegmentMap :stream="stream" :segments="segments" @jump="jump" />
        <p v-if="error" class="p-3 text-pl-st-violation" role="alert">{{ error }}</p>
        <div class="min-h-0 flex-1">
          <OverviewHexView ref="hex" v-model:range="range" :stream="stream" :at="at" :ensure="ensure" />
        </div>
      </template>
      <p v-else class="p-4 text-pl-muted">Выберите соединение слева.</p>
    </section>

    <ShellInspectorContent :title="range ? `Выделение · ${range.end - range.start} байт` : 'Выделение'">
      <OverviewSelectionPanel :range="range" :at="at" />
    </ShellInspectorContent>
  </div>
</template>
