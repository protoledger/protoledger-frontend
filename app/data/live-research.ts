import { ApiError, apiClient, unwrap } from '~/api/client'
import type { components } from '~/api/schema'
import { base64ToBytes, formatCount, hexByte } from '~/utils/bytes'
import type { KnowledgeStatus } from '~/utils/status'
import type { ContractSource, ResearchSource } from './source'
import type { ExchangeSide, ExchangeView, Hypothesis, InterpretationTreeNode, ResultCategory, VerificationView } from './views'

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

function clock(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleTimeString('ru-RU', { timeZone: 'UTC' })}.${String(d.getUTCMilliseconds()).padStart(3, '0')}`
}

function pairs(obj: Record<string, number | string>) {
  const entries = Object.entries(obj)
  return entries.length ? entries.map(([k, v]) => `${k} = ${v}`).join(', ') : '—'
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

      // Запрос — первое после действия в направлении a→b, ответ — первое после запроса в обратном.
      type Part = { stream: string, start: number, end: number, time: number, frameNo?: number }
      const parts: Part[] = ex.messages.length
        ? ex.messages.map(m => ({ stream: m.stream, start: m.start, end: m.end, time: Date.parse(m.firstTime) }))
        : ex.frames.filter(f => !f.duplicate).map(f => ({ stream: f.stream, start: f.start, end: f.end, time: Date.parse(f.time), frameNo: f.frameNo }))
      const request = parts.filter(p => p.stream.endsWith(':ab') && p.time >= actionAt).sort((a, b) => a.time - b.time)[0]
      const response = request ? parts.filter(p => p.stream.endsWith(':ba') && p.time >= request.time).sort((a, b) => a.time - b.time)[0] : undefined

      const side = async (p: Part | undefined, title: string, direction: string): Promise<ExchangeSide | null> => {
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
        counterexamples: (test?.counterexamples ?? []).map(c => ({
          where: where(names, c.anchor),
          expected: h.test ?? '—',
          got: pairs(c.values),
        })),
        note: [h.note, test && test.counterexamplesTotal > test.counterexamples.length ? `Показано ${test.counterexamples.length} из ${test.counterexamplesTotal} контрпримеров.` : null].filter(Boolean).join(' '),
        history: [],
      }
    },

    async getVerification() {
      const runs = unwrap(await api.GET('/api/runs', { params: { query: { limit: 50 } } }))
      const head = runs.items[0]
      const empty: VerificationView = {
        run: null, filters: [], totals: [], categories: [], categoriesNote: '', problems: [], diffWith: null, diff: [], runs: [],
        runsNote: 'Прогонов ещё не было — запустите проверку.',
      }
      if (!head) return empty
      const [detail, names] = await Promise.all([
        api.GET('/api/runs/{id}', { params: { path: { id: head.id } } }).then(unwrap),
        sourceNames(),
      ])
      const prev = runs.items[1]
      const diff = prev ? unwrap(await api.GET('/api/runs/diff', { params: { query: { a: prev.id, b: head.id, limit: 1 } } })) : null
      const s = head.summary
      const matched = s.counts.matched ?? 0
      const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '—')
      const order: ResultCategory[] = ['matched', 'violated', 'incomplete', 'ambiguous', 'unmatched', 'limit_exceeded']
      const corpus = head.corpus
      return {
        run: { id: head.id, rev: head.revision, scope: `${head.sources.length} зап.`, time: '' },
        filters: [
          ...(corpus.port ? [{ label: `порт ${corpus.port}`, active: true }] : []),
          ...(corpus.direction ? [{ label: corpus.direction === 'a_to_b' ? 'a → b' : 'b → a', active: true }] : []),
          ...(corpus.sources?.length ? [{ label: `записей: ${corpus.sources.length}`, active: true }] : []),
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
        runs: runs.items.map(r => ({ id: r.id, label: `rev ${r.revision ?? '—'} · ${r.sources.length} зап.`, current: !r.stale })),
        runsNote: 'Прогон устаревает, если изменились интерпретация, настройки сборки или записи — по хешам входов.',
      }
    },

    async startRun() {
      return unwrap(await api.POST('/api/runs', { body: {} })).jobId
    },

    // Эндпоинтов поиска границ, сравнения и отчёта в контракте ещё нет.
    getFraming: stream => sample.getFraming(stream),
    getCompare: () => sample.getCompare(),
    getReport: () => sample.getReport(),
  }
}
