/**
 * Markdown отчёта движка → блоки для показа интерполяцией текста (без HTML в странице).
 * Поддержано то, что пишет движок: заголовки, абзацы, списки «- », таблицы, экранирование «\x».
 */
export type ReportBlock =
  | { kind: 'heading', level: 1 | 2 | 3, text: string, id: string }
  | { kind: 'paragraph', text: string }
  | { kind: 'list', items: string[] }
  | { kind: 'table', head: string[], rows: string[][] }

export function unescapeMd(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
}

// Делим строку таблицы по «|», кроме экранированных «\|».
function cells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).map(c => unescapeMd(c.trim()))
}

const isDivider = (line: string) => /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)

export function reportBlocks(markdown: string): ReportBlock[] {
  const lines = markdown.split(/\r?\n/)
  const out: ReportBlock[] = []
  let para: string[] = []
  let headings = 0
  const flush = () => {
    if (para.length) out.push({ kind: 'paragraph', text: unescapeMd(para.join(' ')) })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      flush()
      out.push({ kind: 'heading', level: h[1]!.length as 1 | 2 | 3, text: unescapeMd(h[2]!.trim()), id: `sec-${++headings}` })
      continue
    }
    if (line.trim().startsWith('|') && isDivider(lines[i + 1] ?? '')) {
      flush()
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) rows.push(cells(lines[i++]!))
      i--
      out.push({ kind: 'table', head, rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      flush()
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? '')) items.push(unescapeMd((lines[i++] ?? '').replace(/^\s*[-*]\s+/, '')))
      i--
      out.push({ kind: 'list', items })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    para.push(line.trim())
  }
  flush()
  return out
}
