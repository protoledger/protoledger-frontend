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
    error.value = e instanceof Error ? e.message : tr('verify.graph.failed')
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
const name = (id: string) => (id === '?' ? tr('verify.typeUnknown') : id)

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
      <h3 class="pl-caption m-0">{{ tr('verify.graph.title') }}</h3>
      <button class="pl-btn h-7" type="button" :disabled="pending" @click="build">{{ pending ? tr('verify.graph.building') : graph ? tr('verify.graph.rebuild') : tr('verify.graph.build') }}</button>
      <button v-if="graph" class="pl-btn pl-btn-ghost h-7" type="button" :title="tr('verify.graph.dotTitle')" @click="copyDot">{{ copied ? tr('common.copied') : tr('verify.graph.copyDot') }}</button>
    </div>
    <p v-if="error" class="m-0 mt-2 text-pl-muted" role="alert">{{ safeText(error) }}</p>
    <template v-if="graph && layout">
      <p class="m-0 mt-2 text-pl-muted">
        {{ tr('verify.graph.connections', { n: formatCount(graph.connections) }) }} · {{ tr('verify.msgCount', { n: formatCount(graph.messages) }) }}
        <template v-if="graph.unanswered"> · {{ tr('verify.graph.unanswered', { n: formatCount(graph.unanswered) }) }}</template>
        <template v-if="graph.unsolicited"> · {{ tr('verify.graph.unsolicited', { n: formatCount(graph.unsolicited) }) }}</template>
        · {{ tr('verify.graph.observed') }}
      </p>
      <p v-if="!graph.nodes.length" class="m-0 mt-2 text-pl-muted">{{ tr('verify.graph.noTypes') }}</p>
      <div v-else class="mt-2 overflow-x-auto">
        <svg :width="W" :height="layout.height" :viewBox="`0 0 ${W} ${layout.height}`" role="img" :aria-label="tr('verify.graph.aria')">
          <line v-for="e in layout.edges" :key="`${e.from}-${e.to}`" :x1="e.x1" :y1="e.y1" :x2="e.x2" :y2="e.y2" stroke="var(--pl-st-rule)" :stroke-width="e.width" stroke-opacity="0.8" />
          <g v-for="n in [...layout.left, ...layout.right]" :key="n.id">
            <rect :x="layout.pos.get(n.id)!.x" :y="layout.pos.get(n.id)!.y" :width="NODE_W" height="24" rx="3" fill="var(--pl-raise)" stroke="var(--pl-line)" />
            <text :x="layout.pos.get(n.id)!.x + 8" :y="layout.pos.get(n.id)!.y + 16" :style="text">
              {{ safeText(name(n.id)).slice(0, 18) }}<tspan dx="6" style="fill: var(--pl-muted)">{{ n.requests >= n.responses ? n.requests : n.responses }}</tspan>
            </text>
          </g>
        </svg>
      </div>
      <div v-if="graph.answers.length || graph.next.length || graph.starts.length" class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <template v-if="graph.answers.length">
          <span class="text-pl-muted">{{ tr('verify.graph.answers') }}</span>
          <span class="font-mono text-xs">{{ graph.answers.map(e => `${name(e.from)} → ${name(e.to)} ×${e.count}`).join(' · ') }}</span>
        </template>
        <template v-if="graph.starts.length">
          <span class="text-pl-muted">{{ tr('verify.graph.starts') }}</span>
          <span class="font-mono text-xs">{{ graph.starts.map(e => `${name(e.to)} ×${e.count}`).join(' · ') }}</span>
        </template>
        <template v-if="graph.next.length">
          <span class="text-pl-muted">{{ tr('verify.graph.next') }}</span>
          <span class="font-mono text-xs">{{ graph.next.slice(0, 12).map(e => `${name(e.from)} → ${name(e.to)} ×${e.count}`).join(' · ') }}</span>
        </template>
      </div>
      <p v-if="graph.truncated" class="m-0 mt-1 text-xs text-pl-muted">{{ tr('verify.graph.truncated') }}</p>
      <p v-if="graph.incomplete" class="m-0 mt-1 text-xs text-pl-st-hypothesis">{{ tr('verify.graph.incomplete') }}</p>
    </template>
  </div>
</template>
