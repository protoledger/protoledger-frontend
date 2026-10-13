import type { ResearchSource } from '../source'
import { base64ToBytes } from '~/utils/bytes'
import { connections, streamBytes } from './stand'
import type { FramingSpec } from '~/api/types'
import type { ActionLog, ActionsView, CompareView, ExchangeView, FramingView, HypothesesView, HypothesisDetail, InterpretationView, ProjectExtras, ReportView, VerificationView } from '../views'

const delay = (ms = 120) => new Promise(r => setTimeout(r, ms))

const hex = (s: string) => s.split(' ')

const extras: ProjectExtras = {
  title: 'Стенд — регулятор РТ-2',
  createdAt: '2026-10-10',
  actionCount: 46,
  interpretationRevs: [{ rev: 3, current: true }, { rev: 2, current: false }, { rev: 1, current: false }],
  observationCount: 12,
  hypothesisCount: 5,
  runCount: 4,
  matchWindowMs: 500,
  maxMessageBytes: 1024 * 1024,
  interpretationRev: 3,
  interpretationDirty: true,
}

const actionLogs: ActionLog[] = [{
  name: 'actions.csv',
  rows: 46,
  mapping: [
    { column: 'time', field: 'Время' },
    { column: 'action', field: 'Действие' },
    { column: 'value', field: 'Параметры' },
    { column: 'result', field: 'Результат' },
  ],
  status: 'mapped',
}]

const lengthSpec = (at: number, type: NonNullable<FramingSpec['length']>['type'], adjust: number): FramingSpec =>
  ({ kind: 'length_prefixed', length: { at, type, adjust }, status: 'hypothesis' })

const framing: FramingView = {
  searchRange: 'перебор 0–16 · 1/2/4 байта',
  candidates: [
    { id: 'len-0', offset: 2, type: 'u8', adjust: 4, messages: 412, share: '98,8%', spec: lengthSpec(2, 'u8', 4), evidence: {
      hypothesis: 'длина = u8 @2 + 4',
      confirmed: '412 из 417 сообщений',
      scope: 'c0001–c0005, порт 5020',
      counterexamples: [
        { message: 'сообщ. 233', status: 'gap', note: 'задевает дыру' },
        { message: 'сообщ. 301', status: 'ambiguous', note: '' },
        { message: 'сообщ. 388', status: 'unknown', note: 'обрыв в конце потока' },
      ],
      note: 'Все 5 несовпадений объясняются дефектами захвата, а не правилом.',
    } },
    { id: 'len-1', offset: 2, type: 'u16 BE', adjust: 3, messages: 61, share: '14,6%', spec: lengthSpec(2, 'u16be', 3), evidence: { hypothesis: 'длина = u16 BE @2 + 3', confirmed: '61 из 417', scope: 'c0002', counterexamples: [], note: '' } },
    { id: 'len-2', offset: 4, type: 'u8', adjust: 1, messages: 38, share: '9,1%', spec: lengthSpec(4, 'u8', 1), evidence: { hypothesis: 'длина = u8 @4 + 1', confirmed: '38 из 417', scope: 'c0002', counterexamples: [], note: '' } },
  ],
  signatures: [
    { label: 'AA 55', matched: 417, total: 417, ok: true },
    { label: '0A в конце', matched: 59, total: 417, ok: false },
  ],
  notes: [],
}

