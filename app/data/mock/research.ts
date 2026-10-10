import type { ResearchSource } from '../source'
import { base64ToBytes } from '~/utils/bytes'
import { streamBytes } from './stand'
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

const framing: FramingView = {
  searchRange: 'перебор 0–16 · 1/2/4 байта',
  candidates: [
    { offset: 2, type: 'u8', adjust: 4, matched: 412, total: 417 },
    { offset: 2, type: 'u16 BE', adjust: 3, matched: 61, total: 417 },
    { offset: 4, type: 'u8', adjust: 1, matched: 38, total: 417 },
    { offset: 1, type: 'u16 LE', adjust: -80, matched: 12, total: 417 },
  ],
  signatures: [
    { label: 'AA 55', matched: 417, total: 417, ok: true },
    { label: '0A в конце', matched: 59, total: 417, ok: false },
  ],
  variability: [0.02, 0.02, 0.08, 0.55, 0.78, 0.88, 0.55, 0.72],
  variabilityNote: '0–1 постоянны (сигнатура), 4–7 меняются сильнее всего.',
  messageStarts: [],
  lengthField: { offset: 2, size: 1 },
  evidence: {
    hypothesis: 'длина = u8 @2 + 4',
    confirmed: '412 из 417 сообщений',
    scope: 'c0001–c0005, порт 5020',
    counterexamples: [
      { message: 'сообщ. 233', status: 'gap', note: 'задевает дыру' },
      { message: 'сообщ. 301', status: 'ambiguous', note: '' },
      { message: 'сообщ. 388', status: 'unknown', note: 'обрыв в конце потока' },
    ],
    note: 'Все 5 несовпадений объясняются дефектами захвата, а не правилом.',
  },
}

const actions: ActionsView = {
  log: { name: 'actions.csv', rows: 46 },
  rows: [
    { id: 'a1', time: '14:02:11.200', action: 'set_param', params: 'value = 21', result: 'ok', exchange: 'found' },
    { id: 'a2', time: '14:02:12.900', action: 'read_measure', params: '—', result: '21,0', exchange: 'found' },
    { id: 'a3', time: '14:02:19.410', action: 'set_param', params: 'value = 37', result: 'ok', exchange: 'found' },
    { id: 'a4', time: '14:02:21.050', action: 'read_measure', params: '—', result: '37,0', exchange: 'found' },
    { id: 'a5', time: '14:02:30.770', action: 'set_param', params: 'value = 1000', result: 'ok', exchange: 'found' },
    { id: 'a6', time: '14:02:32.300', action: 'read_measure', params: '—', result: '1000,0', exchange: 'found' },
    { id: 'a7', time: '14:02:40.010', action: 'reset', params: '—', result: 'ok', exchange: 'none' },
    { id: 'a8', time: '15:12:04.600', action: 'set_param', params: 'value = 70000', result: 'ok', exchange: 'found' },
  ],
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
  quickFix: { label: 'Тип u16be → i32be', note: 'Как подсказка Alt+Enter в IDE: правка видна сразу, сохраняется новой ревизией.' },
}

const hypotheses: HypothesesView = {
  items: [
    { id: 'H1', text: 'value в set_param равно параметру действия', status: 'supported', support: '41 / 41' },
    { id: 'H2', text: 'measure ÷ 10 равно результату read_measure', status: 'supported', support: '12 / 12' },
    { id: 'H3', text: 'последний байт — xor всех предыдущих', status: 'supported', support: '417 / 417' },
    { id: 'H4', text: 'value помещается в u16 без знака', status: 'refuted', support: '1 контрпример' },
    { id: 'H5', text: 'text_cmd передаёт строку ASCII с \\n в конце', status: 'untested', support: '' },
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
  counterexamples: [{ where: 'extra-1000.pcap · c0003 · сообщ. 88', expected: '70000', got: '4464 (0x1170)' }],
  note: 'Похоже, поле длиннее 2 байт: значение 70000 = 0x00011170. Длина сообщения при этом 9 вместо 7.',
  history: [
    { run: 'run-4', time: '16:40', status: 'refuted', label: 'опровергнута', scope: '3 записи', stale: false },
    { run: 'run-3', time: '15:02', status: 'supported', label: 'поддержана 41 / 41', scope: '1 запись', stale: true },
  ],
}

const verification: VerificationView = {
  run: { id: 'run-4', rev: 3, scope: 'все записи (3)', time: '16:40' },
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
    { status: 'violation', label: 'нарушение', where: 'extra-1000 · c0003 · 88', what: 'H4: 70000 не помещается в u16' },
    { status: 'violation', label: 'нарушение', where: 'base · c0004 · 17', what: 'crc не совпал (checksum TCP тоже плохой)' },
    { status: 'gap', label: 'неполное', where: 'base · c0002 · 233', what: 'длина 7, байтов 3 — дыра 192–256' },
    { status: 'ambiguous', label: 'неоднозначно', where: 'base · c0002 · 301', what: 'перекрытие кадров 1294 и 1296' },
    { status: 'unknown', label: 'не охвачено', where: 'extra-1000 · c0001 · 12', what: 'cmd 0x40 — нет типа' },
  ],
  diffWith: 'run-3',
  diff: [
    { label: 'Исправилось', value: '+2 · crc в c0001', tone: 'good' },
    { label: 'Новое', value: '+1 · H4 опровергнута', tone: 'bad' },
    { label: 'Без изменений', value: '1 201', tone: 'neutral' },
  ],
  runs: [
    { id: 'run-4', label: 'rev 3 · 3 записи', current: true },
    { id: 'run-3', label: 'rev 3 · 1 запись', current: false },
    { id: 'run-2', label: 'rev 2', current: false },
    { id: 'run-1', label: 'rev 1', current: false },
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
    getFraming: async (stream) => {
      await delay()
      return { ...structuredClone(framing), messageStarts: messageStarts(stream) }
    },
    getActions: async () => (await delay(), structuredClone(actions)),
    // В примере подробно описан обмен только для первого действия.
    getExchange: async id => (await delay(), id === exchange.actionId ? structuredClone(exchange) : null),
    getCompare: async () => (await delay(), structuredClone(compare)),
    getInterpretation: async () => (await delay(), structuredClone(interpretation)),
    getHypotheses: async () => (await delay(), structuredClone(hypotheses)),
    getHypothesisDetail: async id => (await delay(), id === hypothesisH4.id ? structuredClone(hypothesisH4) : null),
    getVerification: async () => (await delay(), structuredClone(verification)),
    startRun: async () => null,
    getReport: async () => (await delay(), structuredClone(report)),
  }
}
