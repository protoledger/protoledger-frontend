// Модели экранов исследования. Живой источник собирает их из ответов движка (live-research.ts),
// пример данных — mock/research.ts; экраны зависят только от этих моделей.
import type { FramingSpec } from '~/api/types'
import type { KnowledgeStatus } from '~/utils/status'

export interface ProjectExtras {
  title: string
  createdAt: string | null
  actionCount: number
  interpretationRevs: { rev: number, current: boolean }[]
  observationCount: number
  hypothesisCount: number
  runCount: number
  matchWindowMs: number | null
  maxMessageBytes: number | null
  interpretationRev: number
  interpretationDirty: boolean
}

export interface ActionLog {
  name: string
  rows: number
  mapping: { column: string, field: string }[]
  status: 'mapped' | 'needs_mapping'
}

export interface FramingEvidence {
  hypothesis: string
  confirmed: string
  scope: string
  counterexamples: { message: string, status: KnowledgeStatus, note: string }[]
  note: string
}

export interface FramingCandidate {
  id: string
  offset: number
  type: string
  adjust: number
  messages: number
  /** Доля байтов, разбитых без противоречий, «98,8%». */
  share: string
  /** Фрейминг в форме движка — уходит обратно в предпросмотр и интерпретацию. */
  spec: FramingSpec
  evidence: FramingEvidence
}

export interface FramingView {
  searchRange: string
  candidates: FramingCandidate[]
  signatures: { label: string, matched: number, total: number, ok: boolean }[]
  /** Оговорки анализа: неполный перебор, обрезка данных. */
  notes: string[]
}

/** Что даёт выбранный кандидат на потоке: границы сообщений и изменчивость по смещениям. */
export interface FramingDetail {
  messageStarts: number[]
  variability: number[]
  variabilityNote: string
}

export interface ActionRow {
  id: string
  time: string
  action: string
  params: string
  result: string
  /** unknown — обмен ещё не искали (ищется при выборе действия). */
  exchange: 'found' | 'none' | 'unknown'
}

export interface ExchangeSide {
  title: string
  direction: string
  bytes: string[]
  highlight: number[]
}

export interface ActionsView {
  log: { name: string, rows: number } | null
  rows: ActionRow[]
}

export interface ExchangeView {
  actionId: string
  label: string
  windowFrom: string
  windowTo: string
  windowLabel: string
  /** События в окне: положение 0..1 и вид. */
  events: { at: number, kind: 'action' | 'request' | 'response' | 'other' }[]
  request: ExchangeSide | null
  response: ExchangeSide | null
  note: string
}

export interface CompareRow {
  label: string
  bytes: string[]
  changed: boolean[]
}

export interface CompareView {
  chips: string[]
  requests: CompareRow[]
  mask: boolean[]
  responses: CompareRow[]
  correlations: { position: string, read: string, values: string, relation: string, share: string }[]
  observations: { id: string, text: string, status: KnowledgeStatus, anchor?: string }[]
  observationTotal: number
}

export interface YamlLine {
  text: string
  mark?: KnowledgeStatus
}

export interface InterpretationTreeNode {
  label: string
  status?: KnowledgeStatus
  badge?: string
  children?: InterpretationTreeNode[]
  selected?: boolean
}

export interface InterpretationView {
  /** null — интерпретация ещё не создана. */
  rev: number | null
  dirty: boolean
  tree: InterpretationTreeNode[]
  yaml: YamlLine[]
  selectedLine: number
  preview: { stream: string, rows: { label: string, value: string }[] }
  field: { line: number, status: KnowledgeStatus, ref: string, counterexamples: number, where: string } | null
  quickFix: { label: string, note: string } | null
}

export interface Hypothesis {
  id: string
  text: string
  status: 'supported' | 'refuted' | 'untested' | 'superseded'
  support: string
}

export interface HypothesesView {
  items: Hypothesis[]
  questions: string[]
}

export interface HypothesisDetail {
  id: string
  title: string
  status: Hypothesis['status']
  /** Итог теста на записях: «10 / 10»; пусто, если теста нет. */
  support: string
  claim: string
  test: string
  scope: string
  basis: string
  counterexamples: { where: string, expected: string, got: string }[]
  note: string
  history: { run: string, time: string, status: Hypothesis['status'], label: string, scope: string, stale: boolean }[]
}

// Категории контракта плюс out_of_scope/unsupported — ограничения области и реализации.
export type ResultCategory = 'matched' | 'violated' | 'incomplete' | 'ambiguous' | 'unmatched' | 'limit_exceeded' | 'out_of_scope' | 'unsupported'

export interface VerificationView {
  /** null — прогонов ещё не было. */
  run: { id: string, rev: number | null, scope: string, time: string } | null
  filters: { label: string, active: boolean }[]
  totals: { value: string, label: string }[]
  categories: { key: ResultCategory, label: string, count: number }[]
  categoriesNote: string
  problems: { status: KnowledgeStatus, label: string, where: string, what: string }[]
  diffWith: string | null
  diff: { label: string, value: string, tone: 'good' | 'bad' | 'neutral' }[]
  runs: { id: string, label: string, current: boolean }[]
  runsNote: string
}

export interface ReportView {
  meta: string
  title: string
  sections: string[]
  summary: string
  fields: { name: string, type: string, status: KnowledgeStatus, basis: string }[]
  scope: string
  questions: string[]
}
