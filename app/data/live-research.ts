import { ApiError, apiClient, unwrap } from '~/api/client'
import type { components } from '~/api/schema'
import type { MessageKey } from '~/i18n'
import { base64ToBytes, formatCount, hexByte } from '~/utils/bytes'
import { intlLocale, tr } from '~/utils/i18n'
import type { KnowledgeStatus } from '~/utils/status'
import { collectConnections } from './connections'
import type { ContractSource, ResearchSource } from './source'
import { framingOnlyYaml, replaceFramingBlock } from '~/utils/interpretation-yaml'
import type { CompareRow, CompareView, ExchangeSide, ExchangeView, FieldViolation, FramingCandidate, Hypothesis, InterpretationTreeNode, ResultCategory, StreamLink, VerificationView } from './views'

type S = components['schemas']

const CATEGORY: Record<string, { label: string, status: KnowledgeStatus }> = {
  matched: { get label() { return tr('data.cat.matched') }, status: 'rule' },
  violated: { get label() { return tr('data.cat.violated') }, status: 'violation' },
  incomplete: { get label() { return tr('data.cat.incomplete') }, status: 'gap' },
  ambiguous: { get label() { return tr('data.cat.ambiguous') }, status: 'ambiguous' },
  unmatched: { get label() { return tr('data.cat.unmatched') }, status: 'unknown' },
  limit_exceeded: { get label() { return tr('data.cat.limit_exceeded') }, status: 'violation' },
}

const HYPOTHESIS_STATUS: Record<S['HypothesisStatus'], Hypothesis['status']> = {
  proposed: 'untested',
  supported: 'supported',
  refuted: 'refuted',
  superseded: 'superseded',
}

const API_HYPOTHESIS_STATUS: Record<Hypothesis['status'], S['HypothesisStatus']> = {
  untested: 'proposed',
  supported: 'supported',
  refuted: 'refuted',
  superseded: 'superseded',
}

const COUNTER_REASON: Record<S['FramingCounter']['reason'], { status: KnowledgeStatus, note: string }> = {
  bad_length: { status: 'violation', get note() { return tr('data.counter.bad_length') } },
  overrun: { status: 'gap', get note() { return tr('data.counter.overrun') } },
  short_header: { status: 'gap', get note() { return tr('data.counter.short_header') } },
  dissimilar: { status: 'unknown', get note() { return tr('data.counter.dissimilar') } },
}

const ACTIONS_PAGE = 200

const pct = (permille: number) => `${(permille / 10).toFixed(1).replace('.', ',')}%`

function lengthType(h: S['LengthHint']) {
  return h.width === 1 ? 'u8' : `u${h.width * 8} ${h.bigEndian ? 'BE' : 'LE'}`
}

interface ExchangePart { source: string, stream: string, start: number, end: number, time: number, frameNo?: number, lastFrameNo?: number }

// Запрос — первое после действия в направлении a→b, ответ — первое после запроса в обратном.
// used — уже занятые части: у действий с одинаковым временем запросы идут по порядку, а не один на всех.
// Без интерпретации части — кадры TCP: ход стороны (запрос в нескольких сегментах) склеиваем
// из подряд идущих кадров потока до первого кадра обратной стороны.
export function pickExchange(ex: S['Exchange'], used = new Set<string>()): { request?: ExchangePart, response?: ExchangePart } {
  const key = (p: ExchangePart) => `${p.stream}@${p.start}`
  const actionAt = Date.parse(ex.action.time)
  const byFrames = !ex.messages.length
  const parts: ExchangePart[] = byFrames
    ? ex.frames.filter(f => !f.duplicate).map(f => ({ source: f.source, stream: f.stream, start: f.start, end: f.end, time: Date.parse(f.time), frameNo: f.frameNo }))
    : ex.messages.map(m => ({ source: m.source, stream: m.stream, start: m.start, end: m.end, time: Date.parse(m.firstTime) }))
  const byTime = (a: ExchangePart, b: ExchangePart) => a.time - b.time || a.start - b.start
  const free = (dir: string, after: number) => parts.filter(p => p.stream.endsWith(dir) && p.time >= after && !used.has(key(p))).sort(byTime)
  const turn = (first: ExchangePart, before: number): ExchangePart => {
    const merged = { ...first }
    if (!byFrames) return merged
    for (;;) {
      const next = parts.find(p => p.stream === merged.stream && p.start === merged.end && p.time < before && !used.has(key(p)))
      if (!next) return merged
      used.add(key(next))
      merged.end = next.end
      merged.lastFrameNo = next.frameNo
    }
  }
  const firstRequest = free(':ab', actionAt)[0]
  if (!firstRequest) return {}
  used.add(key(firstRequest))
  const firstResponse = free(':ba', firstRequest.time)[0]
  const request = turn(firstRequest, firstResponse?.time ?? Infinity)
  if (!firstResponse) return { request }
  used.add(key(firstResponse))
  const response = turn(firstResponse, free(':ab', firstResponse.time)[0]?.time ?? Infinity)
  return { request, response }
}

function clock(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleTimeString(intlLocale(), { timeZone: 'UTC' })}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}

function pairs(obj: Record<string, number | string>) {
  const entries = Object.entries(obj)
  return entries.length ? entries.map(([k, v]) => `${k} = ${v}`).join(', ') : '—'
}

const staleReason = (r: S['StaleReason']) => tr(`data.stale.${r}` as MessageKey)

// Итог теста гипотезы: «поддержана на N», а не «доказана».
const normTest = (t: string) => t.replace(/\s+/g, '')

function verdictLabel(v: 'untested' | 'no_counterexample' | 'refuted' | null) {
  return v === 'refuted' ? tr('data.v.refuted') : v === 'no_counterexample' ? tr('data.v.none') : v === 'untested' ? tr('data.v.untested') : '—'
}

// Сравнивать имеет смысл только прогоны одного корпуса: иначе разница — это другие данные, а не правка.
function corpusKey(c: S['CorpusFilter']) {
  return JSON.stringify([[...(c.sources ?? [])].sort(), c.direction ?? null, c.port ?? null])
}

const FULL_CORPUS = corpusKey({})

// Сначала исправленные и ухудшенные, затем по номеру: H2 раньше H10.
const CHANGE_ORDER: Record<string, number> = { fixed: 0, regressed: 1 }