const actions: ActionsView = {
  logs: [{ id: 'log-0001', name: 'actions.csv', rows: 46, clockOffsetMs: 0 }],
  log: { id: 'log-0001', name: 'actions.csv', rows: 46 },
  rows: [
    { id: 'a1', time: '14:02:11.200', action: 'set_param', params: 'value = 21', result: 'ok', candidates: 1, source: null, exchange: 'paired', request: { label: 'set_param', stream: '9f2c7e10:c0002:ab', start: 0, end: 7 }, response: { label: 'set_param_resp', stream: '9f2c7e10:c0002:ba', start: 0, end: 6 } },
    { id: 'a2', time: '14:02:12.900', action: 'read_measure', params: '—', result: '21,0', candidates: 1, source: null, exchange: 'paired', request: { label: 'read_measure', stream: '9f2c7e10:c0002:ab', start: 14, end: 21 }, response: { label: 'read_measure_resp', stream: '9f2c7e10:c0002:ba', start: 12, end: 18 } },
    { id: 'a3', time: '14:02:19.410', action: 'set_param', params: 'value = 37', result: 'ok', candidates: 1, source: null, exchange: 'paired', request: { label: 'set_param', stream: '9f2c7e10:c0002:ab', start: 28, end: 35 }, response: { label: 'set_param_resp', stream: '9f2c7e10:c0002:ba', start: 24, end: 30 } },
    { id: 'a4', time: '14:02:21.050', action: 'read_measure', params: '—', result: '37,0', candidates: 1, source: null, exchange: 'paired', request: { label: 'read_measure', stream: '9f2c7e10:c0002:ab', start: 42, end: 49 }, response: { label: 'read_measure_resp', stream: '9f2c7e10:c0002:ba', start: 36, end: 42 } },
    { id: 'a5', time: '14:02:30.770', action: 'set_param', params: 'value = 1000', result: 'ok', candidates: 1, source: null, exchange: 'paired', request: { label: 'set_param', stream: '9f2c7e10:c0002:ab', start: 56, end: 63 }, response: { label: 'set_param_resp', stream: '9f2c7e10:c0002:ba', start: 48, end: 54 } },
    { id: 'a6', time: '14:02:32.300', action: 'read_measure', params: '—', result: '1000,0', candidates: 1, source: null, exchange: 'paired', request: { label: 'read_measure', stream: '9f2c7e10:c0002:ab', start: 70, end: 77 }, response: { label: 'read_measure_resp', stream: '9f2c7e10:c0002:ba', start: 60, end: 66 } },
    { id: 'a7', time: '14:02:40.010', action: 'reset', params: '—', result: 'ok', candidates: 1, source: null, exchange: 'request_only', request: { label: 'reset', stream: '9f2c7e10:c0002:ab', start: 84, end: 91 }, response: null },
    { id: 'a8', time: '15:12:04.600', action: 'set_param', params: 'value = 70000', result: 'ok', candidates: 1, source: null, exchange: 'not_found', request: null, response: null },
  ],
  total: 8,
  offset: 0,
  exchanges: { paired: 6, requestOnly: 1, notFound: 1, total: 8 },
  exchangeNote: null,
}

const exchange: ExchangeView = {
  actionId: 'a1',
  label: 'set_param · value = 21',
  windowFrom: '14:02:10.700',
  windowTo: '14:02:11.700',
  windowLabel: 'окно ± 500 мс',
  events: [
    { at: 0.08, kind: 'other' }, { at: 0.2, kind: 'other' }, { at: 0.33, kind: 'other' }, { at: 0.47, kind: 'other' },
    { at: 0.5, kind: 'action' }, { at: 0.53, kind: 'request' }, { at: 0.58, kind: 'response' },
    { at: 0.72, kind: 'other' }, { at: 0.85, kind: 'other' },
  ],
  request: { title: 'Запрос · кадр 1281 · +12 мс', direction: 'клиент → устройство', bytes: hex('AA 55 03 10 00 15 D3'), highlight: [4, 5] },
  response: { title: 'Ответ · кадр 1282 · +19 мс', direction: 'устройство → клиент', bytes: hex('AA 55 02 11 00 BC'), highlight: [4] },
  note: 'Байты 4–5 запроса = 0x0015 = 21, совпадает с параметром действия. Байт 4 ответа = 0 при результате «ok».',
}

const compareRow = (label: string, bytes: string, changedFrom = 4): CompareView['requests'][number] => {
  const b = hex(bytes)
  return { label, bytes: b, changed: b.map((_, i) => i >= changedFrom) }
}

