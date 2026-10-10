import type { Connection, StreamSummary } from '~/api/types'

/** Поток, выбранный в «Обзоре»; если ничего не выбрано — первое соединение порта 5020 с данными. */
export function useCurrentStream() {
  const data = useData()
  const selection = useSelectionStore()
  const connection = ref<Connection | null>(null)
  const stream = ref<StreamSummary | null>(null)

  async function resolve() {
    const page = await data.listConnections({ limit: 500 })
    const conn = page.items.find(c => c.id === selection.connectionId)
      ?? page.items.find(c => c.b.port === 5020 && c.flags.includes('gaps'))
      ?? page.items[0]
      ?? null
    connection.value = conn
    stream.value = conn?.streams.find(s => s.id === selection.streamId) ?? conn?.streams[0] ?? null
    if (conn && stream.value && selection.streamId !== stream.value.id) selection.selectStream(conn.id, stream.value.id)
  }

  onMounted(resolve)
  return { connection, stream }
}
