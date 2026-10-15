<script setup lang="ts">
import { SCREENS } from '~/utils/screens'

// horizontal — нижняя строка инструментов на телефоне, с прокруткой вбок.
defineProps<{ horizontal?: boolean }>()

const route = useRoute()


const btn = 'relative flex flex-col items-center gap-0.5 rounded-[5px] pt-1.5 pb-1 text-[9.5px] leading-[1.1] font-semibold text-pl-muted hover:bg-pl-raise hover:text-pl-fg'
const on = 'bg-pl-wine text-white hover:bg-pl-wine hover:text-white'
</script>

<template>
  <nav
    class="flex gap-0.5 bg-pl-chrome"
    :class="horizontal ? 'pl-scroll items-stretch overflow-x-auto overflow-y-hidden border-t border-pl-line px-1 py-1 [&>*]:min-w-[56px] [&>*]:shrink-0' : 'w-[52px] flex-col border-r border-pl-line px-1 py-1.5'"
    :aria-label="tr('shell.tools')"
  >
    <template v-for="(s, i) in SCREENS" :key="s.path">
      <div v-if="s.group === 'detail' && SCREENS[i - 1]?.group === 'main'" class="my-1.5 flex flex-col items-center gap-1" :class="horizontal && 'hidden'">
        <span class="h-px w-7 bg-pl-line" />
        <span class="text-[9px] font-semibold text-pl-muted">{{ tr('shell.detail') }}</span>
      </div>
      <NuxtLink
        :to="s.path"
        :class="[btn, route.path.startsWith(s.path) && on]"
        :title="`${s.title} (Alt+${i + 1})`"
        :aria-current="route.path.startsWith(s.path) ? 'page' : undefined"
      >
        <UIcon :name="s.icon" class="size-[18px]" aria-hidden="true" />
        <span>{{ s.short }}</span>
      </NuxtLink>
    </template>
  </nav>
</template>
