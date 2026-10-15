import type { ConnectionFlag, SourceDiagnostics } from '~/api/types'
import { DIAGNOSTIC_STATUS, FLAG_STATUS, type KnowledgeStatus } from './status'

/** Признаки соединений, которые говорят о дефекте записи; «порты повторно» — свойство обмена, не дефект. */
export const ISSUE_FLAGS: ConnectionFlag[] = ['gaps', 'ambiguous', 'retransmissions', 'no_syn', 'bad_checksum', 'truncated', 'out_of_window']

// Тот же дефект, что уже назван диагностикой записи, — второй раз не показываем.
const SAME_AS_DIAGNOSTIC: Partial<Record<ConnectionFlag, string>> = { truncated: 'truncated_frame', bad_checksum: 'bad_checksum' }

const RANK: Partial<Record<KnowledgeStatus, number>> = { violation: 0, gap: 1, ambiguous: 2 }

export interface SourceIssues {
  labels: string[]
  /** Самый тяжёлый статус среди замечаний — для цвета значка. */
  status: KnowledgeStatus
}

/** Замечания к записи: диагностики разбора (кроме справочных) и признаки её соединений. */
export function sourceIssues(diag: SourceDiagnostics | undefined, flags: ConnectionFlag[]): SourceIssues | null {
  const found = new Map<string, KnowledgeStatus>()
  const codes = new Set<string>()
  for (const d of diag?.items ?? []) {
    if (d.severity === 'info') continue
    codes.add(d.code)
    const s = DIAGNOSTIC_STATUS[d.code] ?? { label: d.code, status: 'unknown' as const }
    found.set(s.label, s.status)
  }
  for (const f of flags) {
    if (!ISSUE_FLAGS.includes(f) || codes.has(SAME_AS_DIAGNOSTIC[f] ?? '')) continue
    const s = FLAG_STATUS[f]!
    found.set(s.label, s.status)
  }
  if (!found.size) return null
  const status = [...found.values()].sort((a, b) => (RANK[a] ?? 9) - (RANK[b] ?? 9))[0]!
  return { labels: [...found.keys()], status }
}
