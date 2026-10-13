import { parseForm, setFieldAttr, splitFlow } from './interp-form'

/** Правка из подсказки движка: тип и смещение поля в нескольких сообщениях или новый текст теста гипотезы. */
export interface FixEdit {
  hypothesis: string
  field?: string
  messages?: string[]
  fromType?: string
  toType?: string
  fromAt?: number
  toAt?: number
  test?: string
}

const unq = (v: string | undefined) => (v ?? '').replace(/^"(.*)"$/, '$1')

/**
 * Вносит правку в текст описания и возвращает новый текст и число изменённых строк.
 * Меняются только нужные ключи строк-полей и строки гипотезы; проверку делает движок при предпросмотре.
 */
export function applyFixEdit(text: string, fix: FixEdit): { text: string, changed: number } {
  let t = text
  let changed = 0
  if (fix.field && fix.toType) {
    for (const m of parseForm(t)) {
      if (fix.messages && !fix.messages.includes(m.id)) continue
      for (const f of m.fields) {
        const name = `${f.group ? `${f.group}.` : ''}${unq(f.attrs.name)}`
        if (name !== fix.field) continue
        if (fix.fromType && unq(f.attrs.type) !== fix.fromType) continue
        t = setFieldAttr(t, f.line, 'type', fix.toType)
        if (fix.toAt !== undefined && fix.toAt !== fix.fromAt) t = setFieldAttr(t, f.line, 'at', String(fix.toAt))
        changed++
      }
    }
  }
  if (fix.test) {
    const lines = t.split('\n')
    const start = lines.findIndex(l => /^hypotheses:\s*(#.*)?$/.test(l))
    for (let i = start + 1; start >= 0 && i < lines.length; i++) {
      const l = lines[i]!
      if (/^\S/.test(l)) break
      const flow = /^\s*- \{(.*)\}\s*(#.*)?$/.exec(l)
      if (!flow) continue
      const id = splitFlow(flow[1]!).find(([k]) => k === 'id')?.[1]
      if (unq(id) !== fix.hypothesis) continue
      t = setFieldAttr(t, i + 1, 'test', fix.test)
      changed++
      break
    }
  }
  return { text: t, changed }
}