const compare: CompareView = {
  logs: [{ id: 'log-1', name: 'actions.csv' }],
  logId: 'log-1',
  actions: ['set_param', 'read_measure', 'reset'],
  action: 'set_param',
  notes: [],
  chips: ['set 21', 'set 37', 'set 1000'],
  requests: [
    compareRow('set_param = 21', 'AA 55 03 10 00 15 D3'),
    compareRow('set_param = 37', 'AA 55 03 10 00 25 E3'),
    compareRow('set_param = 1000', 'AA 55 03 10 03 E8 2D'),
  ],
  mask: [false, false, false, false, true, true, true],
  responses: [
    compareRow('ответ на read = 21,0', 'AA 55 03 21 00 D2 5B'),
    compareRow('ответ на read = 37,0', 'AA 55 03 21 01 72 FA'),
    compareRow('ответ на read = 1000,0', 'AA 55 03 21 27 10 BC'),
  ],
  correlations: [
    { position: '4–5', read: 'u16 BE', values: '21 · 37 · 1000', relation: '= action.params.value', share: '41 / 41' },
    { position: '4–5 ответа', read: 'u16 BE ÷ 10', values: '21,0 · 37,0 · 1000,0', relation: '= action.result', share: '12 / 12' },
    { position: '2', read: 'u8', values: '3 · 3 · 3', relation: '= длина данных + 1', share: '417 / 417' },
    { position: 'последний', read: 'u8', values: 'D3 · E3 · 2D', relation: '= xor байтов 0…n−1', share: '417 / 417' },
  ],
  observations: [
    { id: 'obs-12', text: 'байты 4–5 = параметр', status: 'hypothesis', anchor: 'якорь c0002:ab [4,6)' },
    { id: 'obs-11', text: 'AA 55 в начале каждого сообщения', status: 'rule' },
    { id: 'obs-9', text: 'байт 3 различает команды', status: 'rule' },
    { id: 'obs-7', text: 'ответ на reset без данных', status: 'unknown' },
    { id: 'obs-4', text: 'поле статуса в ответе', status: 'stale' },
  ],
  observationTotal: 12,
}

const interpretation: InterpretationView = {
  rev: 3,
  dirty: true,
  tree: [
    { label: 'Фрейминг', children: [{ label: 'AA 55', status: 'rule' }, { label: 'длина u8 @2 +4' }] },
    {
      label: 'Типы сообщений',
      badge: '4',
      children: [
        { label: 'set_param · 0x10', children: [
          { label: 'cmd', status: 'rule' },
          { label: 'value · u16be', status: 'violation', selected: true },
          { label: 'crc', status: 'hypothesis' },
        ] },
        { label: 'read_measure · 0x20', children: [] },
        { label: 'measure_resp · 0x21', children: [] },
        { label: 'text_cmd · 0x30', status: 'hypothesis', children: [] },
      ],
    },
  ],
  yaml: [
    { text: 'version: 1' },
    { text: 'scope:   # к чему применяется' },
    { text: '  tcp_port: 5020' },
    { text: 'framing:' },
    { text: '  kind: length_prefixed' },
    { text: '  magic: "aa55"', mark: 'rule' },
    { text: '  length: { offset: 2, type: u8, adjust: 4 }', mark: 'rule' },
    { text: 'messages:' },
    { text: '  - name: set_param' },
    { text: '    when: "cmd == 0x10"', mark: 'rule' },
    { text: '    fields:' },
    { text: '      - { name: cmd,   offset: 3, type: u8 }', mark: 'rule' },
    { text: '      - { name: value, offset: 4, type: u16be, status: hypothesis, ref: H4 }', mark: 'violation' },
    { text: '      - { name: crc,   offset: -1, type: u8, status: hypothesis, ref: H3 }', mark: 'hypothesis' },
    { text: '  - name: read_measure' },
    { text: '    when: "cmd == 0x20"', mark: 'rule' },
    { text: '  - name: measure_resp' },
    { text: '    when: "cmd == 0x21"', mark: 'rule' },
    { text: '    fields:' },
    { text: '      - { name: measure, offset: 4, type: u16be, scale: 0.1, ref: H2 }', mark: 'hypothesis' },
    { text: '      - { name: tail,    offset: 6, type: bytes, status: unknown }', mark: 'unknown' },
    { text: '  - name: text_cmd  # 0x30, данные похожи на ASCII' },
    { text: '    when: "cmd == 0x30"', mark: 'hypothesis' },
  ],
  selectedLine: 13,
  stream: 'stand:c0002:ab',
  violations: [{ messageId: 'set_param', field: 'value', kind: 'field_range', detail: 'value: 70000 не помещается в u16', count: 1 }],
  runIssues: [{ id: 'H3', label: 'опровергнута в run-4 · контрпримеров 1', runId: 'run-4' }],
  preview: {
    stream: 'c0002',
    rows: [
      { label: 'Сообщений', value: '46' },
      { label: 'Разобрано', value: '43' },
      { label: 'Неполных', value: '1 · задевает дыру' },
      { label: 'Неоднозначных', value: '1' },
      { label: 'Не охвачено', value: '1 · cmd 0x40' },
    ],
  },
  field: { line: 13, status: 'hypothesis', ref: 'H4', counterexamples: 1, where: 'extra-1000.pcap, сообщ. 88: 70000 не помещается в u16' },
  quickFix: { label: 'Тип u16be → i32be', note: 'Как подсказка Alt+Enter в IDE: правка видна сразу, сохраняется новой ревизией.', line: 13, from: 'u16be', to: 'i32be' },
}

