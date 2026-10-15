<script setup lang="ts">
import { onWatcherCleanup } from 'vue'
import type { Frame } from '~/api/types'
import type { ByteInfo } from '~/composables/useStreamBytes'
import { base64ToBytes, formatCount, hexByte, readUint } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'

const props = defineProps<{ range: { start: number, end: number } | null, at: (offset: number) => ByteInfo | null }>()

const data = useData()
const project = useProjectStore()
const selection = useSelectionStore()
const workspace = useWorkspaceStore()
const draft = useDraftAction()
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

// Выделение меняется быстрее ответа — кадр показываем только для последнего.
watch(primaryFrame, async (ref) => {
  let stale = false
  onWatcherCleanup(() => { stale = true })
  frame.value = null
  frameError.value = null
  if (!ref) return
  try {
    const f = await data.getFrame(ref.source, ref.frameNo)
    if (!stale) frame.value = f
  }
  catch (e) {
    if (!stale) frameError.value = e instanceof Error ? e.message : tr('overview.frameNotLoaded')
  }
}, { immediate: true })

// Наблюдение — якорь на выделенные байты потока и комментарий исследователя.
const noting = ref(false)
const note = ref('')
const noteState = ref<{ ok: boolean, text: string } | null>(null)
watch(() => props.range, () => { noteState.value = null })

async function saveObservation() {
  const source = primaryFrame.value?.source
  if (!props.range || !selection.streamId || !source) return
  const { start, end } = props.range
  noteState.value = null
  try {
    const saved = await data.createObservation({ source, stream: selection.streamId, start, end }, note.value.trim() || tr('overview.obsDefault', { start, end }))
    if (!saved) return draft(tr('overview.observationCreated'))
    workspace.log(tr('overview.observationLogged', { start, end }))
    note.value = ''
    noting.value = false
    noteState.value = { ok: true, text: tr('overview.observationSaved') }
  }
  catch (e) {
    noteState.value = { ok: false, text: e instanceof Error ? e.message : tr('overview.observationFailed') }
  }
}

const offsetInFrame = computed(() => {
  if (!frame.value?.payload || !first.value || !props.range) return null
  return frame.value.payload.offset + (props.range.start - (frame.value.streamRange?.start ?? first.value.segment.start))
})

// offload — в поле только сумма псевдозаголовка (подсчёт на сетевой карте), байты при этом верны.
const CHECKSUM: Record<string, { status: KnowledgeStatus, label: string }> = {
  ok: { status: 'rule', get label() { return tr('overview.checksumOk') } },
  offload: { status: 'rule', get label() { return tr('overview.checksumOffload') } },
  bad: { status: 'violation', get label() { return tr('overview.checksumBad') } },
}

const segStatus = computed<{ status: KnowledgeStatus, label: string }>(() => {
  const st = first.value?.segment.status
  if (st === 'gap') return { status: 'gap', label: tr('status.gap') }
  if (st === 'ambiguous') return { status: 'ambiguous', label: tr('status.ambiguous') }
  return { status: 'rule', label: tr('overview.segmentData') }
})

const variants = computed(() => first.value?.segment.variants?.map(v => ({
  bytes: Array.from(base64ToBytes(v.data).slice(0, 8)).map(hexByte).join(' '),
  frames: v.frames.map(f => f.frameNo).join(', '),
})) ?? [])

