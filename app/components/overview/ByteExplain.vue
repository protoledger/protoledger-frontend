<script setup lang="ts">
import type { ByteExplanation } from '~/api/types'
import { hexByte } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'

const props = defineProps<{ stream: string, offset: number }>()

const data = useData()
const info = ref<ByteExplanation | null>(null)
const error = ref<string | null>(null)
const pending = ref(false)

// Выделение протяжкой меняет смещение часто: спрашиваем движок, когда оно успокоилось, и берём только последний ответ.
let seq = 0
let timer: ReturnType<typeof setTimeout> | undefined
watch(() => [props.stream, props.offset] as const, ([stream, offset]) => {
  clearTimeout(timer)
  const my = ++seq
  pending.value = true
  timer = setTimeout(async () => {
    try {
      const r = await data.explainByte(stream, offset)
      if (my !== seq) return
      info.value = r
      error.value = null
    }
    catch (e) {
      if (my !== seq) return
      info.value = null
      error.value = e instanceof Error ? e.message : 'Не удалось получить сведения о байте'
    }
    finally {
      if (my === seq) pending.value = false
    }
  }, 150)
}, { immediate: true })
onBeforeUnmount(() => clearTimeout(timer))

const CATEGORY: Record<string, { label: string, status: KnowledgeStatus }> = {
  matched: { label: 'совпало', status: 'rule' },
  violated: { label: 'нарушено', status: 'violation' },
  incomplete: { label: 'неполное', status: 'gap' },
  ambiguous: { label: 'неоднозначное', status: 'ambiguous' },
  unmatched: { label: 'не охвачено', status: 'unknown' },
  limit_exceeded: { label: 'превышен предел', status: 'violation' },
}

const RESEARCH: Record<string, string> = { proposed: 'предложена', supported: 'поддержана', refuted: 'опровергнута', superseded: 'заменена' }

const kind = computed(() => (info.value?.kind === 'gap' ? { status: 'gap' as const, label: 'дыра' } : info.value?.kind === 'ambiguous' ? { status: 'ambiguous' as const, label: 'неоднозначно' } : null))
const runs = computed(() => info.value?.runs.slice(0, 3) ?? [])

const sub = 'pl-caption m-0 mt-2.5 mb-1'
</script>

<template>
  <section class="border-t border-pl-line px-3.5 pt-2.5 pb-3.5" aria-live="polite">
    <h3 class="pl-caption m-0">Что известно о байте {{ offset }}</h3>
    <p v-if="error" class="m-0 mt-1.5 text-pl-st-violation" role="alert">{{ error }}</p>
    <p v-else-if="!info" class="m-0 mt-1.5 text-pl-muted">{{ pending ? 'Спрашиваю движок…' : '' }}</p>
    <div v-else class="flex flex-col [&_p]:m-0" :class="{ 'opacity-60': pending }">
      <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span v-if="info.value !== null" class="font-mono">{{ hexByte(info.value) }}</span>
        <CommonStatusBadge v-if="kind" :status="kind.status" :label="kind.label" />
        <span v-if="info.frames[0]" class="text-pl-muted">кадр {{ info.frames[0].frame }}<template v-if="info.frames.length > 1"> и ещё {{ info.frames.length - 1 }}</template></span>
      </div>

      <h4 :class="sub">Сообщение</h4>
      <p v-if="!info.message" class="text-pl-muted">Байт не попал в сообщение: описания ещё нет или разметка сюда не дошла.</p>
      <div v-else class="flex flex-wrap items-center gap-1.5">
        <span class="font-mono">{{ info.message.messageId ? safeText(info.message.messageId) : 'тип не определён' }}</span>
        <CommonStatusBadge :status="CATEGORY[info.message.category]?.status ?? 'unknown'" :label="CATEGORY[info.message.category]?.label ?? info.message.category" />
        <span class="text-pl-muted">байт {{ info.message.offset }} сообщения [{{ info.message.start }}, {{ info.message.end }})</span>
      </div>

      <template v-if="info.fields.length">
        <h4 :class="sub">Поле</h4>
        <div v-for="f in info.fields" :key="`${f.name}-${f.start}`" class="mb-1.5 flex flex-col gap-0.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="font-mono">{{ safeText(f.name) }}</span>
            <CommonStatusBadge :status="f.status" />
            <span class="text-pl-muted">[{{ f.start }}, {{ f.end }})</span>
            <span v-if="f.value !== null">= <span class="font-mono">{{ safeText(f.value) }}</span></span>
          </div>
          <p v-if="f.hypothesis" class="text-pl-muted">
            {{ f.hypothesis.id }}: {{ safeText(f.hypothesis.statement) }}<template v-if="f.hypothesis.test"> · тест <span class="font-mono">{{ safeText(f.hypothesis.test) }}</span></template>
          </p>
        </div>
      </template>

      <template v-if="info.observations.length || info.hypotheses.length">
        <h4 :class="sub">Наблюдения и гипотезы</h4>
        <p v-for="o in info.observations" :key="o.id">{{ o.id }} [{{ o.start }}, {{ o.end }}): {{ safeText(o.comment) }}</p>
        <NuxtLink v-for="h in info.hypotheses" :key="h.id" :to="{ path: '/hypotheses', query: { h: h.id } }" class="text-pl-wine-text hover:underline">
          {{ h.id }} · {{ RESEARCH[h.status] ?? h.status }}: {{ safeText(h.statement) }}
        </NuxtLink>
      </template>

      <h4 :class="sub">В прогонах</h4>
      <p v-if="!runs.length" class="text-pl-muted">Прогонов с этим потоком ещё не было.</p>
      <div v-for="r in runs" :key="r.id" class="mb-1 flex flex-col gap-0.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <NuxtLink :to="{ path: '/verify', query: { run: r.id } }" class="text-pl-wine-text hover:underline">{{ r.id }}</NuxtLink>
          <span class="text-pl-muted">rev {{ r.revision ?? '—' }}<template v-if="!r.sameInterpretation"> · другое описание</template></span>
          <CommonStatusBadge v-if="r.category" :status="CATEGORY[r.category]?.status ?? 'unknown'" :label="CATEGORY[r.category]?.label ?? r.category" />
        </div>
        <p v-for="v in r.violations" :key="`${v.kind}-${v.id}`" class="text-pl-st-violation">{{ safeText(v.detail) }}</p>
      </div>
    </div>
  </section>
</template>