const hypotheses: HypothesesView = {
  items: [
    { id: 'H1', text: 'value в set_param равно параметру действия', status: 'supported', support: '41 / 41', run: { status: 'hypothesis', label: 'run-4: 41 / 41' } },
    { id: 'H2', text: 'measure ÷ 10 равно результату read_measure', status: 'supported', support: '12 / 12', run: { status: 'hypothesis', label: 'run-4: 12 / 12' } },
    { id: 'H3', text: 'последний байт — xor всех предыдущих', status: 'supported', support: '417 / 417', run: { status: 'hypothesis', label: 'run-4: 417 / 417' } },
    { id: 'H4', text: 'value помещается в u16 без знака', status: 'refuted', support: '1 контрпример', run: { status: 'violation', label: 'run-4: опровергнута · 1' } },
    { id: 'H5', text: 'text_cmd передаёт строку ASCII с \\n в конце', status: 'untested', support: '', run: null },
  ],
  questions: [
    'Что означает байт 6 в measure_resp?',
    'Почему reset не получает ответа?',
    'Команда 0x40 встречается 1 раз — откуда?',
  ],
}

const hypothesisH4: HypothesisDetail = {
  id: 'H4',
  title: 'value помещается в u16',
  status: 'refuted',
  support: '1 контрпример',
  claim: 'Поле value в set_param — целое без знака, 2 байта, порядок BE',
  test: 'field.value == action.params.value',
  scope: 'все записи · порт 5020 · тип set_param',
  basis: 'obs-12 (байты 4–5), прогон run-3: 41 / 41',
  marked: 'untested',
  counterexamples: [{ where: 'extra-1000.pcap · c0003 · сообщ. 88', expected: '70000', got: '4464 (0x1170)' }],
  note: 'Похоже, поле длиннее 2 байт: значение 70000 = 0x00011170. Длина сообщения при этом 9 вместо 7.',
  history: [
    { run: 'run-4', time: '16:40', status: 'refuted', label: 'опровергнута', scope: '3 записи', stale: false },
    { run: 'run-3', time: '15:02', status: 'supported', label: 'поддержана 41 / 41', scope: '1 запись', stale: true },
  ],
}

