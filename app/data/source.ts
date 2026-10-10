import type {
  Connection,
  ConnectionFlag,
  Frame,
  Job,
  Page,
  Project,
  Source,
  SourceDiagnostics,
  StreamBytes,
} from '~/api/types'
import type {
  ActionLog,
  ActionsView,
  CompareView,
  FramingView,
  HypothesesView,
  InterpretationView,
  ProjectExtras,
  ReportView,
  VerificationView,
} from './draft'

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
 * Экраны Ф2, для которых эндпоинтов в контракте ещё нет.
 * Пока отдаются примером данных; при появлении эндпоинтов метод переезжает в ContractSource.
 */
export interface DraftSource {
  getProjectExtras(): Promise<ProjectExtras>
  getActionLogs(): Promise<ActionLog[]>
  getFraming(stream: string): Promise<FramingView>
  getActions(): Promise<ActionsView>
  getCompare(): Promise<CompareView>
  getInterpretation(): Promise<InterpretationView>
  getHypotheses(): Promise<HypothesesView>
  getVerification(): Promise<VerificationView>
  getReport(): Promise<ReportView>
}

export type DataSourceKind = 'mock' | 'live'

export interface DataSource extends ContractSource, DraftSource {
  /** Откуда берутся данные контракта. */
  readonly kind: DataSourceKind
}
