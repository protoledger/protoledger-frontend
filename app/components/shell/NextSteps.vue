<script setup lang="ts">
import type { NextStepScreen } from '~/data/views'

const project = useProjectStore()
const workspace = useWorkspaceStore()
const route = useRoute()

const SCREEN: Record<NextStepScreen, { path: string, label: string }> = {
  sources: { path: '/project', label: 'Проект' },
  actions: { path: '/actions', label: 'Действия' },
  framing: { path: '/bounds', label: 'Границы' },
  interpretation: { path: '/interpretation', label: 'Интерпретация' },
  hypotheses: { path: '/hypotheses', label: 'Гипотезы' },
  verification: { path: '/verify', label: 'Проверка' },
  questions: { path: '/hypotheses', label: 'Вопросы' },
  report: { path: '/report', label: 'Отчёт' },
}

const first = computed(() => project.nextSteps[0] ?? null)
const rest = computed(() => project.nextSteps.slice(1))
const expanded = ref(false)
</script>

<template>
  <section
    v-if="first && !workspace.focus && !workspace.nextStepsHidden"
    class="border-b border-pl-line bg-pl-wine-soft/40"
    aria-label="Что дальше"
  >
    <div class="flex items-center gap-3 px-3 py-1.5 max-sm:flex-wrap max-sm:gap-x-2 max-sm:gap-y-1">
      <span class="pl-caption flex-none max-sm:hidden">Что дальше</span>
      <span class="min-w-0 truncate max-sm:order-first max-sm:w-full max-sm:whitespace-normal">
        <b class="text-pl-fg-strong">{{ safeText(first.title) }}</b>
        <span class="text-pl-muted"> — {{ safeText(first.detail) }}</span>
      </span>
      <NuxtLink
        v-if="!route.path.startsWith(SCREEN[first.screen].path)"
        :to="SCREEN[first.screen].path"
        class="pl-btn pl-btn-primary h-6 flex-none"
      >
        {{ SCREEN[first.screen].label }}
      </NuxtLink>
      <button v-if="rest.length" class="pl-btn pl-btn-ghost h-6 flex-none" type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        ещё {{ rest.length }}
        <UIcon :name="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5" aria-hidden="true" />
      </button>
      <button class="ml-auto grid size-6 flex-none place-items-center rounded text-pl-muted hover:bg-pl-raise hover:text-pl-fg" type="button" title="Скрыть подсказку" @click="workspace.nextStepsHidden = true">
        <UIcon name="i-lucide-x" class="size-3.5" aria-hidden="true" />
      </button>
    </div>
    <ol v-if="expanded" class="m-0 list-none px-3 pb-2">
      <li v-for="s in rest" :key="s.id" class="flex items-center gap-3 py-0.5">
        <span class="min-w-0 truncate">
          {{ safeText(s.title) }}
          <span class="text-pl-muted"> — {{ safeText(s.detail) }}</span>
        </span>
        <NuxtLink :to="SCREEN[s.screen].path" class="flex-none text-pl-wine-text hover:underline">{{ SCREEN[s.screen].label }}</NuxtLink>
      </li>
    </ol>
  </section>
</template>
