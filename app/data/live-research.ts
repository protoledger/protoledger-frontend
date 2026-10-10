import { ApiError, apiClient, unwrap } from '~/api/client'
import type { components } from '~/api/schema'
import { base64ToBytes, formatCount, hexByte } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'
import type { ContractSource, ResearchSource } from './source'
import { framingOnlyYaml, replaceFramingBlock } from '~/utils/interpretation-yaml'
import type { CompareRow, CompareView, ExchangeSide, ExchangeView, FramingCandidate, Hypothesis, InterpretationTreeNode, ResultCategory, StreamLink, VerificationView } from './views'

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
    return {
      tree,
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

    async getActions() {
      const { items } = unwrap(await api.GET('/api/action-logs'))
      const log = items[0]
      if (!log) return { log: null, rows: [] }
      const page = unwrap(await api.GET('/api/action-logs/{id}/actions', { params: { path: { id: log.id }, query: { limit: 500 } } }))
      return {
        log: { name: log.name, rows: log.rows },
        rows: page.items.map(a => ({
          id: `${log.id}|${a.line}`,
          time: clock(a.time),
          action: a.action,
          params: pairs(a.params),
          result: a.resultRaw || pairs(a.result),
          exchange: 'unknown' as const,
        })),
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
          return { rev: null, dirty: false, tree: [], yaml: [], selectedLine: 0, stream: await defaultStream(), preview: { stream: '—', rows: [] }, field: null, quickFix: null }
        }
        throw e
      }
      const stream = await defaultStream()
      const { tree, preview } = stream ? await previewOf(stream) : { tree: [], preview: { stream: '—', rows: [] } }
      return {
        rev: doc.rev,
        dirty: false,
        tree,
        yaml: doc.yaml.split('\n').map(text => ({ text })),
        selectedLine: 1,
        stream,
        preview,
        field: null,
        quickFix: null,
      }
    },

    previewInterpretation: (stream, yaml) => previewOf(stream, yaml),

    async saveInterpretation(yaml) {
      const res = unwrap(await api.PUT('/api/interpretation', { body: { yaml } }))
      return { rev: res.rev, created: res.created }
    },

    async getInterpretationRevisions() {
      return (await revisions()).map(r => r.rev).sort((a, b) => b - a)
    },

    async getInterpretationRevision(rev) {
      return unwrap(await api.GET('/api/interpretation/revisions/{rev}', { params: { path: { rev } } })).yaml
    },

    async getHypotheses() {
      const [hyps, questions] = await Promise.all([
        api.GET('/api/hypotheses').then(unwrap),
        api.GET('/api/questions').then(unwrap),
      ])
      return {
        items: hyps.items.map(h => ({ id: h.id, text: h.statement, status: HYPOTHESIS_STATUS[h.status], support: '' })),
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
        history: [],
      }
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
        run: null, filters: [], totals: [], categories: [], categoriesNote: '', problems: [], diffWith: null, diff: [], runs: [],
        runsNote: 'Прогонов ещё не было — запустите проверку.',
      }
      if (!head) return empty
      const [detail, names] = await Promise.all([
        api.GET('/api/runs/{id}', { params: { path: { id: head.id } } }).then(unwrap),
        sourceNames(),
      ])
      // Сравниваем с предыдущим прогоном — следующим в списке (новые идут первыми).
      const prev = runs.items[Math.max(at, 0) + 1]
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
        problems: detail.counterexamples.slice(0, 50).map(c => ({
          status: CATEGORY[c.category]?.status ?? 'unknown',
          label: (CATEGORY[c.category]?.label ?? c.category).toLowerCase(),
          where: where(names, c.anchor),
          what: c.violations.map(v => v.detail).join('; ') || (c.messageId ? `тип ${c.messageId}` : 'тип не определён'),
          link: linkOf(c.anchor),
        })),
        diffWith: prev?.id ?? null,
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

    async getCompare(action) {
      const logs = unwrap(await api.GET('/api/action-logs')).items
      const obs = unwrap(await api.GET('/api/observations')).items
      const observations = obs.map(o => ({
        id: o.id,
        text: o.comment || 'без комментария',
        status: (o.anchorState === 'ok' ? 'rule' : o.anchorState === 'broken' ? 'violation' : 'gap') as KnowledgeStatus,
        label: o.anchorState === 'ok' ? 'якорь цел' : o.anchorState === 'broken' ? 'байты изменились' : 'байты недоступны',
        anchor: `${shortStream(o.anchor.stream)} [${o.anchor.start}, ${o.anchor.end})`,
      }))
      const log = logs[0]
      const empty = { actions: [], action: null, chips: [], requests: [], mask: [], responses: [], correlations: [], observations, observationTotal: obs.length }
      if (!log) return { ...empty, notes: ['Журнала действий нет — сравнивать не по чему. Импортируйте журнал на экране «Проект».'] }

      const all = unwrap(await api.GET('/api/action-logs/{id}/actions', { params: { path: { id: log.id }, query: { limit: 500 } } })).items
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
        const cor = unwrap(await api.POST('/api/analysis/correlations', { body: { streams, logId: log.id } }))
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
