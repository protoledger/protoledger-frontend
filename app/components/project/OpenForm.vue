<script setup lang="ts">
const project = useProjectStore()
const jobs = useJobsStore()
const workspace = useWorkspaceStore()

const path = ref('')
const busy = ref<'create' | 'open' | null>(null)
const error = ref<string | null>(null)

async function submit(mode: 'create' | 'open') {
  const value = path.value.trim()
  if (!value) {
    error.value = 'Укажите папку проекта'
    return
  }
  busy.value = mode
  error.value = null
  try {
    await project.open(value, mode)
    workspace.log(`${mode === 'create' ? 'Создан' : 'Открыт'} проект ${value}`)
    // При открытии движок заново разбирает записи фоновыми задачами.
    await jobs.load()
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось открыть проект'
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <form class="flex max-w-xl flex-col gap-3 p-4" @submit.prevent="submit('open')">
    <h1 class="m-0 font-display text-2xl font-semibold text-pl-fg-strong">Проект не открыт</h1>
    <p class="m-0 text-pl-muted">
      Проект — папка <code class="font-mono">*.protoledger</code> с копиями записей, журналами и результатами.
      Относительный путь считается от каталога проектов движка.
    </p>
    <label class="flex flex-col gap-1.5">
      <span class="pl-caption">Папка проекта</span>
      <input
        id="project-path"
        v-model="path"
        class="h-[30px] rounded border border-pl-line bg-pl-raise px-2.5 font-mono text-pl-fg-strong outline-none focus:border-pl-wine-text"
        placeholder="stand.protoledger"
        autocomplete="off"
        spellcheck="false"
      >
    </label>
    <div class="flex items-center gap-2.5">
      <button class="pl-btn pl-btn-primary" type="submit" :disabled="busy !== null">{{ busy === 'open' ? 'Открываю…' : 'Открыть' }}</button>
      <button class="pl-btn" type="button" :disabled="busy !== null" @click="submit('create')">{{ busy === 'create' ? 'Создаю…' : 'Создать новый' }}</button>
    </div>
    <p v-if="error" class="m-0 text-pl-st-violation" role="alert">{{ error }}</p>
  </form>
</template>
