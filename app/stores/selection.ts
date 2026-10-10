import { defineStore } from 'pinia'

/** Текущий якорь: поток, диапазон байтов [start, end) и кадр-источник. */
export const useSelectionStore = defineStore('selection', () => {
  const connectionId = ref<string | null>(null)
  const streamId = ref<string | null>(null)
  const range = ref<{ start: number, end: number } | null>(null)
  const frame = ref<{ source: string, frameNo: number } | null>(null)

  function selectStream(connection: string, stream: string) {
    connectionId.value = connection
    streamId.value = stream
    range.value = null
    frame.value = null
  }

  return { connectionId, streamId, range, frame, selectStream }
})