const verification: VerificationView = {
  run: { id: 'run-4', rev: 3, scope: 'все записи (3)', time: '16:40', stale: null },
  filters: [{ label: 'порт 5020', active: true }, { label: 'без фона', active: true }, { label: 'только контрпримеры', active: false }],
  totals: [
    { value: '1 714', label: 'сообщений и кадров в наборе' },
    { value: '70,2%', label: 'совпало' },
    { value: '91,4%', label: 'байтов покрыто полями' },
    { value: '1', label: 'гипотеза опровергнута' },
  ],
  categories: [
    { key: 'matched', label: 'Совпало', count: 1204 },
    { key: 'violated', label: 'Нарушено', count: 3 },
    { key: 'incomplete', label: 'Неполное', count: 2 },
    { key: 'ambiguous', label: 'Неоднозначное', count: 1 },
    { key: 'unmatched', label: 'Не охвачено', count: 4 },
    { key: 'out_of_scope', label: 'Вне области', count: 88 },
    { key: 'unsupported', label: 'Не поддерживается', count: 412 },
    { key: 'limit_exceeded', label: 'Превышен предел', count: 0 },
  ],
  categoriesNote: '«Не поддерживается» и «Превышен предел» — ограничения реализации (IPv6, лимиты), а не свойства протокола.',
  problems: [
    { status: 'violation', label: 'нарушение', where: 'extra-1000 · c0003 · 88', what: 'H4: 70000 не помещается в u16', link: null },
    { status: 'violation', label: 'нарушение', where: 'base · c0004 · 17', what: 'crc не совпал (checksum TCP тоже плохой)', link: null },
    { status: 'gap', label: 'неполное', where: 'base · c0002 · 233', what: 'длина 7, байтов 3 — дыра 192–256', link: { conn: 'c0002', dir: 'ab', from: 186, to: 193 } },
    { status: 'ambiguous', label: 'неоднозначно', where: 'base · c0002 · 301', what: 'перекрытие кадров 1294 и 1296', link: { conn: 'c0002', dir: 'ab', from: 296, to: 306 } },
    { status: 'unknown', label: 'не охвачено', where: 'extra-1000 · c0001 · 12', what: 'cmd 0x40 — нет типа', link: null },
  ],
  diffWith: 'run-3',
  diffNote: null,
  hypothesisChanges: [{ id: 'H4', text: 'контрпримеров нет → опровергнута, контрпримеров 0 → 1', tone: 'bad' }],
  hypotheses: [
    { id: 'H1', test: 'value == action.params.value', status: 'hypothesis', label: 'поддержана 41 / 41' },
    { id: 'H4', test: 'value < 65536', status: 'violation', label: 'опровергнута · контрпримеров 1' },
  ],
  diff: [
    { label: 'Исправилось', value: '+2 · crc в c0001', tone: 'good' },
    { label: 'Новое', value: '+1 · H4 опровергнута', tone: 'bad' },
    { label: 'Без изменений', value: '1 201', tone: 'neutral' },
  ],
  runs: [
    { id: 'run-4', label: 'rev 3 · 3 записи', current: true, stale: null },
    { id: 'run-3', label: 'rev 3 · 1 запись', current: false, stale: 'изменены записи' },
    { id: 'run-2', label: 'rev 2', current: false, stale: 'изменена интерпретация' },
    { id: 'run-1', label: 'rev 1', current: false, stale: 'изменена интерпретация' },
  ],
  runsNote: 'Прогон устаревает, если изменились интерпретация, настройки сборки или записи — по хешам входов.',
}

