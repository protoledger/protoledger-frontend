/**
 * Вид «Форма» правит интерпретацию по строкам: поле — это строка вида `- { name: x, at: 4, type: u8, status: rule }`.
 * Остальной текст (комментарии, порядок, блоки) не трогается; разбор и проверку целиком делает движок.
 */
export interface FormField {
  /** Номер строки в тексте, с 1. */
  line: number
  /** Уровень вложенности: 0 — поле сообщения, больше — поле повторяющейся группы. */
  depth: number
  /** Блочное поле-группа, внутри которого стоит поле (`- name: measurements` … `repeat:`); null — поле сообщения. */
  group: string | null
  /** Значения как в тексте (кавычки сохранены). */
  attrs: Record<string, string>
}

export interface FormMessage {
  id: string
  line: number
  when: string | null
  fields: FormField[]
}

const FLOW = /^(\s*)- \{(.*)\}\s*(#.*)?$/
const MESSAGE = /^(\s*)- (?:id|name):\s*([^\s#{]+)\s*(#.*)?$/

/** Пары `ключ: значение` из тела `{ … }`; запятые внутри кавычек не делят. */
export function splitFlow(body: string): [string, string][] {
  const parts: string[] = []
  let cur = ''
  let quote: string | null = null
  for (const ch of body) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
    }
    else if (ch === '"' || ch === '\'') {
      quote = ch
      cur += ch
    }
    else if (ch === ',') {
      parts.push(cur)
      cur = ''
    }
    else {
      cur += ch
    }
  }
  if (cur.trim()) parts.push(cur)
  return parts.map((p) => {
    const i = p.indexOf(':')
    return i < 0 ? [p.trim(), ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()]
  })
}

export function parseForm(text: string): FormMessage[] {
  const lines = text.split('\n')
  const start = lines.findIndex(l => /^messages:\s*(#.*)?$/.test(l))
  if (start < 0) return []
  const out: FormMessage[] = []
  let indent: number | null = null
  let baseField: number | null = null
  let block: { name: string, pad: number } | null = null
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]!
    if (/^\S/.test(l)) break
    const m = MESSAGE.exec(l)
    if (m && (indent === null || m[1]!.length === indent)) {
      indent = m[1]!.length
      baseField = null
      block = null
      out.push({ id: m[2]!, line: i + 1, when: null, fields: [] })
      continue
    }
    const cur = out[out.length - 1]
    if (!cur) continue
    const w = /^\s+when:\s*(.*)$/.exec(l)
    if (w && cur.when === null && !FLOW.test(l)) {
      cur.when = w[1]!.trim()
      continue
    }
    const b = /^(\s*)- name:\s*([^\s#{]+)\s*$/.exec(l)
    if (b && !FLOW.test(l)) {
      block = { name: b[2]!, pad: b[1]!.length }
      continue
    }
    const f = FLOW.exec(l)
    if (f) {
      const pad = f[1]!.length
      if (block && pad <= block.pad) block = null
      if (baseField === null) baseField = pad
      const attrs = Object.fromEntries(splitFlow(f[2]!))
      if ('name' in attrs) cur.fields.push({ line: i + 1, depth: Math.max(0, Math.round((pad - baseField) / 6)), group: block?.name ?? null, attrs })
    }
  }
  return out
}

/** Значение для YAML: простые слова и числа как есть, остальное в кавычках. */
export function yamlValue(v: string): string {
  if (/^-?[\w.]+$/.test(v) || /^".*"$/.test(v)) return v
  return JSON.stringify(v)
}

/** Заменить, добавить или убрать (value = null) ключ в строке поля. */
export function setFieldAttr(text: string, line: number, key: string, value: string | null): string {
  const lines = text.split('\n')
  const f = FLOW.exec(lines[line - 1] ?? '')
  if (!f) return text
  const pairs = splitFlow(f[2]!)
  const at = pairs.findIndex(([k]) => k === key)
  if (value === null) {
    if (at >= 0) pairs.splice(at, 1)
  }
  else if (at >= 0) {
    pairs[at] = [key, yamlValue(value)]
  }
  else {
    pairs.push([key, yamlValue(value)])
  }
  lines[line - 1] = `${f[1]}- { ${pairs.map(([k, v]) => `${k}: ${v}`).join(', ')} }${f[3] ? ` ${f[3]}` : ''}`
  return lines.join('\n')
}

/** Новое поле после последнего поля сообщения (или после `fields:`). */
export function addField(text: string, message: FormMessage, attrs: Record<string, string>): string {
  const lines = text.split('\n')
  const body = `- { ${Object.entries(attrs).map(([k, v]) => `${k}: ${yamlValue(v)}`).join(', ')} }`
  const top = message.fields.filter(f => f.depth === 0)
  const last = top[top.length - 1]
  if (last) {
    const pad = FLOW.exec(lines[last.line - 1]!)![1]!
    // В конец списка полей: дальше идут соседние и вложенные строки (блочные поля, группы) с отступом не меньше.
    let at = last.line
    while (at < lines.length && (lines[at] ?? '').trim() && /^(\s*)/.exec(lines[at]!)![1]!.length >= pad.length) at++
    lines.splice(at, 0, `${pad}${body}`)
    return lines.join('\n')
  }
  const fieldsLine = lines.findIndex((l, i) => i >= message.line && /^\s+fields:\s*$/.test(l))
  if (fieldsLine >= 0) {
    const pad = `${/^(\s*)/.exec(lines[fieldsLine]!)![1]}  `
    lines.splice(fieldsLine + 1, 0, `${pad}${body}`)
    return lines.join('\n')
  }
  const pad = ' '.repeat((/^(\s*)/.exec(lines[message.line - 1]!)![1]!.length) + 2)
  lines.splice(message.line, 0, `${pad}fields:`, `${pad}  ${body}`)
  return lines.join('\n')
}
