import { ApiError, apiClient, unwrap } from '~/api/client'
import type { components } from '~/api/schema'
import { base64ToBytes, formatCount, hexByte } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'
import type { ContractSource, ResearchSource } from './source'
import { framingOnlyYaml, replaceFramingBlock } from '~/utils/interpretation-yaml'
import type { CompareRow, CompareView, ExchangeSide, ExchangeView, FieldViolation, FramingCandidate, Hypothesis, InterpretationTreeNode, ResultCategory, StreamLink, VerificationView } from './views'

type S = components['schemas']

const CATEGORY: Record<string, { label: string, status: KnowledgeStatus }> = {
  matched: { label: 'Совпало', status: 'rule' },
  violated: { label: 'Нарушено', status: 'violation' },
  incomplete: { label: 'Неполное', status: 'gap' },
  ambiguous: { label: 'Неоднозначное', status: 'ambiguous' },
  unmatched: { label: 'Не охвачено', status: 'unknown' },
  limit_exceeded: { label: 'Превышен предел', status: 'violation' },
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
  bad_length: { status: 'violation', note: 'значение длины вне допустимого' },
  overrun: { status: 'gap', note: 'сообщение выходит за конец участка' },
  short_header: { status: 'gap', note: 'не хватает байтов заголовка' },
  dissimilar: { status: 'unknown', note: 'начало не похоже на остальные' },
}

const ACTIONS_PAGE = 200

const pct = (permille: number) => `${(permille / 10).toFixed(1).replace('.', ',')}%`

function lengthType(h: S['LengthHint']) {
  return h.width === 1 ? 'u8' : `u${h.width * 8} ${h.bigEndian ? 'BE' : 'LE'}`
}

interface ExchangePart { source: string, stream: string, start: number, end: number, time: number, frameNo?: number }

// Запрос — первое после действия в направлении a→b, ответ — первое после запроса в обратном.
// used — уже занятые части: у действий с одинаковым временем запросы идут по порядку, а не один на всех.
export function pickExchange(ex: S['Exchange'], used = new Set<string>()): { request?: ExchangePart, response?: ExchangePart } {
  const key = (p: ExchangePart) => `${p.stream}@${p.start}`
  const actionAt = Date.parse(ex.action.time)
  const parts: ExchangePart[] = ex.messages.length
    ? ex.messages.map(m => ({ source: m.source, stream: m.stream, start: m.start, end: m.end, time: Date.parse(m.firstTime) }))
    : ex.frames.filter(f => !f.duplicate).map(f => ({ source: f.source, stream: f.stream, start: f.start, end: f.end, time: Date.parse(f.time), frameNo: f.frameNo }))
  const byTime = (a: ExchangePart, b: ExchangePart) => a.time - b.time || a.start - b.start
  const request = parts.filter(p => p.stream.endsWith(':ab') && p.time >= actionAt && !used.has(key(p))).sort(byTime)[0]
  const response = request ? parts.filter(p => p.stream.endsWith(':ba') && p.time >= request.time && !used.has(key(p))).sort(byTime)[0] : undefined
  if (request) used.add(key(request))
  if (response) used.add(key(response))
  return { request, response }
}

function clock(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleTimeString('ru-RU', { timeZone: 'UTC' })}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}

function pairs(obj: Record<string, number | string>) {
  const entries = Object.entries(obj)
  return entries.length ? entries.map(([k, v]) => `${k} = ${v}`).join(', ') : '—'
}

const STALE_REASON: Record<S['StaleReason'], string> = {
  interpretation: 'изменена интерпретация',
  settings: 'изменены настройки сборки',
  sources: 'записи пропали из проекта',
  action_logs: 'изменились журналы действий',
}

// Итог теста гипотезы: «поддержана на N», а не «доказана».
const normTest = (t: string) => t.replace(/\s+/g, '')