const report: ReportView = {
  meta: 'protoledger 0.1.0 · проект rt2-stand · прогон run-4 · интерпретация rev 3 · 10.10.2026',
  title: 'Протокол регулятора РТ-2: отчёт исследования',
  sections: ['Итог', 'Данные и область', 'Фрейминг', 'Типы и поля', 'Гипотезы', 'Контрпримеры', 'Открытые вопросы'],
  summary: 'Протокол поверх TCP, порт 5020. Сообщения начинаются с сигнатуры AA 55, длина задана байтом 2 (+4). Определены 4 типа сообщений, 91,4% байтов покрыто полями.',
  fields: [
    { name: 'magic', type: 'bytes[2]', status: 'rule', basis: '417 / 417' },
    { name: 'length', type: 'u8, +4', status: 'rule', basis: '412 / 417, 5 — дефекты захвата' },
    { name: 'set_param.value', type: 'u16be', status: 'violation', basis: 'H4, контрпример extra-1000 #88' },
    { name: 'crc', type: 'u8, xor', status: 'hypothesis', basis: 'H3, 417 / 417' },
    { name: 'measure_resp.tail', type: 'bytes', status: 'unknown', basis: '—' },
  ],
  scope: 'Три записи стенда (sha256 в приложении), журнал actions.csv на 46 действий. Вне области: фоновый трафик (88 кадров), IPv6 (412 кадров, не поддерживается).',
  questions: ['Назначение байта 6 в measure_resp.', 'Почему reset не получает ответа.'],
}

// В примере границы считаются по сигнатуре AA 55 и длине @2 + 4; в продукте их отдаёт движок.
function messageStarts(stream: string): number[] {
  const res = streamBytes(stream, 0, 1 << 20)
  const starts: number[] = []
  for (const seg of res.segments) {
    if (!seg.data) continue
    const b = base64ToBytes(seg.data)
    for (let i = 0; i + 1 < b.length; i++) if (b[i] === 0xAA && b[i + 1] === 0x55) starts.push(seg.start + i)
  }
  return starts
}