export function hypothesisChanges(items: S['RunHypothesisChange'][]): VerificationView['hypothesisChanges'] {
  const num = (id: string) => Number(/\d+/.exec(id)?.[0] ?? Infinity)
  return [...items]
    .sort((a, b) => (CHANGE_ORDER[a.kind] ?? 2) - (CHANGE_ORDER[b.kind] ?? 2) || num(a.id) - num(b.id) || a.id.localeCompare(b.id))
    .map((h) => {
      const parts: string[] = []
      if (h.from !== h.to) parts.push(`${verdictLabel(h.from)} → ${verdictLabel(h.to)}`)
      if (h.counterexamplesFrom !== h.counterexamplesTo) parts.push(tr('data.ch.cx', { from: formatCount(h.counterexamplesFrom), to: formatCount(h.counterexamplesTo) }))
      if (h.applicableFrom !== h.applicableTo) parts.push(tr('data.ch.checks', { from: formatCount(h.applicableFrom), to: formatCount(h.applicableTo) }))
      return {
        id: h.id,
        text: parts.join(', ') || (h.kind === 'added' ? tr('data.ch.added') : h.kind === 'removed' ? tr('data.ch.removed') : tr('data.ch.test')),
        tone: h.kind === 'fixed' ? 'good' : h.kind === 'regressed' ? 'bad' : 'neutral',
      }
    })
}

function staleText(run: { stale: boolean, staleReasons: S['StaleReason'][] }) {
  return run.stale ? run.staleReasons.map(staleReason).join(', ') || tr('data.stale') : null
}

/** Якорь движка → адрес «Обзора»: поток `<запись>:cNNNN:ab` — соединение и направление. */
function linkOf(a: S['Anchor']): StreamLink | null {
  const cut = a.stream.lastIndexOf(':')
  const dir = a.stream.slice(cut + 1)
  if (cut < 0 || (dir !== 'ab' && dir !== 'ba')) return null
  return { conn: a.stream.slice(0, cut), dir, from: a.start, to: a.end }
}

function shortStream(stream: string) {
  const [, conn, dir] = stream.split(':')
  return `${conn ?? stream}${dir ? ` ${dir === 'ab' ? 'a→b' : 'b→a'}` : ''}`
}

