<script setup lang="ts">
const data = useData()
const { data: project } = await useAsyncData('project', () => data.getProject())
</script>

<template>
  <main>{{ project?.name }}</main>
</template>
