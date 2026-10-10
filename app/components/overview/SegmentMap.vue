<script setup lang="ts">
import type { Segment, StreamSummary } from '~/api/types'

const props = defineProps<{ stream: StreamSummary, segments: Segment[] }>()
const emit = defineEmits<{ jump: [offset: number] }>()

const parts = computed(() => props.segments.map((s, i) => ({
  left: (s.start / props.stream.length) * 100,
  width: Math.max(0.15, ((s.end - s.start) / props.stream.length) * 100),
  cls: s.status === 'gap' ? 'map__p--gap' : s.status === 'ambiguous' ? 'map__p--amb' : s.frames.some(f => f.duplicate) ? 'map__p--dup' : i % 2 ? 'map__p--a' : 'map__p--b',
  start: s.start,
  title: `${s.start}–${s.end - 1}: ${s.status === 'gap' ? 'дыра' : s.status === 'ambiguous' ? 'неоднозначно' : `кадр ${s.frames[0]?.frameNo ?? '?'}`}`,
})))
</script>

<template>
  <div class="map">
    <div class="map__bar" role="img" :aria-label="`Карта потока: ${stream.gapBytes} байт в дырах, ${stream.ambiguousBytes} неоднозначных`">
      <button v-for="p in parts" :key="p.start" class="map__p" :class="p.cls" :style="{ left: `${p.left}%`, width: `${p.width}%` }" :title="p.title" type="button" tabindex="-1" @click="emit('jump', p.start)" />
    </div>
    <div class="map__legend">
      <span>0</span>
      <span>сегменты TCP · <i class="map__k map__k--gap" /> дыра · <i class="map__k map__k--amb" /> неоднозначно · <i class="map__k map__k--dup" /> повтор · загружено по мере прокрутки</span>
      <span>{{ stream.length }}</span>
    </div>
  </div>
</template>

<style scoped>
.map {
  padding: 8px 12px 6px;
  border-bottom: 1px solid var(--pl-line);
}

.map__bar {
  position: relative;
  height: 12px;
  background: var(--pl-panel);
}

.map__p {
  position: absolute;
  top: 0;
  bottom: 0;
}

.map__p--a {
  background: #3d5a4b;
}

.map__p--b {
  background: #4e7461;
}

.map__p--gap,
.map__k--gap {
  background: repeating-linear-gradient(135deg, transparent 0 3px, var(--pl-st-gap) 3px 5px);
}

.map__p--amb,
.map__k--amb {
  background: var(--pl-st-ambiguous);
}

.map__p--dup,
.map__k--dup {
  background: var(--pl-st-hypothesis);
}

.map__legend {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  color: var(--pl-muted);
  font-size: 11px;
}

.map__k {
  display: inline-block;
  width: 10px;
  height: 8px;
  vertical-align: middle;
}
</style>