/** Модели экранов исследования из эндпоинтов движка (контракт 0.1.2–0.1.6). */
export function createLiveResearchSource(contract: ContractSource, sample: ResearchSource): ResearchSource {
  const api = apiClient()

  async function sourceNames() {
    const page = await contract.listSources()
    return new Map(page.items.map(s => [s.sha256, s.name]))
  }

  function where(names: Map<string, string>, a: { source: string, stream: string, start: number, end: number }) {
    return `${names.get(a.source) ?? a.source.slice(0, 8)} · ${shortStream(a.stream)} · [${a.start}, ${a.end})`
  }

  // Итог гипотезы в прогоне — тем же языком, что на «Проверке».
  function runVerdict(h: S['RunHypothesis'], runId: string): { status: KnowledgeStatus, label: string } {
    if (h.verdict === 'refuted') return { status: 'violation', label: tr('data.run.refuted', { run: runId, n: formatCount(h.counterexamples) }) }
    if (h.verdict === 'no_counterexample') return { status: 'hypothesis', label: `${runId}: ${formatCount(h.held)} / ${formatCount(h.applicable)}` }
    return { status: 'unknown', label: tr('data.run.untested', { run: runId }) }
  }

  // История статуса — по последним прогонам: в каждом прогоне свой итог теста.
  async function historyOf(test: string) {
    const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 10 } } })).items
    const details = await Promise.all(runs.map(r => api.GET('/api/runs/{id}', { params: { path: { id: r.id } } }).then(unwrap)))
    return details.flatMap((d, i) => {
      const h = d.hypotheses?.find(x => normTest(x.test) === normTest(test))
      if (!h) return []
      const status: Hypothesis['status'] = h.verdict === 'refuted' ? 'refuted' : h.verdict === 'no_counterexample' ? 'supported' : 'untested'
      return [{
        run: d.id,
        time: tr('shell.top.version', { n: d.revision ?? '—' }),
        status,
        label: h.verdict === 'refuted' ? tr('data.h.refuted', { n: formatCount(h.counterexamples) }) : h.verdict === 'no_counterexample' ? tr('data.h.supported', { held: formatCount(h.held), all: formatCount(h.applicable) }) : tr('data.v.untested'),
        scope: tr('data.caps', { n: d.sources.length }),
        stale: runs[i]!.stale,
      }]
    })
  }

  async function revisions() {
    return unwrap(await api.GET('/api/interpretation/revisions')).items
  }

  // Пока ревизий нет, GET /api/interpretation отвечает 404 и браузер пишет ошибку в консоль: сначала спрашиваем список.
  async function currentInterpretation(): Promise<S['InterpretationDoc'] | null> {
    if (!(await revisions()).length) return null
    try {
      return unwrap(await api.GET('/api/interpretation'))
    }
    catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  }

  async function hexOf(stream: string, start: number, end: number): Promise<string[]> {
    const res = await contract.getStreamBytes(stream, start, Math.min(end - start, 32))
    return res.segments.flatMap(seg => (seg.data ? Array.from(base64ToBytes(seg.data)).map(hexByte) : Array.from({ length: seg.end - seg.start }, () => '░░')))
  }

  // Для предпросмотра по умолчанию — самый длинный поток: в нём больше всего сообщений.
  async function defaultStream(): Promise<string | null> {
    const page = await collectConnections(contract)
    let best: { id: string, len: number } | null = null
    for (const c of page.items) {
      for (const st of c.streams) {
        if (!best || st.dataBytes > best.len) best = { id: st.id, len: st.dataBytes }
      }
    }
    return best?.id ?? null
  }

  async function previewOf(stream: string, yaml?: string) {
    const preview = unwrap(await api.POST('/api/interpretation/preview', { body: { stream, limit: 500, offset: 0, ...(yaml === undefined ? {} : { yaml }) } }))

    // Дерево типов строится по разбору движка, а не по тексту: фронт YAML не интерпретирует.
    const byType = new Map<string, Map<string, S['PreviewField']['status']>>()
    let untyped = 0
    for (const m of preview.items) {
      if (!m.messageId) {
        untyped++
        continue
      }
      const fields = byType.get(m.messageId) ?? new Map()
      for (const f of m.fields) fields.set(f.name, f.status)
      byType.set(m.messageId, fields)
    }
    const tree: InterpretationTreeNode[] = [{
      label: tr('data.tree.types'),
      badge: String(byType.size),
      children: [
        ...[...byType].map(([name, fields]) => ({
          label: name,
          children: [...fields].map(([field, status]) => ({ label: field, status: status as KnowledgeStatus })),
        })),
        ...(untyped ? [{ label: `${tr('data.untyped')} · ${untyped}`, status: 'unknown' as const }] : []),
      ],
    }]
    const counts = preview.counts ?? {}
    const total = Object.values(counts).reduce((n, c) => n + c, 0)
    // Одно нарушение одного поля повторяется в каждом сообщении — показываем первое объяснение и число.
    const byField = new Map<string, FieldViolation>()
    for (const m of preview.items) {
      for (const v of m.violations) {
        const key = `${m.messageId ?? ''}|${v.id}|${v.kind}`
        const seen = byField.get(key)
        if (seen) seen.count++
        else byField.set(key, { messageId: m.messageId, field: v.id, kind: v.kind, detail: v.detail, count: 1 })
      }
    }
    return {
      tree,
      violations: [...byField.values()],
      preview: {
        stream: shortStream(stream),
        rows: preview.outOfScope
          ? [{ label: tr('data.pv.stream'), value: tr('data.pv.outOfScope') }]
          : [
              { label: tr('data.messages'), value: formatCount(total) },
              ...Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => ({ label: CATEGORY[k]?.label ?? k, value: formatCount(c) })),
              { label: tr('data.unknownBytes'), value: formatCount(preview.unknownBytes ?? 0) },
              // Структура и нарушения собираются по первой странице сообщений — говорим, если она не вся.
              ...(preview.items.length < total ? [{ label: tr('data.pv.partial'), value: tr('data.pv.firstOf', { n: formatCount(preview.items.length), total: formatCount(total) }) }] : []),
            ],
      },
    }
  }

  return {
    async getProjectExtras() {
      const [project, revs, obs, hyps, runs, logs] = await Promise.all([
        contract.getProject(),
        revisions(),
        api.GET('/api/observations').then(unwrap),
        api.GET('/api/hypotheses').then(unwrap),
        api.GET('/api/runs', { params: { query: { limit: 1 } } }).then(unwrap),
        api.GET('/api/action-logs').then(unwrap),
      ])
      const sorted = [...revs].sort((a, b) => b.rev - a.rev)
      return {
        title: project?.name ?? tr('data.project'),
        createdAt: null,
        actionCount: logs.items.reduce((n, l) => n + l.rows, 0),
        interpretationRevs: sorted.map((r, i) => ({ rev: r.rev, current: i === 0 })),
        observationCount: obs.items.length,
        hypothesisCount: hyps.items.length,
        runCount: runs.total,
        matchWindowMs: null,
        maxMessageBytes: null,
        interpretationRev: sorted[0]?.rev ?? 0,
        interpretationDirty: false,
      }
    },

    async getActionLogs() {
      const { items } = unwrap(await api.GET('/api/action-logs'))
      return items.filter(l => !l.replacedBy).map(l => ({
        name: l.name,
        rows: l.rows,
        mapping: [
          { column: l.mapping.time, field: tr('data.col.time') },
          { column: l.mapping.action, field: tr('data.col.action') },
          ...(l.mapping.params ? [{ column: l.mapping.params, field: tr('data.col.params') }] : []),
          ...(l.mapping.result ? [{ column: l.mapping.result, field: tr('data.col.result') }] : []),
        ],
        status: l.rows > 0 ? 'mapped' as const : 'needs_mapping' as const,
      }))
    },

    async getActions(logId, offset = 0) {
      const { items } = unwrap(await api.GET('/api/action-logs'))
      // Заменённые записи (повторный импорт, поправка часов) в анализе не участвуют — в выбор их не даём.
      const logs = items.filter(l => !l.replacedBy).map(l => ({ id: l.id, name: l.name, rows: l.rows, clockOffsetMs: l.mapping.clockOffsetMs ?? 0 }))
      const log = logs.find(l => l.id === logId) ?? logs[0] ?? null
      if (!log) return { logs, log: null, rows: [], total: 0, offset: 0, exchanges: null, exchangeNote: null }
      const page = unwrap(await api.GET('/api/action-logs/{id}/actions', { params: { path: { id: log.id }, query: { limit: ACTIONS_PAGE, offset } } }))
      let exchanges: S['ActionExchangePage'] | null = null
      let exchangeNote: string | null = null
      try {
        exchanges = unwrap(await api.GET('/api/action-logs/{id}/exchanges', { params: { path: { id: log.id }, query: { limit: ACTIONS_PAGE, offset } } }))
      }
      catch (e) {
        // Без сохранённой интерпретации нет сообщений — обмены искать не по чему.
        if (!(e instanceof ApiError && e.status === 409)) throw e
        exchangeNote = tr('data.ex.note')
      }
      const byLine = new Map((exchanges?.items ?? []).map(x => [x.line, x]))
      const ref = (m: S['ActionMessage'] | null) => (m ? { label: m.messageId ?? tr('data.untyped'), stream: m.stream, start: m.start, end: m.end } : null)
      return {
        logs,
        log,
        rows: page.items.map((a) => {
          const x = byLine.get(a.line)
          return {
            id: `${log.id}|${a.line}`,
            time: clock(a.time),
            action: a.action,
            params: pairs(a.params),
            result: a.resultRaw || pairs(a.result),
            source: a.source ?? null,
            exchange: x?.state ?? 'unknown',
            request: ref(x?.request ?? null),
            response: ref(x?.response ?? null),
            candidates: x?.candidates ?? 0,
          }
        }),
        total: page.total,
        offset,
        exchanges: exchanges ? { paired: exchanges.paired, requestOnly: exchanges.requestOnly, notFound: exchanges.notFound, total: exchanges.total } : null,
        exchangeNote,
      }
    },

    async getExchange(actionId) {
      const [id, lineText] = actionId.split('|')
      const line = Number(lineText)
      if (!id || !Number.isFinite(line)) return null
      const ex = unwrap(await api.GET('/api/action-logs/{id}/actions/{line}/exchange', { params: { path: { id, line } } }))
      const from = Date.parse(ex.window.from)
      const to = Date.parse(ex.window.to)
      const actionAt = Date.parse(ex.action.time)
      const pos = (t: number) => Math.min(1, Math.max(0, (t - from) / Math.max(1, to - from)))

      const { request, response } = pickExchange(ex)

      const side = async (p: ExchangePart | undefined, title: string, direction: string): Promise<ExchangeSide | null> => {
        if (!p) return null
        const frame = p.frameNo ?? ex.frames.find(f => f.stream === p.stream && f.start <= p.start && p.start < f.end)?.frameNo
        return {
          title: tr('data.ex.title', { title, frame: frame ? (p.lastFrameNo ? tr('data.ex.frames', { from: frame, to: p.lastFrameNo }) : tr('data.ex.frame', { n: frame })) : '', ms: Math.round(p.time - actionAt) }),
          direction,
          bytes: await hexOf(p.stream, p.start, p.end),
          highlight: [],
        }
      }

      const view: ExchangeView = {
        actionId,
        label: `${ex.action.action} · ${pairs(ex.action.params)}`,
        windowFrom: clock(ex.window.from),
        windowTo: clock(ex.window.to),
        windowLabel: tr('data.ex.window', { ms: Math.round((to - from) / 2) }),
        events: [
          { at: pos(actionAt), kind: 'action' },
          ...ex.frames.map(f => ({
            at: pos(Date.parse(f.time)),
            kind: request && f.stream === request.stream && f.start < request.end && request.start < f.end
              ? 'request' as const
              : response && f.stream === response.stream && f.start < response.end && response.start < f.end ? 'response' as const : 'other' as const,
          })),
        ],
        request: await side(request, tr('data.request'), 'a → b'),
        response: await side(response, tr('data.response'), 'b → a'),
        note: ex.interpretationApplied
          ? tr('data.ex.byMsg')
          : tr('data.ex.byTcp'),
      }
      return view
    },

    async getInterpretation() {
      const doc = await currentInterpretation()
      if (!doc) {
        return { rev: null, dirty: false, tree: [], yaml: [], selectedLine: 0, stream: await defaultStream(), preview: { stream: '—', rows: [] }, violations: [], runIssues: [], field: null, quickFix: null }
      }
      const stream = await defaultStream()
      const { tree, preview, violations } = stream ? await previewOf(stream) : { tree: [], preview: { stream: '—', rows: [] }, violations: [] }
      // Тесты гипотез выполняет прогон: берём последний прогон этой ревизии по всему корпусу,
      // а прогон по части записей — только если полного нет (и говорим об этом).
      const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 20 } } })).items
      const sameRev = runs.filter(r => r.revision === doc.rev)
      const chosen = sameRev.find(r => corpusKey(r.corpus) === FULL_CORPUS) ?? sameRev[0]
      const detail = chosen ? unwrap(await api.GET('/api/runs/{id}', { params: { path: { id: chosen.id } } })) : null
      const partial = chosen && corpusKey(chosen.corpus) !== FULL_CORPUS ? tr('data.partCorpus') : ''
      const runIssues = (detail?.hypotheses ?? []).filter(h => h.verdict === 'refuted').map(h => ({
        id: h.id,
        label: tr('data.issue.refuted', { run: detail!.id, partial, n: formatCount(h.counterexamples) }),
        runId: detail!.id,
      }))
      return {
        rev: doc.rev,
        dirty: false,
        tree,
        yaml: doc.yaml.split('\n').map(text => ({ text })),
        selectedLine: 1,
        stream,
        preview,
        violations,
        runIssues,
        field: null,
        quickFix: null,
      }
    },

    previewInterpretation: (stream, yaml) => previewOf(stream, yaml),

    async saveInterpretation(yaml, baseRev) {
      const res = unwrap(await api.PUT('/api/interpretation', { body: { yaml, ...(baseRev === undefined ? {} : { baseRev }) } }))
      return { rev: res.rev, created: res.created }
    },

    async getFieldHints(messageId, field, yaml) {
      return unwrap(await api.POST('/api/interpretation/field-hints', { body: { messageId, field, ...(yaml === undefined ? {} : { yaml }) } }))
    },

    async getInterpretationRevisions() {
      return (await revisions()).map(r => r.rev).sort((a, b) => b - a)
    },

    async getInterpretationRevision(rev) {
      return unwrap(await api.GET('/api/interpretation/revisions/{rev}', { params: { path: { rev } } })).yaml
    },

    async getHypotheses() {
      const [hyps, questions, runs] = await Promise.all([
        api.GET('/api/hypotheses').then(unwrap),
        api.GET('/api/questions').then(unwrap),
        api.GET('/api/runs', { params: { query: { limit: 1 } } }).then(unwrap),
      ])
      // Числа «k / n» — из последнего прогона: тесты выполняет прогон проверки.
      // Номера гипотез исследователя и интерпретации независимы, поэтому сопоставляем по выражению теста.
      const last = runs.items[0] ? unwrap(await api.GET('/api/runs/{id}', { params: { path: { id: runs.items[0].id } } })) : null
      const inRun = new Map((last?.hypotheses ?? []).map(h => [normTest(h.test), h]))
      return {
        items: hyps.items.map((h) => {
          const r = h.test ? inRun.get(normTest(h.test)) : undefined
          return {
            id: h.id,
            text: h.statement,
            status: HYPOTHESIS_STATUS[h.status],
            // В списке: статус — решение исследователя, числа — отдельным значком итога прогона.
            support: '',
            run: r ? runVerdict(r, last!.id) : null,
          }
        }),
        questions: questions.items.filter(q => q.status === 'open').map(q => ({ id: q.id, text: q.text })),
      }
    },

    async getHypothesisDetail(id) {
      const h = unwrap(await api.GET('/api/hypotheses/{id}', { params: { path: { id } } }))
      const test = h.test ? unwrap(await api.POST('/api/hypotheses/{id}/test', { params: { path: { id } }, body: {} })) : null
      const names = await sourceNames()
      // Тест без контрпримеров — «поддержана на N», но не факт: статус гипотезы меняет исследователь.
      const status = test?.verdict === 'refuted' ? 'refuted' : test?.verdict === 'no_counterexample' ? 'supported' : HYPOTHESIS_STATUS[h.status]
      return {
        id: h.id,
        title: h.statement,
        status,
        support: test && test.verdict !== 'untested' ? `${formatCount(test.held)} / ${formatCount(test.applicable)}` : '',
        claim: h.statement,
        test: h.test ?? tr('data.noTest'),
        scope: test ? tr('data.scope.test', { n: formatCount(test.applicable), held: formatCount(test.held) }) : tr('data.scope.all'),
        basis: h.basis.length ? h.basis.join(', ') : '—',
        marked: HYPOTHESIS_STATUS[h.status],
        counterexamples: (test?.counterexamples ?? []).map(c => ({
          where: where(names, c.anchor),
          expected: h.test ?? '—',
          got: pairs(c.values),
          anchor: { source: c.anchor.source, stream: c.anchor.stream, start: c.anchor.start, end: c.anchor.end },
        })),
        note: [h.note, test && test.counterexamplesTotal > test.counterexamples.length ? tr('data.cxShown', { n: test.counterexamples.length, total: test.counterexamplesTotal }) : null].filter(Boolean).join(' '),
        history: h.test ? await historyOf(h.test) : [],
      }
    },

    async getSearchIndex() {
      const [conns, hyps, runs, obs, names] = await Promise.all([
        collectConnections(contract),
        api.GET('/api/hypotheses').then(unwrap),
        api.GET('/api/runs', { params: { query: { limit: 50 } } }).then(unwrap),
        api.GET('/api/observations').then(unwrap),
        sourceNames(),
      ])
      const link = (stream: string, from?: number, to?: number) => {
        const cut = stream.lastIndexOf(':')
        return { conn: stream.slice(0, cut), dir: stream.slice(cut + 1), ...(from === undefined ? {} : { from: String(from), to: String(to) }) }
      }
      return [
        ...conns.items.map(c => ({
          group: 'connection' as const,
          label: `${c.id.split(':')[1] ?? c.id} · ${c.a.address}:${c.a.port} → ${c.b.address}:${c.b.port}`,
          suffix: names.get(c.source) ?? c.source.slice(0, 8),
          path: '/overview',
          query: { conn: c.id, dir: 'ab' },
        })),
        // Соединений больше предела — честно говорим, что поиск видит не все.
        ...(conns.total > conns.items.length
          ? [{ group: 'limit' as const, label: tr('data.search.more', { n: formatCount(conns.total - conns.items.length) }), suffix: '', path: '/overview', query: {} }]
          : []),
        ...hyps.items.map(h => ({ group: 'hypothesis' as const, label: `${h.id} · ${h.statement}`, suffix: HYPOTHESIS_STATUS[h.status], path: '/hypotheses', query: { h: h.id } })),
        ...runs.items.map(r => ({ group: 'run' as const, label: `${r.id} · ${tr('shell.top.version', { n: r.revision ?? '—' })} · ${tr('data.caps', { n: r.sources.length })}`, suffix: r.stale ? tr('data.stale') : tr('data.current'), path: '/verify', query: { run: r.id } })),
        ...obs.items.map(o => ({ group: 'observation' as const, label: `${o.id} · ${o.comment || tr('data.noComment')}`, suffix: shortStream(o.anchor.stream), path: '/overview', query: link(o.anchor.stream, o.anchor.start, o.anchor.end) })),
      ]
    },

    async getObservations() {
      return unwrap(await api.GET('/api/observations')).items.map(o => ({
        id: o.id,
        text: o.comment || tr('data.noComment'),
        where: `${shortStream(o.anchor.stream)} [${o.anchor.start}, ${o.anchor.end})`,
        anchor: o.anchorState === 'ok' ? { source: o.anchor.source, stream: o.anchor.stream, start: o.anchor.start, end: o.anchor.end } : undefined,
      }))
    },

    async createHypothesis({ statement, test, basis }) {
      return unwrap(await api.POST('/api/hypotheses', { body: { statement, basis, ...(test ? { test } : {}) } })).id
    },

    async setHypothesisStatus(id, status) {
      unwrap(await api.PUT('/api/hypotheses/{id}', { params: { path: { id } }, body: { status: API_HYPOTHESIS_STATUS[status] } }))
      return true
    },

    async createQuestion(text) {
      unwrap(await api.POST('/api/questions', { body: { text } }))
      return true
    },

    async updateQuestion(id, edit) {
      unwrap(await api.PUT('/api/questions/{id}', { params: { path: { id } }, body: edit }))
      return true
    },

    async deleteQuestion(id) {
      // Удаление отвечает 204 без тела — ошибкой считаем только неуспешный статус.
      const res = await api.DELETE('/api/questions/{id}', { params: { path: { id } } })
      if (!res.response.ok) unwrap(res)
      return true
    },

    async updateObservation(id, comment) {
      unwrap(await api.PUT('/api/observations/{id}', { params: { path: { id } }, body: { comment } }))
      return true
    },

    async deleteObservation(id) {
      // Удаление отвечает 204 без тела — ошибкой считаем только неуспешный статус.
      const res = await api.DELETE('/api/observations/{id}', { params: { path: { id } } })
      if (!res.response.ok) unwrap(res)
      return true
    },

    async getRunItems(runId, { category, messageId, offset = 0 }) {
      return unwrap(await api.GET('/api/runs/{id}/items', { params: { path: { id: runId }, query: { limit: 100, offset, ...(category ? { category } : {}), ...(messageId ? { messageId } : {}) } } }))
    },

    async getVerification(runId) {
      const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 50 } } }))
      const at = runId ? runs.items.findIndex(r => r.id === runId) : 0
      const head = runs.items[Math.max(at, 0)]
      const empty: VerificationView = {
        run: null, filters: [], totals: [], categories: [], categoriesNote: tr('data.catNote'), problems: [], diffWith: null, diffNote: null, diff: [], hypothesisChanges: [], hypotheses: [], runs: [],
        runsNote: tr('data.noRuns'),
      }
      if (!head) return empty
      const [detail, names] = await Promise.all([
        api.GET('/api/runs/{id}', { params: { path: { id: head.id } } }).then(unwrap),
        sourceNames(),
      ])
      // Сравниваем с предыдущим прогоном того же корпуса (новые идут первыми).
      const prev = runs.items.slice(Math.max(at, 0) + 1).find(r => corpusKey(r.corpus) === corpusKey(head.corpus))
      const diff = prev ? unwrap(await api.GET('/api/runs/diff', { params: { query: { a: prev.id, b: head.id, limit: 1 } } })) : null
      const s = head.summary
      const matched = s.counts.matched ?? 0
      const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '—')
      const order: ResultCategory[] = ['matched', 'violated', 'incomplete', 'ambiguous', 'unmatched', 'limit_exceeded']
      const corpus = head.corpus
      return {
        run: { id: head.id, rev: head.revision, scope: tr('data.caps', { n: head.sources.length }), time: '', stale: staleText(head) },
        filters: [
          ...(corpus.port ? [{ label: tr('data.port', { n: corpus.port }), active: true }] : []),
          ...(corpus.direction ? [{ label: corpus.direction === 'a_to_b' ? 'a → b' : 'b → a', active: true }] : []),
          ...(corpus.sources?.length ? corpus.sources.map(sha => ({ label: names.get(sha) ?? sha.slice(0, 8), active: true })) : []),
        ],
        totals: [
          { value: formatCount(s.messages), label: tr('data.tot.messages') },
          { value: pct(matched, s.messages), label: tr('data.tot.matched') },
          { value: pct(s.messageBytes - s.unknownBytes, s.messageBytes), label: tr('data.tot.covered') },
          { value: formatCount(s.counterexamples), label: s.counterexamplesTruncated ? tr('data.tot.cxPartial') : tr('data.tot.cx') },
        ],
        categories: [
          ...order.map(key => ({ key, label: CATEGORY[key]!.label, count: s.counts[key] ?? 0 })),
          { key: 'out_of_scope' as const, label: tr('data.outOfScope'), count: s.outOfScopeStreams },
        ],
        categoriesNote: tr('data.catNote'),
        // Контрпример теста гипотезы: структура сообщения цела (категория «совпало»), не выполнился тест.
        problems: detail.counterexamples.slice(0, 50).map(c => ({
          status: c.violations[0]?.kind === 'hypothesis' ? 'hypothesis' : CATEGORY[c.category]?.status ?? 'unknown',
          label: c.violations[0]?.kind === 'hypothesis' ? tr('data.hyp') : (CATEGORY[c.category]?.label ?? c.category).toLowerCase(),
          where: where(names, c.anchor),
          what: c.violations.map(v => v.detail).join('; ') || (c.messageId ? tr('data.type', { id: c.messageId }) : tr('data.typeUnknown')),
          link: linkOf(c.anchor),
        })),
        diffWith: prev?.id ?? null,
        diffNote: prev ? null : runs.items.length > 1 ? tr('data.noPrevRun') : null,
        hypothesisChanges: hypothesisChanges(diff?.hypotheses ?? []),
        hypotheses: (detail.hypotheses ?? []).map(h => ({
          id: h.id,
          test: h.test,
          status: h.verdict === 'refuted' ? 'violation' : h.verdict === 'no_counterexample' ? 'hypothesis' : 'unknown',
          label: h.verdict === 'refuted'
            ? tr('data.h.refutedCx', { n: formatCount(h.counterexamples) })
            : h.verdict === 'no_counterexample' ? tr('data.h.supported', { held: formatCount(h.held), all: formatCount(h.applicable) }) : tr('data.v.untested'),
        })),
        diff: diff
          ? [
              { label: tr('data.diff.fixed'), value: formatCount(diff.totals.fixed), tone: 'good' },
              { label: tr('data.diff.regressed'), value: formatCount(diff.totals.regressed), tone: 'bad' },
              { label: tr('data.diff.changed'), value: formatCount(diff.totals.changed), tone: 'neutral' },
              { label: tr('data.diff.addedRemoved'), value: `${formatCount(diff.totals.added)} / ${formatCount(diff.totals.removed)}`, tone: 'neutral' },
              { label: tr('data.diff.unchanged'), value: formatCount(diff.totals.unchanged), tone: 'neutral' },
            ]
          : [],
        runs: runs.items.map(r => ({ id: r.id, label: `${tr('shell.top.version', { n: r.revision ?? '—' })} · ${tr('data.caps', { n: r.sources.length })}`, current: !r.stale, stale: staleText(r) })),
        runsNote: tr('data.runsNote'),
      }
    },

    async startRun(corpus) {
      return unwrap(await api.POST('/api/runs', { body: corpus ? { corpus } : {} })).jobId
    },

    async getFraming(stream) {
      const hints = unwrap(await api.POST('/api/analysis/framing', { body: { streams: [stream] } }))
      const candidates: FramingCandidate[] = hints.length.map((h, i) => ({
        id: `len-${i}`,
        offset: h.at,
        type: lengthType(h),
        adjust: h.adjust,
        messages: h.messages,
        share: pct(h.scorePermille),
        spec: h.framing,
        evidence: {
          hypothesis: tr('data.fr.hyp', { type: lengthType(h), at: h.at, sign: h.adjust >= 0 ? '+' : '−', adj: Math.abs(h.adjust) }),
          confirmed: tr('data.fr.confirmed', { n: formatCount(h.messages), covered: formatCount(h.coveredBytes), total: formatCount(h.totalBytes) }),
          scope: tr('data.fr.scope', { ok: h.streamsConfirmed, all: h.streamsTotal, min: h.minLength, max: h.maxLength }),
          counterexamples: h.firstCounterexample
            ? [{
                message: tr('data.fr.cxAt', { run: h.firstCounterexample.run, off: h.firstCounterexample.offset }),
                status: COUNTER_REASON[h.firstCounterexample.reason].status,
                note: COUNTER_REASON[h.firstCounterexample.reason].note + (h.firstCounterexample.value != null ? tr('data.fr.fieldValue', { v: h.firstCounterexample.value }) : ''),
              }]
            : [],
          note: [
            tr('data.fr.coherence', { a: pct(h.startCoherencePermille), b: pct(h.segmentAlignmentPermille) }),
            h.equivalent.length ? tr('data.fr.same', { list: h.equivalent.map(e => `${e.type} @${e.at} +${e.adjust}`).join(', ') }) : '',
          ].filter(Boolean).join(' '),
        },
      }))
      return {
        searchRange: tr('data.fr.range', { analysed: hints.truncated ? tr('data.fr.analysed') : '', n: formatCount(hints.sampledBytes), min: hints.minMessages }),
        candidates,
        signatures: [
          ...hints.signatures.map(sg => ({ label: sg.bytes.toUpperCase().replace(/(..)(?=.)/g, '$1 '), matched: sg.atStarts, total: sg.startsTotal, ok: sg.atStarts === sg.startsTotal })),
          ...hints.delimiters.map(d => ({ label: tr('data.fr.atEnd', { b: d.bytes.toUpperCase() }), matched: d.atEnds, total: d.endsTotal, ok: false })),
        ],
        notes: [
          hints.incomplete ? tr('data.fr.incomplete') : '',
          hints.truncated ? tr('data.fr.truncated') : '',
          !candidates.length ? tr('data.fr.none', { n: hints.minMessages }) : '',
        ].filter(Boolean),
      }
    },

    async getFramingDetail(stream, spec) {
      const [preview, variability] = await Promise.all([
        api.POST('/api/interpretation/preview', { body: { stream, yaml: framingOnlyYaml(spec), limit: 500, offset: 0 } }).then(unwrap),
        api.POST('/api/analysis/variability', { body: { streams: [stream], framing: spec } }).then(unwrap),
      ])
      const columns = variability.columns.slice(0, 16)
      const constant = variability.regions.filter(r => r.kind === 'constant').map(r => `${r.start}–${r.end - 1}`)
      const counters = variability.counters.map(c => tr('data.var.counter', { at: c.at }))
      const previewTotal = Object.values(preview.counts ?? {}).reduce((n, c) => n + c, 0)
      return {
        messageStarts: preview.items.map(m => m.start),
        variability: columns.map(c => c.entropyMillibits / 1000),
        // Что показано не целиком — говорим прямо: границы по первой странице, столбцов — первые 16.
        variabilityNote: [
          tr('data.var.sample', { len: variability.length, n: formatCount(variability.analysed), of: variability.analysed < variability.messages ? tr('data.var.of', { n: formatCount(variability.messages) }) : '' }),
          constant.length ? tr('data.var.constant', { list: constant.join(', ') }) : tr('data.var.noConstant'),
          counters.length ? `${counters.join(', ')}.` : '',
          variability.columns.length > columns.length ? tr('data.var.cols', { n: columns.length, total: variability.columns.length }) : '',
          variability.truncated ? tr('data.var.truncated') : '',
          preview.items.length < previewTotal ? tr('data.var.starts', { n: formatCount(preview.items.length), total: formatCount(previewTotal) }) : '',
        ].filter(Boolean).join(' '),
      }
    },

    async applyFraming(spec) {
      const doc = await currentInterpretation()
      const yaml = doc ? replaceFramingBlock(doc.yaml, spec) : framingOnlyYaml(spec)
      const baseRev = doc?.rev ?? 0
      // Между чтением и сохранением описание могли сохранить из другой вкладки — тогда 409, а не затирание.
      return unwrap(await api.PUT('/api/interpretation', { body: { yaml, baseRev } })).rev
    },

    async getCompare(action, logId) {
      const logs = unwrap(await api.GET('/api/action-logs')).items.filter(l => !l.replacedBy)
      const obs = unwrap(await api.GET('/api/observations')).items
      const observations = obs.map(o => ({
        id: o.id,
        text: o.comment || tr('data.noComment'),
        status: (o.anchorState === 'ok' ? 'rule' : o.anchorState === 'broken' ? 'violation' : 'gap') as KnowledgeStatus,
        label: o.anchorState === 'ok' ? tr('data.anchor.ok') : o.anchorState === 'broken' ? tr('data.anchor.broken') : tr('data.anchor.gone'),
        anchor: `${shortStream(o.anchor.stream)} [${o.anchor.start}, ${o.anchor.end})`,
        // Ссылка к байтам — только пока якорь указывает на те же байты.
        anchorRef: o.anchorState === 'ok' ? { source: o.anchor.source, stream: o.anchor.stream, start: o.anchor.start, end: o.anchor.end } : undefined,
      }))
      const log = logs.find(l => l.id === logId) ?? logs[0]
      const logRefs = logs.map(l => ({ id: l.id, name: l.name }))
      const empty = { logs: logRefs, logId: log?.id ?? null, actions: [], action: null, chips: [], requests: [], mask: [], responses: [], correlations: [], observations, observationTotal: obs.length }
      if (!log) return { ...empty, notes: [tr('data.cmp.noLog')] }

      // Действия для выбора — со всего журнала, не только с первой страницы.
      const all: S['Action'][] = []
      for (let total = Infinity; all.length < total;) {
        const page = unwrap(await api.GET('/api/action-logs/{id}/actions', { params: { path: { id: log.id }, query: { limit: 500, offset: all.length } } }))
        all.push(...page.items)
        total = page.items.length ? page.total : all.length
      }
      const names = [...new Set(all.map(a => a.action))]
      const chosen = action && names.includes(action) ? action : (all.find(a => Object.keys(a.params).length)?.action ?? names[0] ?? null)
      const picked = all.filter(a => a.action === chosen).slice(0, 6)
      const exchanges = await Promise.all(picked.map(a =>
        api.GET('/api/action-logs/{id}/actions/{line}/exchange', { params: { path: { id: log.id, line: a.line } } }).then(unwrap)))

      const used = new Set<string>()
      const pairsByAction = exchanges.map(ex => pickExchange(ex, used))
      const rows = await Promise.all(exchanges.map(async (ex, i) => {
        const { request, response } = pairsByAction[i]!
        return {
          label: pairs(ex.action.params),
          result: ex.action.resultRaw || pairs(ex.action.result),
          request: request ? { part: request, bytes: await hexOf(request.stream, request.start, request.end) } : null,
          response: response ? { part: response, bytes: await hexOf(response.stream, response.start, response.end) } : null,
        }
      }))
      // Маска — визуальная разница показанных байтов; анализ закономерностей делает движок (корреляции).
      const diffRows = (list: { label: string, bytes: string[] }[]): CompareRow[] => {
        const width = Math.max(0, ...list.map(r => r.bytes.length))
        const changed = Array.from({ length: width }, (_, i) => new Set(list.map(r => r.bytes[i] ?? '')).size > 1)
        return list.map(r => ({ label: r.label, bytes: r.bytes, changed: r.bytes.map((_, i) => changed[i] ?? false) }))
      }
      const requests = diffRows(rows.filter(r => r.request).map(r => ({ label: r.label, bytes: r.request!.bytes })))
      const responses = diffRows(rows.filter(r => r.response).map(r => ({ label: tr('data.cmp.resp', { r: r.result }), bytes: r.response!.bytes })))
      const width = Math.max(0, ...requests.map(r => r.bytes.length))
      const mask = Array.from({ length: width }, (_, i) => requests.some(r => r.changed[i]))

      // Запросы и ответы анализируются раздельно: у них разная раскладка, вместе связи теряются.
      const notes: string[] = []
      const sizeOf = (type: string) => (type.endsWith('8') ? 1 : type.includes('16') ? 2 : 4)
      const correlate = async (side: 'request' | 'response', title: string) => {
        const parts = rows.map(r => r[side]?.part).filter((x): x is ExchangePart => !!x)
        const streams = [...new Set(parts.map(p => p.stream))]
        const first = parts[0]
        if (!streams.length) return []
        const cor = unwrap(await api.POST('/api/analysis/correlations', { body: { streams, logId: log.id, ...(chosen ? { action: chosen } : {}) } }))
        if (cor.truncated) notes.push(tr('data.cmp.truncated', { title }))
        const anchorAt = (at: number, type: string) => (first ? { source: first.source, stream: first.stream, start: first.start + at, end: first.start + at + sizeOf(type) } : undefined)
        return [
          ...cor.values.map(v => ({
            position: `${title} ${v.at}–${v.at + sizeOf(v.type) - 1}`,
            read: `${v.type}${v.scale > 1 ? ` ÷ ${v.scale}` : ''}`,
            values: v.equivalent.length ? tr('data.cmp.also', { list: v.equivalent.join(', ') }) : '—',
            relation: `= ${v.param}`,
            share: `${v.matches} / ${v.samples}`,
            anchor: anchorAt(v.at, v.type),
          })),
          ...cor.actions.slice(0, 3).map(a => ({
            position: `${title} ${a.at}`,
            read: a.type,
            values: a.codes.map(c => `${c.action} = ${c.value}`).join(' · '),
            relation: tr('data.cmp.code'),
            share: pct(a.purityPermille),
            anchor: anchorAt(a.at, a.type),
          })),
        ]
      }
      const correlations: CompareView['correlations'] = [
        ...await correlate('request', tr('data.cmp.req')),
        ...await correlate('response', tr('data.cmp.res')),
      ]
      if (!rows.some(r => r.request)) notes.push(tr('data.cmp.noReq'))
      notes.push(tr('data.cmp.caution'))
      return {
        logs: logRefs,
        logId: log.id,
        actions: names,
        action: chosen,
        chips: picked.map(a => pairs(a.params)),
        requests,
        mask,
        responses,
        correlations,
        observations,
        observationTotal: obs.length,
        notes,
      }
    },

    async createObservation(anchor, comment) {
      unwrap(await api.POST('/api/observations', { body: { anchor, comment } }))
      return true
    },

    // Структурный вид отчёта — только в примере данных; в live экран показывает отчёт движка.
    getReport: () => sample.getReport(),

    async getDraft(streams, logId) {
      const d = unwrap(await api.POST('/api/analysis/draft', { body: { streams, ...(logId ? { logId } : {}) } }))
      const total = Object.values(d.summary.counts).reduce((n, c) => n + c, 0)
      return {
        yaml: d.yaml,
        steps: d.steps,
        summary: [
          { label: tr('data.draft.streams'), value: formatCount(d.summary.streams) },
          { label: tr('data.messages'), value: formatCount(d.summary.messages || total) },
          ...Object.entries(d.summary.counts).filter(([, c]) => c > 0).map(([k, c]) => ({ label: CATEGORY[k]?.label ?? k, value: formatCount(c) })),
          { label: tr('data.draft.types'), value: formatCount(d.summary.types) },
          { label: tr('data.draft.hyps'), value: formatCount(d.summary.hypotheses) },
          { label: tr('data.unknownBytes'), value: formatCount(d.summary.unknownBytes) },
        ],
        incomplete: d.incomplete,
      }
    },

    async getFixHints(hypothesis, yaml) {
      const h = unwrap(await api.POST('/api/interpretation/fix-hints', { body: { hypothesis, ...(yaml ? { yaml } : {}) } }))
      const res = (r: S['FixTestResult']) => tr('data.fix.res', { n: r.counterexamples, all: r.applicable })
      return {
        hypothesis: h.hypothesis,
        test: h.test,
        before: res(h.current),
        fixes: h.fixes.map(f => ({
          kind: f.kind,
          summary: f.summary,
          effect: `${res(h.current)} → ${f.result.counterexamples}${f.otherBefore || f.otherAfter ? tr('data.fix.others', { a: f.otherBefore, b: f.otherAfter }) : ''}`,
          after: f.result.counterexamples,
          edit: { hypothesis: h.hypothesis, field: f.field, messages: f.messages, fromType: f.fromType, toType: f.toType, fromAt: f.fromAt, toAt: f.toAt, test: f.test },
        })),
      }
    },

    async getCoverage(yaml) {
      const c = unwrap(await api.POST('/api/interpretation/coverage', { body: yaml ? { yaml } : {} }))
      const label = (k: 'rule' | 'hypothesis' | 'unknown' | 'none') => (k === 'none' ? tr('data.cov.none') : tr(`status.${k}` as MessageKey))
      const order = ['rule', 'hypothesis', 'unknown', 'none'] as const
      return {
        described: pct(c.describedPermille),
        totals: order.map(st => ({ status: st, label: label(st), bytes: c.bytes[st] })),
        types: c.types.map(t => ({
          id: t.messageId ?? tr('data.untyped'),
          messages: t.messages,
          length: t.minLen === t.maxLen ? tr('data.cov.len', { n: t.minLen }) : tr('data.cov.lenRange', { a: t.minLen, b: t.maxLen }),
          totals: { rule: t.bytes.rule, hypothesis: t.bytes.hypothesis, unknown: t.bytes.unknown, none: t.bytes.none },
          regions: t.regions.map(r => ({
            start: r.start,
            end: r.end,
            status: r.status,
            label: [r.field, r.hypothesis].filter(Boolean).join(' · ') || label(r.status),
            share: r.sharePermille / 1000,
          })),
          truncated: t.mapTruncated,
        })),
        incomplete: c.incomplete,
      }
    },

    async getNextSteps() {
      return { steps: unwrap(await api.GET('/api/project/next-steps')).steps }
    },

    async explainByte(stream, offset) {
      return unwrap(await api.GET('/api/streams/{stream}/explain', { params: { path: { stream }, query: { offset } } }))
    },

    async getSuggestions() {
      const page = await collectConnections(contract)
      const streams = page.items.flatMap(c => c.streams.map(s => s.id))
      if (!streams.length) return { items: [], truncated: false, note: tr('data.sg.noStreams') }
      try {
        const r = unwrap(await api.POST('/api/analysis/suggestions', { body: { streams } }))
        return { items: r.items, truncated: r.truncated, note: r.items.length ? null : tr('data.sg.none') }
      }
      catch (e) {
        if (e instanceof ApiError && e.status === 409) return { items: [], truncated: false, note: tr('data.sg.needs') }
        throw e
      }
    },

    async acceptSuggestion(s) {
      const { source, stream, start, end, comment } = s.observation
      const obs = unwrap(await api.POST('/api/observations', { body: { anchor: { source, stream, start, end }, comment } }))
      return unwrap(await api.POST('/api/hypotheses', { body: { statement: s.hypothesis.statement, basis: [obs.id], test: s.hypothesis.test } })).id
    },

    async getTypeHints(streams) {
      return unwrap(await api.POST('/api/analysis/types', { body: { streams } }))
    },

    async getFieldBehavior(streams, messageId) {
      return unwrap(await api.POST('/api/analysis/fields', { body: { streams, ...(messageId ? { messageId } : {}) } }))
    },

    async getChecksumHints(streams, messageId) {
      return unwrap(await api.POST('/api/analysis/checksums', { body: { streams, ...(messageId ? { messageId } : {}) } }))
    },

    async getEntropy(streams) {
      return unwrap(await api.POST('/api/analysis/entropy', { body: { streams } }))
    },

    async getExchangePairs(connection, offset = 0) {
      return unwrap(await api.POST('/api/exchanges', { body: { connection, limit: 100, offset } }))
    },

    async getExchangeGraph() {
      return unwrap(await api.POST('/api/interpretation/graph', { body: {} }))
    },

    async compareCaptures(a, b) {
      return unwrap(await api.POST('/api/interpretation/compare', { body: { a, b } }))
    },

    async applyClockOffset(logId, clockOffsetMs) {
      const r = unwrap(await api.POST('/api/action-logs/{id}/clock-offset', { params: { path: { id: logId } }, body: { clockOffsetMs } }))
      return r.id
    },

    async getClockOffset(logId) {
      return unwrap(await api.GET('/api/action-logs/{id}/clock-offset', { params: { path: { id: logId } } }))
    },

    async getDeviceConnections() {
      try {
        return unwrap(await api.POST('/api/analysis/device-connections', { body: {} }))
      }
      catch (e) {
        // 409 — в проекте нет журнала действий: подсвечивать нечего.
        if (e instanceof ApiError && e.status === 409) return null
        throw e
      }
    },

    async generateReport(format, runId) {
      const r = unwrap(await api.POST('/api/reports', { body: { format, ...(runId ? { runId } : {}) } }))
      return { fileName: r.fileName, content: r.content }
    },

    async listRuns() {
      const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 50 } } }))
      return runs.items.map(r => ({ id: r.id, label: `${tr('shell.top.version', { n: r.revision ?? '—' })} · ${tr('data.caps', { n: r.sources.length })}`, stale: r.stale }))
    },
  }
}
