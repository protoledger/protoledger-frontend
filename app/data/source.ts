import type {
  ActionLogGuess,
  ActionLogMapping,
  CorpusFilter,
  DeviceConnections,
  EntropyPage,
  ExchangeGraph,
  ExchangePairPage,
  FieldBehaviorHints,
  FieldHints,
  ActionLogRecord,
  ByteExplanation,
  ChecksumHints,
  ClockOffset,
  Comparison,
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
  Suggestion,
  TypeHints,
} from '~/api/types'
import type {
  ActionLog,
  ActionsView,
  AnchorRef,
  CoverageView,
  DraftView,
  FixHintsView,
  NextStepsView,
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
  SearchEntry,
  SuggestionsView,
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
  /** Догадка движка о колонках журнала с причинами и пробным разбором; null — движка нет (пример данных). */
  guessActionLog(file: File): Promise<ActionLogGuess | null>
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
  /** Действия журнала (по умолчанию первого) страницей с offset, с обменом для каждой строки. */
  getActions(logId?: string, offset?: number): Promise<ActionsView>
  getExchange(actionId: string): Promise<ExchangeView | null>
  /** Сравнение сообщений одного действия журнала; без action — первое действие с параметрами. */
  /** Без logId — первый журнал проекта. */
  getCompare(action?: string, logId?: string): Promise<CompareView>
  /** Наблюдение на байтах потока; false — пример данных, не сохраняется. */
  createObservation(anchor: AnchorRef, comment: string): Promise<boolean>
  getInterpretation(): Promise<InterpretationView>
  /** Применить текст к потоку без сохранения; без yaml — последняя сохранённая ревизия. */
  previewInterpretation(stream: string, yaml?: string): Promise<Pick<InterpretationView, 'tree' | 'preview' | 'violations'>>
  /** Проверить и сохранить текст; created = false — смысл не изменился, ревизии нет. */
  saveInterpretation(yaml: string): Promise<{ rev: number, created: boolean }>
  getInterpretationRevisions(): Promise<number[]>
  /** Подсказка типа поля по значениям в записях; null — пример данных. Поле группы — «группа.поле». */
  getFieldHints(messageId: string, field: string, yaml?: string): Promise<FieldHints | null>
  getInterpretationRevision(rev: number): Promise<string>
  getHypotheses(): Promise<HypothesesView>
  getHypothesisDetail(id: string): Promise<HypothesisDetail | null>
  /** Объекты проекта для поиска везде: соединения, гипотезы, прогоны, наблюдения. */
  getSearchIndex(): Promise<SearchEntry[]>
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
  /** Черновик описания по потокам (и журналам) одним запросом; результат — текст для редактора. */
  getDraft(streams: string[], logId?: string): Promise<DraftView>
  /** «Что дальше»: следующие шаги исследования по состоянию проекта. */
  getNextSteps(): Promise<NextStepsView>
  /** Подсказка исправления опровергнутой гипотезы; yaml — несохранённый текст. */
  getFixHints(hypothesis: string, yaml?: string): Promise<FixHintsView>
  /** Карта покрытия байтов описанием по типам сообщений. */
  getCoverage(yaml?: string): Promise<CoverageView>
  /** «Объясни байт»: сообщение, поля, наблюдения и итоги прогонов для байта потока. */
  explainByte(stream: string, offset: number): Promise<ByteExplanation>
  /** Соединения устройства по журналу действий; null — журнала в проекте нет. */
  getDeviceConnections(): Promise<DeviceConnections | null>
  /** Оценка сдвига часов журнала относительно записей; null — оценки нет (пример данных). */
  getClockOffset(logId: string): Promise<ClockOffset | null>
  /** Подсказки для описания по сохранённым границам сообщений: типы, поведение полей, контрольные суммы, энтропия. */
  getTypeHints(streams: string[]): Promise<TypeHints>
  getFieldBehavior(streams: string[], messageId?: string): Promise<FieldBehaviorHints>
  getChecksumHints(streams: string[], messageId?: string): Promise<ChecksumHints>
  getEntropy(streams: string[]): Promise<EntropyPage>
  /** Пары запрос→ответ соединения по времени; границы — из сохранённого описания. */
  getExchangePairs(connection: string, offset?: number): Promise<ExchangePairPage>
  /** Граф обмена по всем соединениям: типы, ответы, переходы. */
  getExchangeGraph(): Promise<ExchangeGraph>
  /** Одно описание на двух наборах записей (sha256): какие типы, значения полей и задержки отличаются. */
  compareCaptures(a: string[], b: string[]): Promise<Comparison>
  /** Заготовки наблюдений и гипотез по всем потокам проекта. */
  getSuggestions(): Promise<SuggestionsView>
  /** Принять заготовку: наблюдение на байтах и гипотеза на нём; id гипотезы или null — пример данных. */
  acceptSuggestion(s: Suggestion): Promise<string | null>
}

export type DataSourceKind = 'mock' | 'live'

export interface DataSource extends ContractSource, ResearchSource {
  /** Откуда берутся данные контракта. */
  readonly kind: DataSourceKind
  /** Экраны, которые и в live показывают пример данных (эндпоинтов нет). */
  readonly sampleOnly: ReadonlySet<string>
}
