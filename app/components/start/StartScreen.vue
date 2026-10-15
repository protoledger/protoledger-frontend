<script setup lang="ts">
import { hasNativeFolderPicker, pickFolder } from '~/utils/desktop'
import { projectFolderName } from '~/composables/useImportFlow'

const props = defineProps<{ embedded?: boolean }>()
const emit = defineEmits<{ opened: [] }>()
const project = useProjectStore()
const flow = useImportFlow()
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref<string | null>(null)
const error = ref<string | null>(null)
const showOpen = ref(false)
const path = ref('')

const EXAMPLE = [
  '01_configuration.pcap', '02_variations.pcapng', '03_combined_messages.pcap',
  '01_retransmission.pcap', '02_reordered.pcapng', '03_missing_segment.pcap', '04_snaplen_truncated.pcapng',
  '05_conflicting_overlap.pcap', '06_missing_beginning.pcapng', '07_checksum_offload.pcap', '08_bad_checksum.pcapng',
]

const isLog = (f: File) => /\.(csv|tsv|txt)$/i.test(f.name)

// Папка проекта создаётся сама: имя — по первой записи, занято — с датой и временем.
async function createFor(name: string) {
  try {
    await project.open(projectFolderName(name), 'create')
  }
  catch {
    await project.open(projectFolderName(name, true), 'create')
  }
}

async function start(files: File[], name: string) {
  const captures = files.filter(f => !isLog(f))
  const logs = files.filter(isLog)
  if (!captures.length) {
    error.value = tr('start.needCapture')
    return
  }
  error.value = null
  try {
    busy.value = tr('start.creating')
    await createFor(name)
    busy.value = tr('start.importing', { n: captures.length })
    await flow.importCaptures(captures)
    for (const log of logs) {
      busy.value = tr('start.log')
      await flow.importLogAuto(log)
    }
    busy.value = tr('start.reading')
    await flow.settle()
    emit('opened')
    await navigateTo('/project')
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : tr('start.failed')
  }
  finally {
    busy.value = null
  }
}

function onFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) void start(files, files.find(f => !isLog(f))?.name ?? files[0]!.name)
}

async function openExample() {
  error.value = null
  busy.value = tr('start.exampleLoading')
  try {
    const names = [...EXAMPLE, 'action_journal.csv']
    const files = await Promise.all(names.map(async (n) => {
      const res = await fetch(`/examples/thermostand/${n}`)
      if (!res.ok) throw new Error(tr('start.exampleMissing'))
      return new File([await res.blob()], n)
    }))
    await start(files, 'thermostand')
  }
  catch (e) {
    busy.value = null
    error.value = e instanceof Error ? e.message : tr('start.failed')
  }
}

async function browse() {
  const picked = await pickFolder(tr('start.pickFolder'))
  if (picked) path.value = picked
}

async function openSaved() {
  const value = path.value.trim()
  if (!value) return
  error.value = null
  busy.value = tr('start.opening')
  try {
    await project.open(value, 'open')
    emit('opened')
    await navigateTo('/project')
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : tr('start.failed')
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <div class="pl-scroll flex h-full items-start justify-center bg-pl-bg" :class="props.embedded ? 'p-0' : 'px-6 py-[9vh]'">
    <div class="w-full max-w-[760px]">
      <div v-if="!props.embedded" class="mb-9 flex items-center gap-3">
        <span class="grid size-10 place-items-center rounded-md bg-pl-wine font-display text-lg font-bold text-white">pl</span>
        <span class="font-display text-xl font-semibold text-pl-fg-strong">protoledger</span>
      </div>
      <h1 v-if="!props.embedded" class="m-0 font-display text-[32px] leading-tight font-semibold text-pl-fg-strong">{{ tr('start.title') }}</h1>
      <p v-if="!props.embedded" class="mt-3 mb-8 max-w-[640px] text-[15px] leading-relaxed text-pl-muted">{{ tr('start.lead') }}</p>

      <div class="grid gap-3 sm:grid-cols-2">
        <button class="pl-start-card" type="button" :disabled="!!busy" @click="fileInput?.click()">
          <UIcon name="i-lucide-file-plus-2" class="size-6 text-pl-wine-text" aria-hidden="true" />
          <span class="text-base font-semibold text-pl-fg-strong">{{ tr('start.open') }}</span>
          <span class="text-pl-muted">{{ tr('start.openHint') }}</span>
        </button>
        <button class="pl-start-card" type="button" :disabled="!!busy" @click="openExample">
          <UIcon name="i-lucide-thermometer" class="size-6 text-pl-wine-text" aria-hidden="true" />
          <span class="text-base font-semibold text-pl-fg-strong">{{ tr('start.example') }}</span>
          <span class="text-pl-muted">{{ tr('start.exampleHint') }}</span>
        </button>
      </div>
      <input ref="fileInput" type="file" multiple accept=".pcap,.pcapng,.cap,.csv,.tsv" class="hidden" @change="onFiles">

      <p v-if="busy" class="mt-5 flex items-center gap-2 text-pl-fg" aria-live="polite">
        <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" /> {{ busy }}
      </p>
      <p v-if="error" class="mt-5 text-pl-st-violation" role="alert">{{ error }}</p>
      <ul v-if="flow.errors.value.length" class="mt-3 text-pl-st-violation" role="alert">
        <li v-for="e in flow.errors.value" :key="e">{{ e }}</li>
      </ul>

      <div class="mt-9 border-t border-pl-line pt-5">
        <button v-if="!showOpen" class="text-pl-muted underline-offset-4 hover:text-pl-fg-strong hover:underline" type="button" @click="showOpen = true">{{ tr('start.saved') }}</button>
        <form v-else class="flex flex-wrap items-end gap-2.5" @submit.prevent="openSaved">
          <label class="flex min-w-[320px] flex-1 flex-col gap-1.5">
            <span class="pl-caption">{{ tr('start.savedLabel') }}</span>
            <input v-model="path" class="h-8 rounded border border-pl-line bg-pl-raise px-2.5 font-mono text-pl-fg-strong outline-none focus:border-pl-wine-text" placeholder="thermostand.protoledger" autocomplete="off" spellcheck="false">
          </label>
          <button v-if="hasNativeFolderPicker()" class="pl-btn h-8" type="button" @click="browse">{{ tr('start.browse') }}</button>
          <button class="pl-btn pl-btn-primary h-8" type="submit" :disabled="!path.trim() || !!busy">{{ tr('start.openSaved') }}</button>
        </form>
      </div>
      <p v-if="!props.embedded" class="mt-8 text-xs text-pl-muted">{{ tr('start.offline') }}</p>
    </div>
  </div>
</template>

<style scoped>
.pl-start-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 20px 22px;
  text-align: left;
  border: 1px solid var(--color-pl-line);
  border-radius: 8px;
  background: var(--color-pl-raise);
  transition: border-color 0.12s, background-color 0.12s;
}
.pl-start-card:hover:not(:disabled) {
  border-color: var(--color-pl-wine-text);
}
.pl-start-card:focus-visible {
  outline: 2px solid var(--color-pl-wine-text);
  outline-offset: 2px;
}
.pl-start-card:disabled {
  opacity: 0.6;
}
</style>
