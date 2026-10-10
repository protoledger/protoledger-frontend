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
  return {
    'hex__b--sel': selected(cell.offset),
    'hex__b--gap': st === 'gap',
    'hex__b--amb': st === 'ambiguous',
    'hex__b--dup': cell.info?.segment.frames.some(f => f.duplicate),
    'hex__b--seg': cell.info?.segmentStart && cell.offset % ROW !== 0,
    'hex__b--msg': props.messageStarts?.has(cell.offset),
  }
}
</script>

<template>
  <div
    ref="viewport"
    class="hex pl-scroll"
    tabindex="0"
    role="grid"
    aria-label="Байты потока: стрелки — перемещение, Shift — расширить выделение"
    @scroll="scrollTop = ($event.target as HTMLElement).scrollTop"
    @keydown="onKey"
    @mouseup="dragging = false"
    @mouseleave="dragging = false"
  >
    <div class="hex__space" :style="{ height: `${rowCount * ROW_H}px` }">
      <div class="hex__rows" :style="{ transform: `translateY(${firstRow * ROW_H}px)` }">
        <div v-for="row in rows" :key="row.index" class="hex__row" role="row">
          <span class="hex__off">{{ hexOffset(row.start, offsetWidth) }}</span>
          <template v-if="row.gapRow">
            <span class="hex__gap" :class="{ 'hex__gap--label': row.gapStart }">
              <template v-if="row.gapStart && row.gapSegment">
                <CommonStatusBadge status="gap" />
                нет данных · {{ row.gapSegment.end - row.gapSegment.start }} байт ·
                [{{ row.gapSegment.start }}, {{ row.gapSegment.end }}) не захвачены
              </template>
            </span>
          </template>
          <template v-else>
            <span class="hex__bytes">
              <span
                v-for="c in row.cells"
                :key="c.offset"
                class="hex__b"
                :class="cellClass(c)"
                role="gridcell"
                :aria-selected="selected(c.offset)"
                @mousedown.prevent="onDown(c.offset, $event)"
                @mouseenter="onEnter(c.offset)"
              >{{ c.info ? (c.info.value === null ? '░░' : hexByte(c.info.value)) : '··' }}</span>
            </span>
            <span class="hex__ascii" aria-hidden="true">
              <span
                v-for="c in row.cells"
                :key="c.offset"
                :class="{ 'hex__a--sel': selected(c.offset), 'hex__a--gap': c.info?.segment.status === 'gap' }"
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

<style scoped>
.hex {
  position: relative;
  height: 100%;
  font: 12.5px/22px var(--font-mono);
  user-select: none;
}

.hex:focus-visible {
  outline-offset: -2px;
}

.hex__space {
  position: relative;
}

.hex__rows {
  position: absolute;
  inset: 0 0 auto;
  will-change: transform;
}

.hex__row {
  display: flex;
  height: 22px;
  padding: 0 12px;
  white-space: pre;
}

.hex__off {
  width: 72px;
  flex: none;
  color: var(--pl-muted);
}

.hex__bytes {
  display: grid;
  grid-template-columns: repeat(16, 26px);
  flex: none;
}

.hex__b {
  position: relative;
  padding: 0 3px;
  color: var(--pl-fg-strong);
  text-align: center;
  cursor: text;
}

.hex__b:hover {
  background: var(--pl-raise);
}

.hex__b--seg {
  box-shadow: inset 2px 0 0 var(--pl-wine-text);
}

.hex__b--msg {
  box-shadow: inset 2px 0 0 var(--pl-st-violation);
  color: var(--pl-st-hypothesis);
}

.hex__b--gap {
  color: var(--pl-st-gap);
}

.hex__b--amb {
  color: var(--pl-st-ambiguous);
  text-decoration: underline dotted;
}

.hex__b--dup::after {
  position: absolute;
  top: 2px;
  right: 1px;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--pl-st-hypothesis);
  content: "";
}

.hex__b--sel {
  background: var(--pl-wine);
  color: #fff;
}

.hex__b--sel:hover {
  background: var(--pl-wine);
}

.hex__ascii {
  margin-left: 20px;
  color: var(--pl-muted);
  letter-spacing: 0.25em;
}

.hex__a--sel {
  background: var(--pl-wine);
  color: #fff;
}

.hex__a--gap {
  background: repeating-linear-gradient(135deg, transparent 0 3px, var(--pl-raise) 3px 5px);
}

.hex__gap {
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(16 * 26px + 20px + 16 * 1.25em);
  padding: 0 10px;
  border-right: 1px dashed var(--pl-st-gap);
  border-left: 1px dashed var(--pl-st-gap);
  background: repeating-linear-gradient(135deg, transparent 0 4px, var(--pl-panel) 4px 7px);
  color: var(--pl-muted);
  font-family: var(--font-sans);
  font-size: 12px;
}

.hex__gap--label {
  border-top: 1px dashed var(--pl-st-gap);
}
</style>
