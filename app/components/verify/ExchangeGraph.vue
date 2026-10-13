<script setup lang="ts">
import type { ExchangeGraph } from '~/api/types'
import { formatCount } from '~/utils/bytes'

// Наблюдаемое поведение на записях: кто чем отвечает и что идёт следом. Это не заявленный автомат состояний.
const data = useData()
const graph = ref<ExchangeGraph | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)
const copied = ref(false)

async function build() {
  pending.value = true
  error.value = null
  try {
    graph.value = await data.getExchangeGraph()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось построить граф'
  }
  finally {
    pending.value = false
  }
}

async function copyDot() {
  if (!graph.value) return
  try {
    await navigator.clipboard.writeText(graph.value.dot)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  }
  catch {
    copied.value = false
  }
}

const ROW = 34
const W = 560
const NODE_W = 190
const name = (id: string) => (id === '?' ? 'тип не определён' : id)

// Запросы слева, ответы справа; рёбра «запрос → ответ» — линии, толщина по числу пар.
const layout = computed(() => {
  const g = graph.value
  if (!g) return null
  const left = g.nodes.filter(n => n.requests >= n.responses).sort((a, b) => b.requests - a.requests)
  const right = g.nodes.filter(n => n.requests < n.responses).sort((a, b) => b.responses - a.responses)
  const pos = new Map<string, { x: number, y: number }>()
  left.forEach((n, i) => pos.set(n.id, { x: 0, y: 8 + i * ROW }))
  right.forEach((n, i) => pos.set(n.id, { x: W - NODE_W, y: 8 + i * ROW }))
  const max = Math.max(1, ...g.answers.map(a => a.count))
  const edges = g.answers.flatMap((a) => {
    const from = pos.get(a.from)
    const to = pos.get(a.to)
    if (!from || !to) return []
    const x1 = from.x === 0 ? NODE_W : from.x
    const x2 = to.x === 0 ? NODE_W : to.x
    return [{ ...a, x1, y1: from.y + 12, x2, y2: to.y + 12, width: 1 + (a.count / max) * 3 }]
  })
  const height = 16 + Math.max(left.length, right.length, 1) * ROW
  return { left, right, pos, edges, height }
})

const text = 'fill: var(--pl-fg-strong); font: 12px var(--font-mono, monospace)'
</script>

<template>
  <div class="mt-5">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="pl-caption m-0">Граф обмена</h3>
      <button class="pl-btn h-7" type="button" :disabled="pending" @click="build">{{ pending ? 'Строю…' : graph ? 'Перестроить' : 'Построить' }}</button>
      <button v-if="graph" class="pl-btn pl-btn-ghost h-7" type="button" title="Тот же граф в формате Graphviz DOT" @click="copyDot">{{ copied ? 'скопировано' : 'Копировать DOT' }}</button>
    </div>
    <p v-if="error" class="m-0 mt-2 text-pl-muted" role="alert">{{ safeText(error) }}</p>
    <template v-if="graph && layout">
      <p class="m-0 mt-2 text-pl-muted">
        {{ formatCount(graph.connections) }} соед. · {{ formatCount(graph.messages) }} сообщ.
        <template v-if="graph.unanswered"> · запросов без ответа {{ formatCount(graph.unanswered) }}</template>
        <template v-if="graph.unsolicited"> · ответов без запроса {{ formatCount(graph.unsolicited) }}</template>
        · наблюдаемое поведение на записях, а не заявленный автомат.
      </p>
      <p v-if="!graph.nodes.length" class="m-0 mt-2 text-pl-muted">Типов сообщений нет — сначала опишите их в «Интерпретации».</p>
      <div v-else class="mt-2 overflow-x-auto">
        <svg :width="W" :height="layout.height" :viewBox="`0 0 ${W} ${layout.height}`" role="img" aria-label="Граф обмена: запросы слева, ответы справа, линии — чем отвечают">
          <g v-for="e in layout.edges" :key="`${e.from}-${e.to}`">
            <line :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" stroke="var(--pl-st-rule)" :stroke-width="e.width" />
            <text :x="(e.x1 + e.x2) / 2" :y="(e.y1 + e.y2) / 2 - 4" text-anchor="middle" style="fill: var(--pl-muted); font-size: 11px">×{{ e.count }}</text>
          </g>
          <g v-for="n in [...layout.left, ...layout.right]" :key="n.id">
            <rect :x="layout.pos.get(n.id)!.x" :y="layout.pos.get(n.id)!.y" :width="NODE_W" height="24" rx="3" fill="var(--pl-raise)" stroke="var(--pl-line)" />
            <text :x="layout.pos.get(n.id)!.x + 8" :y="layout.pos.get(n.id)!.y + 16" :style="text">
              {{ safeText(name(n.id)).slice(0, 18) }}<tspan style="fill: var(--pl-muted)"> {{ n.requests >= n.responses ? n.requests : n.responses }}</tspan>
            </text>
          </g>
        </svg>
      </div>
      <div v-if="graph.next.length || graph.starts.length" class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <template v-if="graph.starts.length">
          <span class="text-pl-muted">Начало</span>
          <span class="font-mono text-xs">{{ graph.starts.map(e => `${name(e.to)} ×${e.count}`).join(' · ') }}</span>
        </template>
        <template v-if="graph.next.length">
          <span class="text-pl-muted">Следом</span>
          <span class="font-mono text-xs">{{ graph.next.slice(0, 12).map(e => `${name(e.from)} → ${name(e.to)} ×${e.count}`).join(' · ') }}</span>
        </template>
      </div>
      <p v-if="graph.truncated" class="m-0 mt-1 text-xs text-pl-muted">Рёбер больше 200 — показаны самые частые.</p>
    </template>
  </div>
</template>
