import type { Connection, StreamSummary } from '~/api/types'

/** Поток, выбранный в «Обзоре»; если ничего не выбрано — первое соединение с данными. */
export function useCurrentStream() {
  const data = useData()
  const selection = useSelectionStore()
  const connection = ref<Connection | null>(null)
  const stream = ref<StreamSummary | null>(null)

  async function resolve() {
    // Выбранное соединение — по id (оно может быть дальше первой страницы), иначе первое с данными.
    const chosen = selection.connectionId ? await data.getConnection(selection.connectionId) : null
    const conn = chosen ?? (await data.listConnections({ limit: 50 })).items.find(c => c.streams.some(s => s.dataBytes > 0)) ?? null
    connection.value = conn
    stream.value = conn?.streams.find(s => s.id === selection.streamId) ?? conn?.streams[0] ?? null
    if (conn && stream.value && selection.streamId !== stream.value.id) selection.selectStream(conn.id, stream.value.id)
  }

  onMounted(resolve)
  return { connection, stream }
}
