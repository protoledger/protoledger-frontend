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
async function restoreFromQuery() {
  const id = typeof route.query.conn === 'string' ? route.query.conn : null
  if (!id || connection.value?.id === id) return
  const page = await data.listConnections({ limit: 500 })
  const found = page.items.find(c => c.id === id)
  if (found) select(found, false)
  const from = Number(route.query.from)
  const to = Number(route.query.to)
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
    selection.range = { start: from, end: to }
    await nextTick()
    hex.value?.scrollIntoView(from)
  }
}
onMounted(restoreFromQuery)

function select(c: Connection, resetRange = true) {
  connection.value = c
  if (!c.streams.some(s => s.id.endsWith(`:${dir.value}`))) dir.value = 'ab'
  selection.selectStream(c.id, stream.value?.id ?? '')
  if (!resetRange) return
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
  <div class="ov">
    <OverviewConnectionList class="ov__col" :selected-id="connection?.id ?? null" @select="select" />

    <section class="ov__col ov__stream">
      <CommonPanelHeader
        :title="connection ? `Поток ${connection.id.split(':')[1]}` : 'Поток'"
        :subtitle="stream ? `собран по seq · ${formatCount(stream.length)} байт${stream.startAvailable ? '' : ' · начало не захвачено'}` : ''"
      >
        <div v-if="connection" class="dir" role="radiogroup" aria-label="Направление">
          <button v-for="d in (['ab', 'ba'] as const)" :key="d" type="button" role="radio" :aria-checked="dir === d" @click="dir = d">{{ roleLabel[d] }}</button>
        </div>
      </CommonPanelHeader>
      <template v-if="stream">
        <OverviewSegmentMap :stream="stream" :segments="segments" @jump="jump" />
        <p v-if="error" class="p-3 text-[var(--pl-st-violation)]" role="alert">{{ error }}</p>
        <div class="flex-1 min-h-0">
          <OverviewHexView ref="hex" v-model:range="range" :stream="stream" :at="at" :ensure="ensure" />
        </div>
      </template>
      <p v-else class="p-4 text-[var(--pl-muted)]">Выберите соединение слева.</p>
    </section>

    <OverviewSelectionPanel class="ov__col" :range="range" :at="at" />
  </div>
</template>

<style scoped>
.ov {
  display: grid;
  grid-template-columns: minmax(330px, 30%) minmax(560px, 1fr) 340px;
  height: 100%;
}

.ov__col {
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--pl-line);
}

.ov__col:last-child {
  border-right: 0;
}

.ov__stream {
  display: flex;
  flex-direction: column;
}

.dir {
  display: inline-flex;
  border: 1px solid var(--pl-line);
  border-radius: 4px;
  overflow: hidden;
}

.dir button {
  padding: 4px 12px;
  color: var(--pl-muted);
}

.dir button[aria-checked="true"] {
  background: var(--pl-wine);
  color: #fff;
}
</style>
