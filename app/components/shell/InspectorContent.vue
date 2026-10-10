<script setup lang="ts">
const props = defineProps<{ title: string }>()
const inspectorTitle = useState<string>('inspector-title', () => 'Свойства')
watchEffect(() => { inspectorTitle.value = safeText(props.title, 200) })
// Новый экран монтируется раньше, чем размонтируется старый: сбрасываем, только если заголовок ещё наш.
onBeforeUnmount(() => {
  if (inspectorTitle.value === safeText(props.title, 200)) inspectorTitle.value = 'Свойства'
})
</script>

<template>
  <Teleport to="#pl-inspector" defer>
    <div class="flex min-h-0 flex-1 flex-col">
      <slot />
    </div>
  </Teleport>
</template>
