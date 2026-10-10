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

const HINTS: Record<'time' | 'action' | 'params' | 'result', RegExp> = {
  time: /^(time|timestamp|ts|date|datetime|время|дата)/i,
  action: /^(action|event|command|cmd|op|действие|команда|событие)/i,
  params: /^(param|args|arguments|value|параметр|аргумент|значение)/i,
  result: /^(result|status|outcome|response|результат|статус|ответ)/i,
}

/** Начальное сопоставление по именам колонок; человек правит его перед импортом. */
export function guessMapping(columns: string[]): Pick<ActionLogMapping, 'time' | 'action' | 'params' | 'result'> {
  const pick = (re: RegExp) => columns.find(c => re.test(c)) ?? null
  return {
    time: pick(HINTS.time) ?? columns[0] ?? '',
    action: pick(HINTS.action) ?? columns[1] ?? '',
    params: pick(HINTS.params),
    result: pick(HINTS.result),
  }
}
