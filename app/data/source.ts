import type {
  ActionLogMapping,
  CorpusFilter,
  ActionLogRecord,
  Connection,
  ConnectionFlag,
  Frame,
  FramingSpec,
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
  AnchorRef,
  CompareView,
  ExchangeView,
  FramingDetail,
  FramingView,
  HypothesesView,
  Hypothesis,
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
  /** Создаёт или открывает папку проекта; относительный путь — от каталога проектов движка. */
  openProject(path: string, mode: 'create' | 'open'): Promise<Project>
  /** Меняет политики сборки; записи собираются заново фоновыми задачами. */
  updateSettings(patch: Partial<ProjectSettings>): Promise<Project>
  listSources(): Promise<Page<Source>>
  importSource(file: File): Promise<string>
  /** Импорт журнала действий: колонки CSV сопоставляются явно, формат журнала заранее неизвестен. */
  importActionLog(file: File, mapping: ActionLogMapping): Promise<ActionLogRecord>
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
  getFramingDetail(stream: string, spec: FramingSpec): Promise<FramingDetail>
  /** Записывает фрейминг в интерпретацию новой ревизией; номер ревизии или null для примера данных. */
  applyFraming(spec: FramingSpec): Promise<number | null>
  getActions(): Promise<ActionsView>
  getExchange(actionId: string): Promise<ExchangeView | null>
  /** Сравнение сообщений одного действия журнала; без action — первое действие с параметрами. */
  getCompare(action?: string): Promise<CompareView>
  /** Наблюдение на байтах потока; false — пример данных, не сохраняется. */
  createObservation(anchor: AnchorRef, comment: string): Promise<boolean>
  getInterpretation(): Promise<InterpretationView>
  /** Применить текст к потоку без сохранения; без yaml — последняя сохранённая ревизия. */
  previewInterpretation(stream: string, yaml?: string): Promise<Pick<InterpretationView, 'tree' | 'preview'>>
  /** Проверить и сохранить текст; created = false — смысл не изменился, ревизии нет. */
  saveInterpretation(yaml: string): Promise<{ rev: number, created: boolean }>
  getInterpretationRevisions(): Promise<number[]>
  getInterpretationRevision(rev: number): Promise<string>
  getHypotheses(): Promise<HypothesesView>
  getHypothesisDetail(id: string): Promise<HypothesisDetail | null>
  /** Наблюдения проекта — основания для гипотез. */
  getObservations(): Promise<{ id: string, text: string }[]>
  /** Создать гипотезу; id или null — пример данных, не сохраняется. */
  createHypothesis(input: { statement: string, test: string, basis: string[] }): Promise<string | null>
  /** Статус ставит исследователь: проверка теста сам статус не меняет. */
  setHypothesisStatus(id: string, status: Hypothesis['status']): Promise<boolean>
  createQuestion(text: string): Promise<boolean>
  /** Прогон по id; без id — последний. */
  getVerification(runId?: string): Promise<VerificationView>
  /** Запускает прогон на корпусе; id задачи или null, если запуск недоступен (пример данных). */
  startRun(corpus?: CorpusFilter): Promise<string | null>
  getReport(): Promise<ReportView>
  /** Отчёт движка по прогону (без runId — последний); null — пример данных. */
  generateReport(format: 'md' | 'html', runId?: string): Promise<{ fileName: string, content: string } | null>
  /** Прогоны для выбора, новые первыми. */
  listRuns(): Promise<{ id: string, label: string, stale: boolean }[]>
}

export type DataSourceKind = 'mock' | 'live'

export interface DataSource extends ContractSource, ResearchSource {
  /** Откуда берутся данные контракта. */
  readonly kind: DataSourceKind
  /** Экраны, которые и в live показывают пример данных (эндпоинтов нет). */
  readonly sampleOnly: ReadonlySet<string>
}
