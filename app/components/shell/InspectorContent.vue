<script setup lang="ts">
const props = defineProps<{ title: string }>()
const inspectorTitle = useState<string>('inspector-title', () => 'Свойства')
watchEffect(() => { inspectorTitle.value = props.title })
// Новый экран монтируется раньше, чем размонтируется старый: сбрасываем, только если заголовок ещё наш.
onBeforeUnmount(() => {
  if (inspectorTitle.value === props.title) inspectorTitle.value = 'Свойства'
})
</script>

<template>
  <Teleport to="#pl-inspector" defer>
    <div class="flex min-h-0 flex-1 flex-col">
      <slot />
    </div>
  </Teleport>
</template>
