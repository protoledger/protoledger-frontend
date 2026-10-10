import type {
  Connection,
  ConnectionFlag,
  Frame,
  Job,
  Page,
  Project,
  ProjectSettings,
  Source,
  SourceDiagnostics,
  StreamBytes,
} from '~/api/types'
import type {
  ActionLog,
  ActionsView,
  CompareView,
  ExchangeView,
  FramingView,
  HypothesesView,
  HypothesisDetail,
  InterpretationView,
  ProjectExtras,
  ReportView,
  VerificationView,
} from './views'

export interface ConnectionQuery {
  limit?: number
  offset?: number
  source?: string
  port?: number
  address?: string
  flag?: ConnectionFlag
}

/** Операции, которые уже есть в контракте API (openapi.yaml). */
export interface ContractSource {
  getProject(): Promise<Project | null>
  /** Меняет политики сборки; записи собираются заново фоновыми задачами. */
  updateSettings(patch: Partial<ProjectSettings>): Promise<Project>
  listSources(): Promise<Page<Source>>
  importSource(file: File): Promise<string>
  getDiagnostics(sha256: string): Promise<SourceDiagnostics>
  listConnections(query: ConnectionQuery): Promise<Page<Connection>>
  getStreamBytes(stream: string, from: number, len: number): Promise<StreamBytes>
  getFrame(source: string, frameNo: number): Promise<Frame>
  listJobs(): Promise<Job[]>
  cancelJob(id: string): Promise<Job>
  /** Подписка на изменения задачи; возвращает функцию отписки. */
  watchJob(id: string, onUpdate: (job: Job) => void): () => void
}

/**
 * Модели экранов исследования. Живой источник собирает их из эндпоинтов движка;
 * экраны, для которых эндпоинтов нет (sampleOnly), всегда показывают пример данных.
 */
export interface ResearchSource {
  getProjectExtras(): Promise<ProjectExtras>
  getActionLogs(): Promise<ActionLog[]>
  getFraming(stream: string): Promise<FramingView>
  getActions(): Promise<ActionsView>
  getExchange(actionId: string): Promise<ExchangeView | null>
  getCompare(): Promise<CompareView>
  getInterpretation(): Promise<InterpretationView>
  getHypotheses(): Promise<HypothesesView>
  getHypothesisDetail(id: string): Promise<HypothesisDetail | null>
  getVerification(): Promise<VerificationView>
  /** Запускает прогон проверки; id задачи или null, если запуск недоступен (пример данных). */
  startRun(): Promise<string | null>
  getReport(): Promise<ReportView>
}

export type DataSourceKind = 'mock' | 'live'

export interface DataSource extends ContractSource, ResearchSource {
  /** Откуда берутся данные контракта. */
  readonly kind: DataSourceKind
  /** Экраны, которые и в live показывают пример данных (эндпоинтов нет). */
  readonly sampleOnly: ReadonlySet<string>
}
