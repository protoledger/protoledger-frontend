<script setup lang="ts">
import type { Frame } from '~/api/types'
import type { ByteInfo } from '~/composables/useStreamBytes'
import { base64ToBytes, formatCount, hexByte, readUint } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'

const props = defineProps<{ range: { start: number, end: number } | null, at: (offset: number) => ByteInfo | null }>()

const data = useData()
const project = useProjectStore()
const frame = ref<Frame | null>(null)
const frameError = ref<string | null>(null)
const showFrame = ref(false)

const first = computed(() => (props.range ? props.at(props.range.start) : null))
const bytes = computed(() => {
  if (!props.range) return []
  const out: number[] = []
  for (let i = props.range.start; i < Math.min(props.range.end, props.range.start + 64); i++) {
    const v = props.at(i)?.value
    if (v === null || v === undefined) return null
    out.push(v)
  }
  return out
})
const asNumber = computed(() => {
  if (!bytes.value || !bytes.value.length || bytes.value.length > 8) return null
  const b = Uint8Array.from(bytes.value)
  return { be: readUint(b, false), le: readUint(b, true) }
})
const length = computed(() => (props.range ? props.range.end - props.range.start : 0))
const primaryFrame = computed(() => first.value?.segment.frames.find(f => !f.duplicate) ?? first.value?.segment.frames[0] ?? null)
const duplicates = computed(() => first.value?.segment.frames.filter(f => f.duplicate) ?? [])

watch(primaryFrame, async (ref) => {
  frame.value = null
  frameError.value = null
  if (!ref) return
  try {
    frame.value = await data.getFrame(ref.source, ref.frameNo)
  }
  catch (e) {
    frameError.value = e instanceof Error ? e.message : 'Кадр не загрузился'
  }
}, { immediate: true })

const offsetInFrame = computed(() => {
  if (!frame.value?.payload || !first.value || !props.range) return null
  return frame.value.payload.offset + (props.range.start - (frame.value.streamRange?.start ?? first.value.segment.start))
})

const segStatus = computed<{ status: KnowledgeStatus, label: string }>(() => {
  const st = first.value?.segment.status
  if (st === 'gap') return { status: 'gap', label: 'дыра' }
  if (st === 'ambiguous') return { status: 'ambiguous', label: 'неоднозначно' }
  return { status: 'rule', label: 'данные' }
})

const variants = computed(() => first.value?.segment.variants?.map(v => ({
  bytes: Array.from(base64ToBytes(v.data).slice(0, 8)).map(hexByte).join(' '),
  frames: v.frames.map(f => f.frameNo).join(', '),
})) ?? [])