function time(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleTimeString(intlLocale(), { timeZone: 'UTC' })}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col">
    <div class="pl-scroll flex-1">
      <p v-if="!range" class="m-3.5 text-pl-muted">{{ tr('overview.pickBytes') }}</p>
      <template v-else>
        <dl class="pl-dl grid-cols-[130px_minmax(0,1fr)]">
          <dt>{{ tr('overview.offset') }}</dt><dd>[{{ range.start }}, {{ range.end }})</dd>
          <dt>{{ tr('overview.frame') }}</dt><dd>{{ primaryFrame ? tr('overview.frameNumber', { n: formatCount(primaryFrame.frameNo) }) : '—' }}</dd>
          <dt>{{ tr('overview.capture') }}</dt><dd class="truncate">{{ primaryFrame ? safeText(project.sourceName(primaryFrame.source)) : '—' }}</dd>
          <dt>{{ tr('overview.captureTime') }}</dt><dd>{{ frame ? time(frame.time) : '—' }}</dd>
          <dt>{{ tr('overview.offsetInFrame') }}</dt><dd>{{ offsetInFrame ?? '—' }}</dd>
        </dl>

        <h3 class="pl-caption m-0 border-t border-pl-line px-3.5 pt-2.5">{{ tr('overview.value') }}</h3>
        <dl v-if="bytes && bytes.length" class="pl-dl grid-cols-[130px_minmax(0,1fr)]">
          <dt>hex</dt><dd class="font-mono">{{ bytes.map(hexByte).join(' ') }}<span v-if="length > 64"> …</span></dd>
          <template v-if="asNumber">
            <dt>uint BE</dt><dd>{{ formatCount(asNumber.be) }}</dd>
            <dt>uint LE</dt><dd>{{ formatCount(asNumber.le) }}</dd>
          </template>
        </dl>
        <p v-else class="m-3.5 text-pl-muted">{{ tr('overview.noValue') }}</p>

        <OverviewByteExplain v-if="selection.streamId" :stream="selection.streamId" :offset="range.start" />

        <h3 class="pl-caption m-0 border-t border-pl-line px-3.5 pt-2.5">{{ tr('overview.segmentHeading') }}</h3>
        <div class="flex flex-col items-start gap-1.5 px-3.5 pt-2.5 pb-3.5 [&_p]:m-0">
          <CommonStatusBadge :status="segStatus.status" :label="segStatus.label" />
          <p v-if="first && first.segment.status !== 'gap'">
            {{ tr('overview.segmentFrom', { frame: primaryFrame?.frameNo ?? '', start: first.segment.start, end: first.segment.end - 1 }) }}
          </p>
          <p v-else-if="first">{{ tr('overview.noDataGap') }}</p>
          <p v-for="d in duplicates" :key="d.frameNo" class="text-pl-muted">{{ tr('overview.retransmitted', { n: d.frameNo }) }}</p>
          <div v-if="variants.length" class="flex flex-col gap-0.5">
            <p>{{ tr('overview.variants') }}</p>
            <p v-for="(v, i) in variants" :key="i" class="font-mono">{{ i + 1 }}. {{ v.bytes }} <span class="text-pl-muted">· {{ tr('overview.frameN', { n: v.frames }) }}</span></p>
          </div>
        </div>

        <div v-if="showFrame">
          <h3 class="pl-caption m-0 border-t border-pl-line px-3.5 pt-2.5">{{ tr('overview.frameInCapture') }}</h3>
          <p v-if="frameError" role="alert">{{ frameError }}</p>
          <dl v-else-if="frame" class="pl-dl grid-cols-[130px_minmax(0,1fr)]">
            <dt>{{ tr('overview.number') }}</dt><dd>{{ frame.frameNo }} · {{ tr('overview.capturedOf', { len: frame.capturedLength, orig: frame.originalLength }) }}</dd>
            <dt>{{ tr('overview.offsetInFile') }}</dt><dd>{{ formatCount(frame.fileOffset) }}</dd>
            <template v-if="frame.ipv4">
              <dt>IPv4</dt><dd>{{ frame.ipv4.src }} → {{ frame.ipv4.dst }} · TTL {{ frame.ipv4.ttl }}</dd>
            </template>
            <template v-if="frame.tcp">
              <dt>TCP</dt><dd>{{ frame.tcp.srcPort }} → {{ frame.tcp.dstPort }} · {{ frame.tcp.flags.join(', ').toUpperCase() }}</dd>
              <dt>seq / ack</dt><dd>{{ frame.tcp.seq }} / {{ frame.tcp.ack }}</dd>
              <dt>{{ tr('overview.checksum') }}</dt>
              <dd>
                <CommonStatusBadge :status="CHECKSUM[frame.tcp.checksum]?.status ?? 'unknown'" :label="CHECKSUM[frame.tcp.checksum]?.label ?? tr('overview.checksumNotChecked')" :title="frame.tcp.checksum === 'offload' ? tr('overview.checksumOffloadTitle') : undefined" />
              </dd>
            </template>
            <template v-if="frame.payload">
              <dt>Payload</dt><dd>{{ tr('overview.payloadRange', { offset: frame.payload.offset, length: frame.payload.length }) }}</dd>
            </template>
          </dl>
        </div>
      </template>
    </div>
    <form v-if="noting" class="flex flex-col gap-2 border-t border-pl-line px-3.5 py-2.5" @submit.prevent="saveObservation">
      <label for="obs-comment" class="pl-caption">{{ tr('overview.noteLabel') }}</label>
      <input id="obs-comment" v-model="note" class="h-7 rounded border border-pl-line bg-pl-raise px-2 text-pl-fg-strong focus:border-pl-wine-text" :placeholder="tr('overview.notePlaceholder')">
      <div class="flex gap-2">
        <button class="pl-btn pl-btn-primary h-7" type="submit">{{ tr('common.save') }}</button>
        <button class="pl-btn h-7" type="button" @click="noting = false">{{ tr('common.cancel') }}</button>
      </div>
    </form>
    <p v-if="noteState" class="m-0 border-t border-pl-line px-3.5 py-2" :class="noteState.ok ? 'text-pl-st-rule' : 'text-pl-st-violation'" aria-live="polite">{{ noteState.text }}</p>
    <footer class="flex gap-2 border-t border-pl-line px-3.5 py-2.5">
      <button class="pl-btn pl-btn-primary" type="button" :disabled="!range || !primaryFrame || noting" :title="range ? tr('overview.saveAsObservation') : tr('overview.selectBytes')" @click="noting = true">{{ tr('overview.observation') }}</button>
      <button class="pl-btn" type="button" :aria-pressed="showFrame" :disabled="!primaryFrame" @click="showFrame = !showFrame">{{ tr('overview.frameInCapture') }}</button>
    </footer>
  </section>
</template>
