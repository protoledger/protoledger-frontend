import type { ActionLogMapping } from '~/api/types'

export interface CsvHeader {
  /** Разделитель в виде, который понимает движок: символ или `tab`. */
  delimiter: string
  columns: string[]
}

const CANDIDATES = [',', ';', '\t'] as const

/** Колонки из первой строки CSV; разделитель — тот, что даёт больше всего колонок. */
export function readCsvHeader(text: string): CsvHeader {
  const line = (text.split(/\r?\n/, 1)[0] ?? '').replace(/^\uFEFF/, '')
  let best: { sep: string, cols: string[] } = { sep: ',', cols: [line] }
  for (const sep of CANDIDATES) {
    const cols = line.split(sep)
    if (cols.length > best.cols.length) best = { sep, cols }
  }
  const columns = best.cols.map(c => c.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean)
  return { delimiter: best.sep === '\t' ? 'tab' : best.sep, columns }
}

type Guessed = Pick<ActionLogMapping, 'time' | 'action' | 'params' | 'result' | 'source' | 'paramsFormat' | 'resultFormat'>

// Сначала точное имя колонки, потом похожее: иначе «action_id» перехватит «action».
const HINTS: Record<'time' | 'action' | 'params' | 'result' | 'source', { exact: string[], like: RegExp }> = {
  time: { exact: ['time', 'timestamp', 'ts', 'время'], like: /(^|_)(time|utc|ts|date)|^start|время|дата/i },
  action: { exact: ['action', 'event', 'command', 'действие'], like: /^(action|event|command|cmd|op|действие|команда|событие)/i },
  params: { exact: ['params', 'parameters', 'параметры'], like: /param|args|arguments|value|параметр|аргумент|значение/i },
  result: { exact: ['result', 'результат'], like: /result|status|outcome|response|результат|статус|ответ/i },
  source: { exact: ['capture', 'source', 'запись'], like: /^(capture|source|pcap|file|record|запись)/i },
}

/**
 * Начальное сопоставление по именам колонок и первым строкам; человек правит его перед импортом.
 * JSON в ячейках узнаётся по «{» в данных.
 */
export function guessMapping(columns: string[], sample = ''): Guessed {
  const used = new Set<string>()
  const pick = (k: keyof typeof HINTS) => {
    const h = HINTS[k]
    const found = columns.find(c => !used.has(c) && h.exact.includes(c.toLowerCase())) ?? columns.find(c => !used.has(c) && h.like.test(c)) ?? null
    if (found) used.add(found)
    return found
  }
  const action = pick('action')
  const time = pick('time')
  const json = /(^|,)"?\{/m.test(sample.split(/\r?\n/).slice(1, 6).join('\n'))
  return {
    time: time ?? columns[0] ?? '',
    action: action ?? columns[1] ?? '',
    params: pick('params'),
    result: pick('result'),
    source: pick('source'),
    paramsFormat: json ? 'json' : 'kv',
    resultFormat: json ? 'json' : 'kv',
  }
}
