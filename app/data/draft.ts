// Черновые типы экранов Ф2: эндпоинтов в контракте ещё нет.
// Когда бэкенд добавит их в openapi.yaml, тип заменяется сгенерированным из ~/api/types.
import type { KnowledgeStatus } from '~/utils/status'

export interface ProjectExtras {
  title: string
  createdAt: string
  actionCount: number
  interpretationRevs: { rev: number, current: boolean }[]
  observationCount: number
  hypothesisCount: number
  runCount: number
  matchWindowMs: number
  maxMessageBytes: number
  interpretationRev: number
  interpretationDirty: boolean
}

export interface ActionLog {
  name: string
  rows: number
  mapping: { column: string, field: string }[]
  status: 'mapped' | 'needs_mapping'
}

export interface FramingCandidate {
  offset: number
  type: string
  adjust: number
  matched: number
  total: number
}

export interface FramingView {
  searchRange: string
  candidates: FramingCandidate[]
  signatures: { label: string, matched: number, total: number, ok: boolean }[]
  variability: number[]
  variabilityNote: string
  /** Начала сообщений и поля длины для наложения на поток (смещения потока). */
  messageStarts: number[]
  lengthField: { offset: number, size: number }
  evidence: {
    hypothesis: string
    confirmed: string
    scope: string
    counterexamples: { message: string, status: KnowledgeStatus, note: string }[]
    note: string
  }
}

export interface ActionRow {
  id: string
  time: string
  action: string
  params: string
  result: string
  exchange: 'found' | 'none'
}

export interface ExchangeSide {
  title: string
  direction: string
  bytes: string[]
  highlight: number[]
}

export interface ActionsView {
  log: { name: string, rows: number }
  rows: ActionRow[]
  exchange: {
    actionId: string
    label: string
    windowFrom: string
    windowTo: string
    windowLabel: string
    /** События в окне: положение 0..1 и вид. */
    events: { at: number, kind: 'action' | 'request' | 'response' | 'other' }[]
    request: ExchangeSide
    response: ExchangeSide
    note: string
  }
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
  rev: number
  dirty: boolean
  tree: InterpretationTreeNode[]
  yaml: YamlLine[]
  selectedLine: number
  preview: { stream: string, rows: { label: string, value: string }[] }
  field: { line: number, status: KnowledgeStatus, ref: string, counterexamples: number, where: string }
  quickFix: { label: string, note: string }
}

export interface Hypothesis {
  id: string
  text: string
  status: 'supported' | 'refuted' | 'untested'
  support: string
}

export interface HypothesesView {
  items: Hypothesis[]
  questions: string[]
  selected: {
    id: string
    title: string
    claim: string
    test: string
    scope: string
    basis: string
    counterexamples: { where: string, expected: string, got: string }[]
    note: string
    history: { run: string, time: string, status: Hypothesis['status'], label: string, scope: string, stale: boolean }[]
  }
}

export type ResultCategory = 'matched' | 'violated' | 'incomplete' | 'ambiguous' | 'uncovered' | 'out_of_scope' | 'unsupported' | 'limit'

export interface VerificationView {
  run: { id: string, rev: number, scope: string, time: string }
  filters: { label: string, active: boolean }[]
  totals: { value: string, label: string }[]
  categories: { key: ResultCategory, label: string, count: number }[]
  categoriesNote: string
  problems: { status: KnowledgeStatus, label: string, where: string, what: string }[]
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
