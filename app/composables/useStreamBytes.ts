import type { Segment, StreamSummary } from '~/api/types'
import { base64ToBytes } from '~/utils/bytes'

export const BLOCK = 4096

export interface ByteInfo {
  value: number | null
  segment: Segment
  /** Первый байт TCP-сегмента: граница сегмента. */
  segmentStart: boolean
}

interface Block {
  bytes: (number | null)[]
  segments: Segment[]
  segIndex: Int32Array
}

/** Байты потока блоками по 4 КиБ, по требованию: поток в сотни МиБ не грузится целиком. */
export function useStreamBytes(stream: Ref<StreamSummary | null>) {
  const data = useData()
  const blocks = shallowRef(new Map<number, Block>())
  const loading = new Set<number>()
  const error = ref<string | null>(null)

  watch(stream, () => {
    blocks.value = new Map()
    loading.clear()
    error.value = null
  })

  async function ensure(from: number, to: number) {
    const s = stream.value
    if (!s) return
    const first = Math.floor(from / BLOCK)
    const last = Math.floor(Math.max(from, Math.min(to, s.length) - 1) / BLOCK)
    const wanted: number[] = []
    for (let b = first; b <= last; b++) if (!blocks.value.has(b) && !loading.has(b)) wanted.push(b)
    await Promise.all(wanted.map(b => load(s.id, b)))
  }

  async function load(id: string, b: number) {
    loading.add(b)
    try {
      const res = await data.getStreamBytes(id, b * BLOCK, BLOCK)
      if (stream.value?.id !== id) return
      const bytes: (number | null)[] = Array.from({ length: res.length }, () => null)
      const segIndex = new Int32Array(res.length)
      res.segments.forEach((seg, i) => {
        const raw = seg.data ? base64ToBytes(seg.data) : null
        for (let p = seg.start; p < seg.end; p++) {
          bytes[p - res.from] = raw ? (raw[p - seg.start] ?? null) : null
          segIndex[p - res.from] = i
        }
      })
      const next = new Map(blocks.value)
      next.set(b, { bytes, segments: res.segments, segIndex })
      blocks.value = next
    }
    catch (e) {
      error.value = e instanceof Error ? e.message : 'Не удалось загрузить байты потока'
    }
    finally {
      loading.delete(b)
    }
  }

  function at(offset: number): ByteInfo | null {
    const block = blocks.value.get(Math.floor(offset / BLOCK))
    if (!block) return null
    const i = offset % BLOCK
    const segment = block.segments[block.segIndex[i] ?? 0]
    if (!segment || i >= block.bytes.length) return null
    return { value: block.bytes[i] ?? null, segment, segmentStart: segment.start === offset }
  }

  /** Все загруженные участки, для карты потока. */
  const segments = computed(() => {
    const out: Segment[] = []
    for (const b of [...blocks.value.keys()].sort((x, y) => x - y)) {
      for (const seg of blocks.value.get(b)!.segments) {
        const prev = out.at(-1)
        if (prev && prev.end === seg.start && prev.status === seg.status && prev.frames[0]?.frameNo === seg.frames[0]?.frameNo) prev.end = seg.end
        else out.push({ ...seg })
      }
    }
    return out
  })

  return { ensure, at, segments, error, blocks }
}
