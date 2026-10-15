<script setup lang="ts">
useHead({ htmlAttrs: { lang: locale } })
</script>

<template>
  <UApp :tooltip="{ delayDuration: 300 }">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
