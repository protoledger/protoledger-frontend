<script setup lang="ts">
import type { StreamSummary } from '~/api/types'
import { asciiChar, hexByte, hexOffset } from '~/utils/bytes'
import type { ByteInfo } from '~/composables/useStreamBytes'

const props = defineProps<{
  stream: StreamSummary
  at: (offset: number) => ByteInfo | null
  ensure: (from: number, to: number) => Promise<void>
  /** Начала сообщений для наложения границ (экран «Границы»). */
  messageStarts?: Set<number>
}>()
const range = defineModel<{ start: number, end: number } | null>('range', { default: null })

const ROW = 16
const ROW_H = 22
const OVERSCAN = 10

const viewport = ref<HTMLElement | null>(null)
const scrollTop = ref(0)
const height = ref(600)
const anchor = ref<number | null>(null)
const dragging = ref(false)

const rowCount = computed(() => Math.ceil(props.stream.length / ROW))
const firstRow = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_H) - OVERSCAN))
const lastRow = computed(() => Math.min(rowCount.value, Math.ceil((scrollTop.value + height.value) / ROW_H) + OVERSCAN))
const offsetWidth = computed(() => Math.max(4, props.stream.length.toString(16).length))

const rows = computed(() => {
  const out = []
  for (let r = firstRow.value; r < lastRow.value; r++) {
    const start = r * ROW
    const cells = []
    let gapCount = 0
    let loaded = true
    for (let i = start; i < Math.min(start + ROW, props.stream.length); i++) {
      const info = props.at(i)
      if (!info) loaded = false
      else if (info.segment.status === 'gap') gapCount++
      cells.push({ offset: i, info })
    }
    const gapRow = loaded && gapCount === cells.length
    // Подпись дыры — в первой строке, целиком попавшей в дыру.
    const gapStart = gapRow && (cells[0]?.info?.segment.start ?? 0) > start - ROW
    out.push({ index: r, start, cells, loaded, gapRow, gapStart, gapSegment: gapRow ? cells[0]?.info?.segment : undefined })
  }
  return out
})

watch([firstRow, lastRow, () => props.stream.id], () => {
  void props.ensure(firstRow.value * ROW, lastRow.value * ROW)
}, { immediate: true })

watch(() => props.stream.id, () => {
  if (viewport.value) viewport.value.scrollTop = 0
  scrollTop.value = 0
})

let observer: ResizeObserver | null = null
onMounted(() => {
  if (!viewport.value) return
  observer = new ResizeObserver(() => { height.value = viewport.value?.clientHeight ?? 600 })
  observer.observe(viewport.value)
})
onBeforeUnmount(() => observer?.disconnect())

function selected(offset: number) {
  return range.value !== null && offset >= range.value.start && offset < range.value.end
}

function select(offset: number, extend: boolean) {
  if (extend && anchor.value !== null) {
    range.value = { start: Math.min(anchor.value, offset), end: Math.max(anchor.value, offset) + 1 }
  }
  else {
    anchor.value = offset
    range.value = { start: offset, end: offset + 1 }
  }
}

function onDown(offset: number, e: MouseEvent) {
  viewport.value?.focus({ preventScroll: true })
  select(offset, e.shiftKey)
  dragging.value = true
}

function onEnter(offset: number) {
  if (dragging.value) select(offset, true)
}

function onKey(e: KeyboardEvent) {
  const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -ROW, ArrowDown: ROW }
  const d = step[e.key]
  if (d === undefined || !range.value) return
  e.preventDefault()
  const cur = e.shiftKey ? (range.value.start === anchor.value ? range.value.end - 1 : range.value.start) : range.value.start
  const next = Math.min(props.stream.length - 1, Math.max(0, cur + d))
  select(next, e.shiftKey)
  scrollIntoView(next)
}

function scrollIntoView(offset: number) {
  const el = viewport.value
  if (!el) return
  const top = Math.floor(offset / ROW) * ROW_H
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight
}

defineExpose({ scrollIntoView })

function cellClass(cell: { offset: number, info: ByteInfo | null }) {
  const st = cell.info?.segment.status
  const sel = selected(cell.offset)
  return [
    sel ? 'bg-pl-wine text-white' : 'hover:bg-pl-raise',
    !sel && st === 'gap' && 'text-pl-st-gap',
    !sel && st === 'ambiguous' && 'text-pl-st-ambiguous underline decoration-dotted',
    !sel && props.messageStarts?.has(cell.offset) && 'text-pl-st-hypothesis',
    props.messageStarts?.has(cell.offset) ? 'shadow-[inset_2px_0_0_var(--pl-st-violation)]' : cell.info?.segmentStart && cell.offset % ROW !== 0 && 'shadow-[inset_2px_0_0_var(--pl-wine-text)]',
    cell.info?.segment.frames.some(f => f.duplicate) && 'after:absolute after:top-0.5 after:right-px after:size-[3px] after:rounded-full after:bg-pl-st-hypothesis',
  ]
}
</script>

<template>
  <div
    ref="viewport"
    class="pl-scroll relative h-full font-mono text-[12.5px] leading-[22px] select-none focus-visible:-outline-offset-2"
    tabindex="0"
    role="grid"
    aria-label="Байты потока: стрелки — перемещение, Shift — расширить выделение"
    @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
    @keydown="onKey"
    @mouseup="dragging = false"
    @mouseleave="dragging = false"
  >
    <div class="relative" :style="{ height: `${rowCount * ROW_H}px` }">
      <div class="absolute inset-x-0 top-0 will-change-transform" :style="{ transform: `translateY(${firstRow * ROW_H}px)` }">
        <div v-for="row in rows" :key="row.index" class="flex h-[22px] px-3 whitespace-pre" role="row">
          <span class="w-[72px] flex-none text-pl-muted">{{ hexOffset(row.start, offsetWidth) }}</span>
          <span
            v-if="row.gapRow"
            class="bg-hatch flex w-[642px] items-center gap-2 border-x border-dashed border-pl-st-gap px-2.5 font-sans text-xs text-pl-muted"
            :class="{ 'border-t': row.gapStart }"
          >
            <template v-if="row.gapStart && row.gapSegment">
              <CommonStatusBadge status="gap" />
              нет данных · {{ row.gapSegment.end - row.gapSegment.start }} байт ·
              [{{ row.gapSegment.start }}, {{ row.gapSegment.end }}) не захвачены
            </template>
          </span>
          <template v-else>
            <span class="grid flex-none grid-cols-[repeat(16,26px)]">
              <span
                v-for="c in row.cells"
                :key="c.offset"
                class="relative cursor-text px-[3px] text-center text-pl-fg-strong"
                :class="cellClass(c)"
                role="gridcell"
                :aria-selected="selected(c.offset)"
                @mousedown.prevent="onDown(c.offset, $event)"
                @mouseenter="onEnter(c.offset)"
              >{{ c.info ? (c.info.value === null ? '░░' : hexByte(c.info.value)) : '··' }}</span>
            </span>
            <span class="ml-5 tracking-[0.25em] text-pl-muted" aria-hidden="true">
              <span
                v-for="c in row.cells"
                :key="c.offset"
                :class="{ 'bg-pl-wine text-white': selected(c.offset), 'bg-hatch': c.info?.segment.status === 'gap' }"
                @mousedown.prevent="onDown(c.offset, $event)"
                @mouseenter="onEnter(c.offset)"
              >{{ c.info && c.info.value !== null ? asciiChar(c.info.value) : ' ' }}</span>
            </span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>