function verdictLabel(v: 'untested' | 'no_counterexample' | 'refuted' | null) {
  return v === 'refuted' ? 'опровергнута' : v === 'no_counterexample' ? 'контрпримеров нет' : v === 'untested' ? 'не проверена' : '—'
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
      if (h.counterexamplesFrom !== h.counterexamplesTo) parts.push(`контрпримеров ${formatCount(h.counterexamplesFrom)} → ${formatCount(h.counterexamplesTo)}`)
      if (h.applicableFrom !== h.applicableTo) parts.push(`проверок ${formatCount(h.applicableFrom)} → ${formatCount(h.applicableTo)}`)
      return {
        id: h.id,
        text: parts.join(', ') || (h.kind === 'added' ? 'добавлена' : h.kind === 'removed' ? 'удалена' : 'изменён тест'),
        tone: h.kind === 'fixed' ? 'good' : h.kind === 'regressed' ? 'bad' : 'neutral',
      }
    })
}

function staleText(run: { stale: boolean, staleReasons: S['StaleReason'][] }) {
  return run.stale ? run.staleReasons.map(r => STALE_REASON[r]).join(', ') || 'устарел' : null
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
    if (h.verdict === 'refuted') return { status: 'violation', label: `${runId}: опровергнута · ${formatCount(h.counterexamples)}` }
    if (h.verdict === 'no_counterexample') return { status: 'hypothesis', label: `${runId}: ${formatCount(h.held)} / ${formatCount(h.applicable)}` }
    return { status: 'unknown', label: `${runId}: не проверена` }
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
        time: `rev ${d.revision ?? '—'}`,
        status,
        label: h.verdict === 'refuted' ? `опровергнута · ${formatCount(h.counterexamples)}` : h.verdict === 'no_counterexample' ? `поддержана ${formatCount(h.held)} / ${formatCount(h.applicable)}` : 'не проверена',
        scope: `${d.sources.length} зап.`,
        stale: runs[i]!.stale,
      }]
    })
  }

  async function revisions() {
    return unwrap(await api.GET('/api/interpretation/revisions')).items
  }

  async function hexOf(stream: string, start: number, end: number): Promise<string[]> {
    const res = await contract.getStreamBytes(stream, start, Math.min(end - start, 32))
    return res.segments.flatMap(seg => (seg.data ? Array.from(base64ToBytes(seg.data)).map(hexByte) : Array.from({ length: seg.end - seg.start }, () => '░░')))
  }

  // Для предпросмотра по умолчанию — самый длинный поток: в нём больше всего сообщений.
  async function defaultStream(): Promise<string | null> {
    const page = await contract.listConnections({ limit: 200 })
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
      label: 'Типы сообщений',
      badge: String(byType.size),
      children: [
        ...[...byType].map(([name, fields]) => ({
          label: name,
          children: [...fields].map(([field, status]) => ({ label: field, status: status as KnowledgeStatus })),
        })),
        ...(untyped ? [{ label: `без типа · ${untyped}`, status: 'unknown' as const }] : []),
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
          ? [{ label: 'Поток', value: 'вне области применимости' }]
          : [
              { label: 'Сообщений', value: formatCount(total) },
              ...Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => ({ label: CATEGORY[k]?.label ?? k, value: formatCount(c) })),
              { label: 'Неизвестных байтов', value: formatCount(preview.unknownBytes ?? 0) },
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
        title: project?.name ?? 'Проект',
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
      return items.map(l => ({
        name: l.name,
        rows: l.rows,
        mapping: [
          { column: l.mapping.time, field: 'Время' },
          { column: l.mapping.action, field: 'Действие' },
          ...(l.mapping.params ? [{ column: l.mapping.params, field: 'Параметры' }] : []),
          ...(l.mapping.result ? [{ column: l.mapping.result, field: 'Результат' }] : []),
        ],
        status: l.rows > 0 ? 'mapped' as const : 'needs_mapping' as const,
      }))
    },

    async getActions(logId, offset = 0) {
      const { items } = unwrap(await api.GET('/api/action-logs'))
      const logs = items.map(l => ({ id: l.id, name: l.name, rows: l.rows, clockOffsetMs: l.mapping.clockOffsetMs ?? 0 }))
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
        exchangeNote = 'Обмены появятся после сохранения описания: без границ сообщений их не найти.'
      }
      const byLine = new Map((exchanges?.items ?? []).map(x => [x.line, x]))
      const ref = (m: S['ActionMessage'] | null) => (m ? { label: m.messageId ?? 'без типа', stream: m.stream, start: m.start, end: m.end } : null)
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
          title: `${title}${frame ? ` · кадр ${frame}` : ''} · +${Math.round(p.time - actionAt)} мс`,
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
        windowLabel: `окно ± ${Math.round((to - from) / 2)} мс`,
        events: [
          { at: pos(actionAt), kind: 'action' },
          ...ex.frames.map(f => ({
            at: pos(Date.parse(f.time)),
            kind: request && f.stream === request.stream && f.start <= request.start && request.start < f.end
              ? 'request' as const
              : response && f.stream === response.stream && f.start <= response.start && response.start < f.end ? 'response' as const : 'other' as const,
          })),
        ],
        request: await side(request, 'Запрос', 'a → b'),
        response: await side(response, 'Ответ', 'b → a'),
        note: ex.interpretationApplied
          ? 'Запрос и ответ выделены по сообщениям интерпретации.'
          : 'Интерпретации нет — запрос и ответ показаны по кадрам TCP.',
      }
      return view
    },

    async getInterpretation() {
      let doc: S['InterpretationDoc']
      try {
        doc = unwrap(await api.GET('/api/interpretation'))
      }
      catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          return { rev: null, dirty: false, tree: [], yaml: [], selectedLine: 0, stream: await defaultStream(), preview: { stream: '—', rows: [] }, violations: [], runIssues: [], field: null, quickFix: null }
        }
        throw e
      }
      const stream = await defaultStream()
      const { tree, preview, violations } = stream ? await previewOf(stream) : { tree: [], preview: { stream: '—', rows: [] }, violations: [] }
      // Тесты гипотез выполняет прогон: берём последний прогон этой ревизии по всему корпусу,
      // а прогон по части записей — только если полного нет (и говорим об этом).
      const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 20 } } })).items
      const sameRev = runs.filter(r => r.revision === doc.rev)
      const chosen = sameRev.find(r => corpusKey(r.corpus) === FULL_CORPUS) ?? sameRev[0]
      const detail = chosen ? unwrap(await api.GET('/api/runs/{id}', { params: { path: { id: chosen.id } } })) : null
      const partial = chosen && corpusKey(chosen.corpus) !== FULL_CORPUS ? ' (часть корпуса)' : ''
      const runIssues = (detail?.hypotheses ?? []).filter(h => h.verdict === 'refuted').map(h => ({
        id: h.id,
        label: `опровергнута в ${detail!.id}${partial} · контрпримеров ${formatCount(h.counterexamples)}`,
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

    async saveInterpretation(yaml) {
      const res = unwrap(await api.PUT('/api/interpretation', { body: { yaml } }))
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
        questions: questions.items.filter(q => q.status === 'open').map(q => q.text),
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
        test: h.test ?? 'теста нет',
        scope: test ? `применим к ${formatCount(test.applicable)} сообщ., выполнился на ${formatCount(test.held)}` : 'все записи проекта',
        basis: h.basis.length ? h.basis.join(', ') : '—',
        marked: HYPOTHESIS_STATUS[h.status],
        counterexamples: (test?.counterexamples ?? []).map(c => ({
          where: where(names, c.anchor),
          expected: h.test ?? '—',
          got: pairs(c.values),
          anchor: { source: c.anchor.source, stream: c.anchor.stream, start: c.anchor.start, end: c.anchor.end },
        })),
        note: [h.note, test && test.counterexamplesTotal > test.counterexamples.length ? `Показано ${test.counterexamples.length} из ${test.counterexamplesTotal} контрпримеров.` : null].filter(Boolean).join(' '),
        history: h.test ? await historyOf(h.test) : [],
      }
    },

    async getSearchIndex() {
      const [conns, hyps, runs, obs, names] = await Promise.all([
        contract.listConnections({ limit: 200 }),
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
        ...hyps.items.map(h => ({ group: 'hypothesis' as const, label: `${h.id} · ${h.statement}`, suffix: HYPOTHESIS_STATUS[h.status], path: '/hypotheses', query: { h: h.id } })),
        ...runs.items.map(r => ({ group: 'run' as const, label: `${r.id} · rev ${r.revision ?? '—'} · ${r.sources.length} зап.`, suffix: r.stale ? 'устарел' : 'актуален', path: '/verify', query: { run: r.id } })),
        ...obs.items.map(o => ({ group: 'observation' as const, label: `${o.id} · ${o.comment || 'без комментария'}`, suffix: shortStream(o.anchor.stream), path: '/overview', query: link(o.anchor.stream, o.anchor.start, o.anchor.end) })),
      ]
    },

    async getObservations() {
      return unwrap(await api.GET('/api/observations')).items.map(o => ({ id: o.id, text: o.comment || 'без комментария' }))
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

    async getVerification(runId) {
      const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 50 } } }))
      const at = runId ? runs.items.findIndex(r => r.id === runId) : 0
      const head = runs.items[Math.max(at, 0)]
      const empty: VerificationView = {
        run: null, filters: [], totals: [], categories: [], categoriesNote: '', problems: [], diffWith: null, diffNote: null, diff: [], hypothesisChanges: [], hypotheses: [], runs: [],
        runsNote: 'Прогонов ещё не было — запустите проверку.',
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
        run: { id: head.id, rev: head.revision, scope: `${head.sources.length} зап.`, time: '', stale: staleText(head) },
        filters: [
          ...(corpus.port ? [{ label: `порт ${corpus.port}`, active: true }] : []),
          ...(corpus.direction ? [{ label: corpus.direction === 'a_to_b' ? 'a → b' : 'b → a', active: true }] : []),
          ...(corpus.sources?.length ? corpus.sources.map(sha => ({ label: names.get(sha) ?? sha.slice(0, 8), active: true })) : []),
        ],
        totals: [
          { value: formatCount(s.messages), label: 'сообщений в наборе' },
          { value: pct(matched, s.messages), label: 'совпало' },
          { value: pct(s.messageBytes - s.unknownBytes, s.messageBytes), label: 'байтов покрыто полями' },
          { value: formatCount(s.counterexamples), label: s.counterexamplesTruncated ? 'контрпримеров (показаны не все)' : 'контрпримеров' },
        ],
        categories: [
          ...order.map(key => ({ key, label: CATEGORY[key]!.label, count: s.counts[key] ?? 0 })),
          { key: 'out_of_scope' as const, label: 'Потоков вне области', count: s.outOfScopeStreams },
        ],
        categoriesNote: '«Превышен предел» и потоки вне области — ограничения реализации и области применимости, а не свойства протокола.',
        // Контрпример теста гипотезы: структура сообщения цела (категория «совпало»), не выполнился тест.
        problems: detail.counterexamples.slice(0, 50).map(c => ({
          status: c.violations[0]?.kind === 'hypothesis' ? 'hypothesis' : CATEGORY[c.category]?.status ?? 'unknown',
          label: c.violations[0]?.kind === 'hypothesis' ? 'гипотеза' : (CATEGORY[c.category]?.label ?? c.category).toLowerCase(),
          where: where(names, c.anchor),
          what: c.violations.map(v => v.detail).join('; ') || (c.messageId ? `тип ${c.messageId}` : 'тип не определён'),
          link: linkOf(c.anchor),
        })),
        diffWith: prev?.id ?? null,
        diffNote: prev ? null : runs.items.length > 1 ? 'Прошлых прогонов с таким же корпусом нет — сравнивать не с чем.' : null,
        hypothesisChanges: hypothesisChanges(diff?.hypotheses ?? []),
        hypotheses: (detail.hypotheses ?? []).map(h => ({
          id: h.id,
          test: h.test,
          status: h.verdict === 'refuted' ? 'violation' : h.verdict === 'no_counterexample' ? 'hypothesis' : 'unknown',
          label: h.verdict === 'refuted'
            ? `опровергнута · контрпримеров ${formatCount(h.counterexamples)}`
            : h.verdict === 'no_counterexample' ? `поддержана ${formatCount(h.held)} / ${formatCount(h.applicable)}` : 'не проверена',
        })),
        diff: diff
          ? [
              { label: 'Исправилось', value: formatCount(diff.totals.fixed), tone: 'good' },
              { label: 'Ухудшилось', value: formatCount(diff.totals.regressed), tone: 'bad' },
              { label: 'Изменилось', value: formatCount(diff.totals.changed), tone: 'neutral' },
              { label: 'Добавилось / исчезло', value: `${formatCount(diff.totals.added)} / ${formatCount(diff.totals.removed)}`, tone: 'neutral' },
              { label: 'Без изменений', value: formatCount(diff.totals.unchanged), tone: 'neutral' },
            ]
          : [],
        runs: runs.items.map(r => ({ id: r.id, label: `rev ${r.revision ?? '—'} · ${r.sources.length} зап.`, current: !r.stale, stale: staleText(r) })),
        runsNote: 'Прогон устаревает, если изменились интерпретация, настройки сборки или записи — по хешам входов.',
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
          hypothesis: `длина = ${lengthType(h)} @${h.at} ${h.adjust >= 0 ? '+' : '−'} ${Math.abs(h.adjust)}`,
          confirmed: `${formatCount(h.messages)} сообщ., ${formatCount(h.coveredBytes)} из ${formatCount(h.totalBytes)} байт`,
          scope: `${h.streamsConfirmed} из ${h.streamsTotal} потоков · длины ${h.minLength}–${h.maxLength}`,
          counterexamples: h.firstCounterexample
            ? [{
                message: `участок ${h.firstCounterexample.run}, байт ${h.firstCounterexample.offset}`,
                status: COUNTER_REASON[h.firstCounterexample.reason].status,
                note: COUNTER_REASON[h.firstCounterexample.reason].note + (h.firstCounterexample.value != null ? ` (поле = ${h.firstCounterexample.value})` : ''),
              }]
            : [],
          note: [
            `Начала похожи друг на друга: ${pct(h.startCoherencePermille)}; совпадают с началами сегментов TCP: ${pct(h.segmentAlignmentPermille)}.`,
            h.equivalent.length ? `Те же границы дают: ${h.equivalent.map(e => `${e.type} @${e.at} +${e.adjust}`).join(', ')}.` : '',
          ].filter(Boolean).join(' '),
        },
      }))
      return {
        searchRange: `${formatCount(hints.sampledBytes)} байт · порог ${hints.minMessages} сообщ.`,
        candidates,
        signatures: [
          ...hints.signatures.map(sg => ({ label: sg.bytes.toUpperCase().replace(/(..)(?=.)/g, '$1 '), matched: sg.atStarts, total: sg.startsTotal, ok: sg.atStarts === sg.startsTotal })),
          ...hints.delimiters.map(d => ({ label: `${d.bytes.toUpperCase()} в конце`, matched: d.atEnds, total: d.endsTotal, ok: false })),
        ],
        notes: [
          hints.incomplete ? 'Поиск прерван по времени — список кандидатов неполон.' : '',
          hints.truncated ? 'Часть данных не вошла в анализ (предел размера).' : '',
          !candidates.length ? `Кандидатов поля длины нет: нужно хотя бы ${hints.minMessages} подтверждённых сообщений.` : '',
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
      const counters = variability.counters.map(c => `счётчик @${c.at}`)
      return {
        messageStarts: preview.items.map(m => m.start),
        variability: columns.map(c => c.entropyMillibits / 1000),
        variabilityNote: [
          `Длина ${variability.length}, сообщений ${variability.analysed}.`,
          constant.length ? `Постоянны: ${constant.join(', ')}.` : 'Постоянных областей нет.',
          counters.length ? `${counters.join(', ')}.` : '',
        ].filter(Boolean).join(' '),
      }
    },

    async applyFraming(spec) {
      let yaml: string
      try {
        yaml = replaceFramingBlock(unwrap(await api.GET('/api/interpretation')).yaml, spec)
      }
      catch (e) {
        if (!(e instanceof ApiError && e.status === 404)) throw e
        yaml = framingOnlyYaml(spec)
      }
      return unwrap(await api.PUT('/api/interpretation', { body: { yaml } })).rev
    },

    async getCompare(action, logId) {
      const logs = unwrap(await api.GET('/api/action-logs')).items
      const obs = unwrap(await api.GET('/api/observations')).items
      const observations = obs.map(o => ({
        id: o.id,
        text: o.comment || 'без комментария',
        status: (o.anchorState === 'ok' ? 'rule' : o.anchorState === 'broken' ? 'violation' : 'gap') as KnowledgeStatus,
        label: o.anchorState === 'ok' ? 'якорь цел' : o.anchorState === 'broken' ? 'байты изменились' : 'байты недоступны',
        anchor: `${shortStream(o.anchor.stream)} [${o.anchor.start}, ${o.anchor.end})`,
      }))
      const log = logs.find(l => l.id === logId) ?? logs[0]
      const logRefs = logs.map(l => ({ id: l.id, name: l.name }))
      const empty = { logs: logRefs, logId: log?.id ?? null, actions: [], action: null, chips: [], requests: [], mask: [], responses: [], correlations: [], observations, observationTotal: obs.length }
      if (!log) return { ...empty, notes: ['Журнала действий нет — сравнивать не по чему. Импортируйте журнал на экране «Проект».'] }

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
      const responses = diffRows(rows.filter(r => r.response).map(r => ({ label: `ответ: ${r.result}`, bytes: r.response!.bytes })))
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
        if (cor.truncated) notes.push(`${title}: часть сообщений не вошла в анализ (предел).`)
        const anchorAt = (at: number, type: string) => (first ? { source: first.source, stream: first.stream, start: first.start + at, end: first.start + at + sizeOf(type) } : undefined)
        return [
          ...cor.values.map(v => ({
            position: `${title} ${v.at}–${v.at + sizeOf(v.type) - 1}`,
            read: `${v.type}${v.scale > 1 ? ` ÷ ${v.scale}` : ''}`,
            values: v.equivalent.length ? `также ${v.equivalent.join(', ')}` : '—',
            relation: `= ${v.param}`,
            share: `${v.matches} / ${v.samples}`,
            anchor: anchorAt(v.at, v.type),
          })),
          ...cor.actions.slice(0, 3).map(a => ({
            position: `${title} ${a.at}`,
            read: a.type,
            values: a.codes.map(c => `${c.action} = ${c.value}`).join(' · '),
            relation: '= код действия',
            share: pct(a.purityPermille),
            anchor: anchorAt(a.at, a.type),
          })),
        ]
      }
      const correlations: CompareView['correlations'] = [
        ...await correlate('request', 'запрос'),
        ...await correlate('response', 'ответ'),
      ]
      if (!rows.some(r => r.request)) notes.push('Для этих действий запросы не найдены в окне времени.')
      notes.push('Совпадение на примерах — основание для гипотезы, а не вывод: проверьте её тестом.')
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
          { label: 'Потоков', value: formatCount(d.summary.streams) },
          { label: 'Сообщений', value: formatCount(d.summary.messages || total) },
          ...Object.entries(d.summary.counts).filter(([, c]) => c > 0).map(([k, c]) => ({ label: CATEGORY[k]?.label ?? k, value: formatCount(c) })),
          { label: 'Типов сообщений', value: formatCount(d.summary.types) },
          { label: 'Гипотез с тестами', value: formatCount(d.summary.hypotheses) },
          { label: 'Неизвестных байтов', value: formatCount(d.summary.unknownBytes) },
        ],
        incomplete: d.incomplete,
      }
    },

    async getFixHints(hypothesis, yaml) {
      const h = unwrap(await api.POST('/api/interpretation/fix-hints', { body: { hypothesis, ...(yaml ? { yaml } : {}) } }))
      const res = (r: S['FixTestResult']) => `контрпримеров ${r.counterexamples} из ${r.applicable}`
      return {
        hypothesis: h.hypothesis,
        test: h.test,
        before: res(h.current),
        fixes: h.fixes.map(f => ({
          kind: f.kind,
          summary: f.summary,
          effect: `${res(h.current)} → ${f.result.counterexamples}${f.otherBefore || f.otherAfter ? `; у других гипотез с этим полем ${f.otherBefore} → ${f.otherAfter}` : ''}`,
          after: f.result.counterexamples,
          edit: { hypothesis: h.hypothesis, field: f.field, messages: f.messages, fromType: f.fromType, toType: f.toType, fromAt: f.fromAt, toAt: f.toAt, test: f.test },
        })),
      }
    },

    async getCoverage(yaml) {
      const c = unwrap(await api.POST('/api/interpretation/coverage', { body: yaml ? { yaml } : {} }))
      const LABEL = { rule: 'правило', hypothesis: 'гипотеза', unknown: 'неизвестно', none: 'не описано' } as const
      const order = ['rule', 'hypothesis', 'unknown', 'none'] as const
      return {
        described: pct(c.describedPermille),
        totals: order.map(st => ({ status: st, label: LABEL[st], bytes: c.bytes[st] })),
        types: c.types.map(t => ({
          id: t.messageId ?? 'без типа',
          messages: t.messages,
          length: t.minLen === t.maxLen ? `${t.minLen} байт` : `${t.minLen}–${t.maxLen} байт`,
          totals: { rule: t.bytes.rule, hypothesis: t.bytes.hypothesis, unknown: t.bytes.unknown, none: t.bytes.none },
          regions: t.regions.map(r => ({
            start: r.start,
            end: r.end,
            status: r.status,
            label: [r.field, r.hypothesis].filter(Boolean).join(' · ') || LABEL[r.status],
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
      const page = await contract.listConnections({ limit: 500 })
      const streams = page.items.flatMap(c => c.streams.map(s => s.id))
      if (!streams.length) return { items: [], truncated: false, note: 'В проекте нет потоков.' }
      try {
        const r = unwrap(await api.POST('/api/analysis/suggestions', { body: { streams } }))
        return { items: r.items, truncated: r.truncated, note: r.items.length ? null : 'Связей байтов с журналом, сошедшихся на 90 % примеров, не нашлось.' }
      }
      catch (e) {
        if (e instanceof ApiError && e.status === 409) return { items: [], truncated: false, note: 'Заготовки появятся, когда в проекте есть сохранённое описание и журнал действий.' }
        throw e
      }
    },

    async acceptSuggestion(s) {
      const { source, stream, start, end, comment } = s.observation
      const obs = unwrap(await api.POST('/api/observations', { body: { anchor: { source, stream, start, end }, comment } }))
      return unwrap(await api.POST('/api/hypotheses', { body: { statement: s.hypothesis.statement, basis: [obs.id], test: s.hypothesis.test } })).id
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
      return runs.items.map(r => ({ id: r.id, label: `rev ${r.revision ?? '—'} · ${r.sources.length} зап.`, stale: r.stale }))
    },
  }
}
