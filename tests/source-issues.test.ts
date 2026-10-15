import { describe, expect, it } from 'vitest'
import type { SourceDiagnostics } from '~/api/types'
import { sourceIssues } from '~/utils/source-issues'

const diag = (items: [string, 'info' | 'warning' | 'error'][]): SourceDiagnostics =>
  ({ sha256: 'a'.repeat(64), items: items.map(([code, severity]) => ({ code, severity, title: code, detail: '', count: 1, frameNumbers: [] })) }) as SourceDiagnostics

describe('sourceIssues', () => {
  it('чистая запись и справочные замечания — без пометки', () => {
    expect(sourceIssues(undefined, [])).toBeNull()
    expect(sourceIssues(diag([['checksum_offload', 'info']]), ['reused_ports'])).toBeNull()
  })

  it('дефект из диагностики и признак соединения не дублируются', () => {
    expect(sourceIssues(diag([['truncated_frame', 'warning']]), ['gaps', 'truncated'])).toEqual({ labels: ['усечён', 'пропуски'], status: 'gap' })
  })

  it('цвет — по самому тяжёлому замечанию', () => {
    expect(sourceIssues(undefined, ['no_syn', 'bad_checksum'])?.status).toBe('violation')
  })
})
