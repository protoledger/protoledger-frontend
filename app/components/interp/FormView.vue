<script setup lang="ts">
import { addField, parseForm, setFieldAttr } from '~/utils/interp-form'
import type { FormMessage } from '~/utils/interp-form'
import type { MessageKey } from '~/i18n'

const text = defineModel<string>({ required: true })
const props = defineProps<{ selectedLine: number | null }>()
const emit = defineEmits<{ select: [line: number] }>()

const messages = computed(() => parseForm(text.value))

const TYPES = ['u8', 'i8', 'u16be', 'u16le', 'i16be', 'i16le', 'u32be', 'u32le', 'i32be', 'i32le', 'u64be', 'u64le', 'bytes', 'string', 'unknown']
const STATUSES: [string, MessageKey][] = [['rule', 'status.rule'], ['hypothesis', 'status.hypothesis'], ['unknown', 'status.unknown']]

function set(line: number, key: string, value: string) {
  const v = value.trim()
  text.value = setFieldAttr(text.value, line, key, v === '' ? null : v)
}

function add(m: FormMessage) {
  const top = m.fields.filter(f => f.depth === 0)
  const last = top[top.length - 1]
  const at = last && /^\d+$/.test(last.attrs.at ?? '') ? String(Number(last.attrs.at) + 1) : '0'
  text.value = addField(text.value, m, { name: `field_${at}`, at, type: 'u8', status: 'unknown' })
}

const unquote = (v: string | undefined) => (v ?? '').replace(/^"(.*)"$/, '$1')
const cell = 'h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1.5 font-mono text-pl-fg-strong hover:border-pl-line focus:border-pl-wine-text focus:bg-pl-raise'
</script>

<template>
  <div class="pl-scroll flex-1 px-3 py-3">
    <p v-if="!messages.length" class="m-0 text-pl-muted">
      {{ tr('interp.form.noList') }} <code class="font-mono">messages:</code> {{ tr('interp.form.withFields') }} <code class="font-mono">- { name: …, at: …, type: … }</code> {{ tr('interp.form.addHint') }}
    </p>
    <section v-for="m in messages" :key="m.line" class="mb-4 border border-pl-line">
      <header class="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-pl-line bg-pl-panel px-2.5 py-1.5">
        <b class="font-mono text-pl-fg-strong">{{ safeText(m.id) }}</b>
        <span v-if="m.when" class="min-w-0 truncate font-mono text-xs text-pl-muted" :title="safeText(m.when)">when {{ safeText(m.when) }}</span>
        <button class="pl-btn pl-btn-ghost ml-auto h-6" type="button" @click="add(m)">{{ tr('interp.form.addField') }}</button>
      </header>
      <table class="pl-table table-fixed">
        <thead>
          <tr><th class="w-[30%]">{{ tr('interp.form.col.field') }}</th><th class="w-[12%]">{{ tr('interp.form.col.at') }}</th><th class="w-[18%]">{{ tr('interp.form.col.type') }}</th><th class="w-[14%]">{{ tr('interp.form.col.len') }}</th><th class="w-[18%]">{{ tr('interp.form.col.status') }}</th><th class="w-[8%]">{{ tr('interp.form.col.hyp') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="f in m.fields" :key="f.line" :aria-selected="f.line === props.selectedLine" @click="emit('select', f.line)">
            <td>
              <div class="flex items-center" :style="{ paddingLeft: `${f.depth * 14}px` }">
                <span v-if="f.depth" class="mr-1 text-pl-muted" aria-hidden="true">↳</span>
                <input :class="cell" :value="unquote(f.attrs.name)" :aria-label="tr('interp.form.aria.name', { n: f.line })" spellcheck="false" @change="set(f.line, 'name', ($event.target as HTMLInputElement).value)">
              </div>
            </td>
            <td><input :class="cell" :value="unquote(f.attrs.at)" :aria-label="tr('interp.form.aria.at', { name: unquote(f.attrs.name) })" spellcheck="false" @change="set(f.line, 'at', ($event.target as HTMLInputElement).value)"></td>
            <td>
              <select :class="cell" :value="unquote(f.attrs.type)" :aria-label="tr('interp.form.aria.type', { name: unquote(f.attrs.name) })" @change="set(f.line, 'type', ($event.target as HTMLSelectElement).value)">
                <option v-if="f.attrs.type && !TYPES.includes(unquote(f.attrs.type))" :value="unquote(f.attrs.type)">{{ unquote(f.attrs.type) }}</option>
                <option v-for="t in TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </td>
            <td><input :class="cell" :value="unquote(f.attrs.len)" placeholder="—" :aria-label="tr('interp.form.aria.len', { name: unquote(f.attrs.name) })" spellcheck="false" @change="set(f.line, 'len', ($event.target as HTMLInputElement).value)"></td>
            <td>
              <select :class="cell" :value="f.attrs.status ?? ''" :aria-label="tr('interp.form.aria.status', { name: unquote(f.attrs.name) })" @change="set(f.line, 'status', ($event.target as HTMLSelectElement).value)">
                <option value="">—</option>
                <option v-for="[v, l] in STATUSES" :key="v" :value="v">{{ tr(l) }}</option>
              </select>
            </td>
            <td class="font-mono text-xs text-pl-muted">{{ safeText(f.attrs.hypothesis ?? '') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!m.fields.length" class="m-0 px-2.5 py-2 text-pl-muted">{{ tr('interp.form.noFields') }}</p>
    </section>
    <p class="m-0 text-xs text-pl-muted">{{ tr('interp.form.note') }}</p>
  </div>
</template>