/** Пример данных для экранов, которых ещё нет в контракте API. */
export function createMockResearchSource(): ResearchSource {
  return {
    getProjectExtras: async () => (await delay(), structuredClone(extras)),
    getActionLogs: async () => (await delay(), structuredClone(actionLogs)),
    getFraming: async () => (await delay(), structuredClone(framing)),
    getFramingDetail: async stream => (await delay(), {
      messageStarts: messageStarts(stream),
      variability: [0.02, 0.02, 0.08, 0.55, 0.78, 0.88, 0.55, 0.72],
      variabilityNote: '0–1 постоянны (сигнатура), 4–7 меняются сильнее всего.',
    }),
    applyFraming: async () => null,
    getActions: async () => (await delay(), structuredClone(actions)),
    // В примере подробно описан обмен только для первого действия.
    getExchange: async id => (await delay(), id === exchange.actionId ? structuredClone(exchange) : null),
    getCompare: async () => (await delay(), structuredClone(compare)),
    createObservation: async () => false,
    getInterpretation: async () => (await delay(), structuredClone(interpretation)),
    previewInterpretation: async () => (await delay(), structuredClone({ tree: interpretation.tree, preview: interpretation.preview, violations: interpretation.violations })),
    saveInterpretation: async () => {
      await delay()
      interpretation.rev = (interpretation.rev ?? 0) + 1
      return { rev: interpretation.rev, created: true }
    },
    getFieldHints: async () => null,
    getInterpretationRevisions: async () => (await delay(), Array.from({ length: interpretation.rev ?? 0 }, (_, i) => (interpretation.rev ?? 0) - i)),
    getInterpretationRevision: async () => (await delay(), interpretation.yaml.map(l => l.text).join('\n')),
    getHypotheses: async () => (await delay(), structuredClone(hypotheses)),
    getHypothesisDetail: async id => (await delay(), id === hypothesisH4.id ? structuredClone(hypothesisH4) : null),
    getSearchIndex: async () => (await delay(), [
      { group: 'connection' as const, label: 'c0002 · 10.0.0.12:51544 → 10.0.0.50:5020', suffix: 'base-session.pcapng', path: '/overview', query: { conn: 'c0002', dir: 'ab' } },
      ...hypotheses.items.map(h => ({ group: 'hypothesis' as const, label: `${h.id} · ${h.text}`, path: '/hypotheses', query: { h: h.id } })),
      ...verification.runs.map(r => ({ group: 'run' as const, label: `${r.id} · ${r.label}`, path: '/verify', query: { run: r.id } })),
    ]),
    getObservations: async () => (await delay(), compare.observations.map(o => ({ id: o.id, text: o.text }))),
    createHypothesis: async () => null,
    setHypothesisStatus: async () => false,
    createQuestion: async () => false,
    getVerification: async () => (await delay(), structuredClone(verification)),
    startRun: async () => null,
    getReport: async () => (await delay(), structuredClone(report)),
    getDraft: async () => (await delay(400), {
      yaml: interpretation.yaml.map(l => l.text).join('\n'),
      steps: [
        { title: 'Границы сообщений', detail: 'Поле длины u8 @2 + 4 — 412 из 417 сообщений, сигнатура AA 55.' },
        { title: 'Типы сообщений', detail: 'Байт 3 различает команды: 0x10, 0x20, 0x21, 0x30.' },
        { title: 'Связи с журналом', detail: 'Байты 4–5 запроса set_param = params.value (41 из 41) — гипотеза с тестом.' },
        { title: 'Контрольная сумма', detail: 'Последний байт = xor8 всех предыдущих — проверка check.' },
      ],
      summary: [
        { label: 'Потоков', value: '5' },
        { label: 'Сообщений', value: '417' },
        { label: 'Совпало', value: '412' },
        { label: 'Типов сообщений', value: '4' },
        { label: 'Гипотез с тестами', value: '3' },
      ],
      incomplete: false,
    }),
    getFixHints: async hypothesis => (await delay(), {
      hypothesis,
      test: 'field.value == action.params.value',
      before: 'контрпримеров 1 из 42',
      fixes: [
        { kind: 'width' as const, summary: 'value — 4 байта: u32be @4 вместо u16be @4', effect: 'контрпримеров 1 из 42 → 0', after: 0, edit: { hypothesis, field: 'value', messages: ['set_param'], fromType: 'u16be', toType: 'u32be' } },
        { kind: 'sign' as const, summary: 'value со знаком: i16be', effect: 'контрпримеров 1 из 42 → 1', after: 1, edit: { hypothesis, field: 'value', messages: ['set_param'], fromType: 'u16be', toType: 'i16be' } },
      ],
    }),
    getCoverage: async () => (await delay(), {
      described: '91,4%',
      totals: [
        { status: 'rule' as const, label: 'правило', bytes: 3120 },
        { status: 'hypothesis' as const, label: 'гипотеза', bytes: 1840 },
        { status: 'unknown' as const, label: 'неизвестно', bytes: 210 },
        { status: 'none' as const, label: 'не описано', bytes: 278 },
      ],
      types: [
        { id: 'set_param', messages: 42, length: '7 байт', totals: { rule: 168, hypothesis: 126, unknown: 0, none: 0 }, truncated: false, regions: [
          { start: 0, end: 2, status: 'rule' as const, label: 'magic', share: 1 },
          { start: 2, end: 4, status: 'rule' as const, label: 'length · cmd', share: 1 },
          { start: 4, end: 6, status: 'hypothesis' as const, label: 'value · H4', share: 1 },
          { start: 6, end: 7, status: 'hypothesis' as const, label: 'crc · H3', share: 1 },
        ] },
        { id: 'measure_resp', messages: 12, length: '7–15 байт', totals: { rule: 48, hypothesis: 24, unknown: 30, none: 18 }, truncated: false, regions: [
          { start: 0, end: 4, status: 'rule' as const, label: 'заголовок', share: 1 },
          { start: 4, end: 6, status: 'hypothesis' as const, label: 'measure · H2', share: 1 },
          { start: 6, end: 13, status: 'unknown' as const, label: 'tail', share: 0.5 },
          { start: 13, end: 15, status: 'none' as const, label: 'не описано', share: 0.25 },
        ] },
      ],
      incomplete: false,
    }),
    getNextSteps: async () => (await delay(), {
      steps: [
        { id: 'verify', screen: 'verification' as const, title: 'Запустите проверку на всех записях', detail: 'Описание изменено после прогона run-4 — итоги устарели.' },
        { id: 'refuted', screen: 'hypotheses' as const, title: 'Разберите опровергнутую гипотезу H4', detail: '1 контрпример: 70000 не помещается в u16.' },
        { id: 'unknown', screen: 'interpretation' as const, title: 'Опишите неизвестные байты', detail: 'measure_resp.tail — 8,6% байтов без поля.' },
      ],
    }),
    explainByte: async (stream, offset) => {
      await delay()
      const start = offset - (offset % 12)
      const at = offset - start
      const field = at < 2 ? { name: 'magic', start, end: start + 2, status: 'rule' as const, state: 'decoded', value: 'A55A', hypothesis: null }
        : at < 4 ? { name: 'length', start: start + 2, end: start + 4, status: 'rule' as const, state: 'decoded', value: '8', hypothesis: null }
          : at < 6 ? { name: 'value', start: start + 4, end: start + 6, status: 'hypothesis' as const, state: 'decoded', value: '210', hypothesis: { id: 'H2', statement: 'value — уставка из журнала, ×10', test: 'value == action.params.value * 10' } }
            : { name: 'tail', start: start + 6, end: start + 12, status: 'unknown' as const, state: 'decoded', value: null, hypothesis: null }
      return {
        stream, offset, kind: 'data' as const, value: 0x5A,
        frames: [{ frame: 120 + Math.floor(offset / 12), tsNs: 0, start, end: start + 12, duplicate: false }],
        message: { start, end: start + 12, messageId: 'set_param_req', category: 'matched', offset: at },
        fields: [field],
        observations: at >= 4 && at < 6 ? [{ id: 'obs-3', comment: 'Байты 4–5 меняются вместе с уставкой', start: start + 4, end: start + 6 }] : [],
        hypotheses: at >= 4 && at < 6 ? [{ id: 'H2', statement: 'value — уставка ×10', status: 'supported' }] : [],
        runs: [{ id: 'run-4', revision: 3, sameInterpretation: true, category: 'matched', messageId: 'set_param_req', violations: [] }],
      }
    },
    getDeviceConnections: async () => {
      await delay()
      const all = connections()
      const device = new Set([1, 2, 4, 9].map(i => all[i - 1]?.id))
      return {
        windowMs: 2000, total: all.length, devices: device.size,
        items: all.map(c => ({
          connection: c.id, source: c.source, a: `${c.a.address}:${c.a.port}`, b: `${c.b.address}:${c.b.port}`,
          role: device.has(c.id) ? 'device' as const : 'background' as const,
          actionsMatched: device.has(c.id) ? 11 : 0, actionsTotal: 12, sharePermille: device.has(c.id) ? 917 : 0, payloadFrames: c.frameCount,
          reason: device.has(c.id) ? 'данные в течение 2000 мс после 11 из 12 действий записи' : 'данные не идут следом за действиями журнала',
        })),
      }
    },
    getClockOffset: async () => null,
    getSuggestions: async () => {
      await delay()
      const obs = (start: number, comment: string) => ({ source: 'a'.repeat(64), stream: 'stand:c0001:ab', start, end: start + 2, comment })
      return {
        items: [
          { messageId: 'set_param_req', param: 'params.value', matches: 11, samples: 12, observation: obs(4, 'value в set_param_req = params.value × 10 в 11 из 12 примеров'), hypothesis: { statement: 'value в set_param_req — уставка из журнала, умноженная на 10', test: 'value == action.params.value * 10' }, field: 'value' },
          { messageId: 'measure_resp', param: 'result.temp', matches: 12, samples: 12, observation: obs(6, 'байты 6–7 measure_resp = result.temp × 100 в 12 из 12'), hypothesis: { statement: 'temp в measure_resp — температура в сотых долях градуса', test: 'temp == dec(action.result.temp, 2)' }, field: null, newField: { name: 'temp', at: 6, type: 'i16be' } },
        ],
        truncated: false,
        note: null,
      }
    },
    acceptSuggestion: async () => null,
    generateReport: async () => null,
    listRuns: async () => (await delay(), verification.runs.map(r => ({ id: r.id, label: r.label, stale: !r.current }))),
  }
}