function time(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleTimeString('ru-RU', { timeZone: 'UTC' })}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <CommonPanelHeader title="Выделение" :subtitle="range ? `${length} байт` : 'ничего не выбрано'" />
    <div class="pl-scroll flex-1">
      <p v-if="!range" class="m-3.5 text-pl-muted">Выберите байты в потоке: щелчок, протяжка мышью или Shift+стрелки.</p>
      <template v-else>
        <dl class="pl-dl grid-cols-[130px_minmax(0,1fr)]">
          <dt>Смещение</dt><dd>[{{ range.start }}, {{ range.end }})</dd>
          <dt>Кадр</dt><dd>{{ primaryFrame ? `№ ${formatCount(primaryFrame.frameNo)}` : '—' }}</dd>
          <dt>Запись</dt><dd class="truncate">{{ primaryFrame ? project.sourceName(primaryFrame.source) : '—' }}</dd>
          <dt>Время захвата</dt><dd>{{ frame ? time(frame.time) : '—' }}</dd>
          <dt>Смещение в кадре</dt><dd>{{ offsetInFrame ?? '—' }}</dd>
        </dl>

        <h3 class="pl-caption m-0 border-t border-pl-line px-3.5 pt-2.5">Значение</h3>
        <dl v-if="bytes && bytes.length" class="pl-dl grid-cols-[130px_minmax(0,1fr)]">
          <dt>hex</dt><dd class="font-mono">{{ bytes.map(hexByte).join(' ') }}<span v-if="length > 64"> …</span></dd>
          <template v-if="asNumber">
            <dt>uint BE</dt><dd>{{ formatCount(asNumber.be) }}</dd>
            <dt>uint LE</dt><dd>{{ formatCount(asNumber.le) }}</dd>
          </template>
        </dl>
        <p v-else class="m-3.5 text-pl-muted">В выделении есть байты без данных — значение не вычисляется.</p>

        <h3 class="pl-caption m-0 border-t border-pl-line px-3.5 pt-2.5">Участок</h3>
        <div class="flex flex-col items-start gap-1.5 px-3.5 pt-2.5 pb-3.5 [&_p]:m-0">
          <CommonStatusBadge :status="segStatus.status" :label="segStatus.label" />
          <p v-if="first && first.segment.status !== 'gap'">
            Сегмент TCP из кадра {{ primaryFrame?.frameNo }}, байты потока {{ first.segment.start }}–{{ first.segment.end - 1 }}.
          </p>
          <p v-else-if="first">Данных нет: кадры этого участка не попали в запись. Дыра не заполняется.</p>
          <p v-for="d in duplicates" :key="d.frameNo" class="text-pl-muted">Повтор тех же байтов в кадре {{ d.frameNo }} — не задвоен.</p>
          <div v-if="variants.length" class="flex flex-col gap-0.5">
            <p>Варианты байтов при перекрытии (выбран политикой проекта — первый):</p>
            <p v-for="(v, i) in variants" :key="i" class="font-mono">{{ i + 1 }}. {{ v.bytes }} <span class="text-pl-muted">· кадр {{ v.frames }}</span></p>
          </div>
        </div>

        <div v-if="showFrame">
          <h3 class="pl-caption m-0 border-t border-pl-line px-3.5 pt-2.5">Кадр в записи</h3>
          <p v-if="frameError" role="alert">{{ frameError }}</p>
          <dl v-else-if="frame" class="pl-dl grid-cols-[130px_minmax(0,1fr)]">
            <dt>Номер</dt><dd>{{ frame.frameNo }} · {{ frame.capturedLength }} из {{ frame.originalLength }} байт</dd>
            <dt>Смещение в файле</dt><dd>{{ formatCount(frame.fileOffset) }}</dd>
            <template v-if="frame.ipv4">
              <dt>IPv4</dt><dd>{{ frame.ipv4.src }} → {{ frame.ipv4.dst }} · TTL {{ frame.ipv4.ttl }}</dd>
            </template>
            <template v-if="frame.tcp">
              <dt>TCP</dt><dd>{{ frame.tcp.srcPort }} → {{ frame.tcp.dstPort }} · {{ frame.tcp.flags.join(', ').toUpperCase() }}</dd>
              <dt>seq / ack</dt><dd>{{ frame.tcp.seq }} / {{ frame.tcp.ack }}</dd>
              <dt>Контрольная сумма</dt>
              <dd>
                <CommonStatusBadge :status="frame.tcp.checksum === 'ok' ? 'rule' : frame.tcp.checksum === 'bad' ? 'violation' : 'unknown'" :label="frame.tcp.checksum === 'ok' ? 'верна' : frame.tcp.checksum === 'bad' ? 'неверна' : 'не проверить'" />
              </dd>
            </template>
            <template v-if="frame.payload">
              <dt>Payload</dt><dd>с байта {{ frame.payload.offset }}, {{ frame.payload.length }} байт</dd>
            </template>
          </dl>
        </div>
      </template>
    </div>
    <footer class="flex gap-2 border-t border-pl-line px-3.5 py-2.5">
      <button class="pl-btn pl-btn-primary" type="button" disabled title="Наблюдения появятся вместе с эндпоинтом /api/observations">Наблюдение</button>
      <button class="pl-btn" type="button" :aria-pressed="showFrame" :disabled="!primaryFrame" @click="showFrame = !showFrame">Кадр в записи</button>
    </footer>
  </section>
</template>
