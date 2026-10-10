<script setup lang="ts">
import type { Segment, StreamSummary } from '~/api/types'

const props = defineProps<{ stream: StreamSummary, segments: Segment[] }>()
const emit = defineEmits<{ jump: [offset: number] }>()

const parts = computed(() => props.segments.map((s, i) => ({
  left: (s.start / props.stream.length) * 100,
  width: Math.max(0.15, ((s.end - s.start) / props.stream.length) * 100),
  cls: s.status === 'gap' ? 'bg-hatch-gap' : s.status === 'ambiguous' ? 'bg-pl-st-ambiguous' : s.frames.some(f => f.duplicate) ? 'bg-pl-st-hypothesis' : i % 2 ? 'bg-pl-st-rule/35' : 'bg-pl-st-rule/50',
  start: s.start,
  title: `${s.start}–${s.end - 1}: ${s.status === 'gap' ? 'дыра' : s.status === 'ambiguous' ? 'неоднозначно' : `кадр ${s.frames[0]?.frameNo ?? '?'}`}`,
})))

const key = 'inline-block h-2 w-2.5 align-middle'
</script>

<template>
  <div class="border-b border-pl-line px-3 pt-2 pb-1.5">
    <div class="relative h-3 bg-pl-panel" role="img" :aria-label="`Карта потока: ${stream.gapBytes} байт в дырах, ${stream.ambiguousBytes} неоднозначных`">
      <button v-for="p in parts" :key="p.start" class="absolute inset-y-0" :class="p.cls" :style="{ left: `${p.left}%`, width: `${p.width}%` }" :title="p.title" type="button" tabindex="-1" @click="emit('jump', p.start)" />
    </div>
    <div class="mt-1 flex justify-between text-[11px] text-pl-muted">
      <span>0</span>
      <span>
        сегменты TCP · <i :class="key" class="bg-hatch-gap" /> дыра · <i :class="key" class="bg-pl-st-ambiguous" /> неоднозначно ·
        <i :class="key" class="bg-pl-st-hypothesis" /> повтор · загружено по мере прокрутки
      </span>
      <span>{{ stream.length }}</span>
    </div>
  </div>
</template>
