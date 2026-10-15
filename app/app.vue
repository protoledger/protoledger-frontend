<script setup lang="ts">
import { en, ru } from '@nuxt/ui/locale'

useHead({ htmlAttrs: { lang: locale } })
// Встроенные подписи Nuxt UI («Закрыть» у диалогов и т. п.) — на языке интерфейса.
const uiLocale = computed(() => (locale.value === 'en' ? en : ru))
</script>

<template>
  <UApp :locale="uiLocale" :tooltip="{ delayDuration: 300 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
