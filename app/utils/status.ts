/** Единый язык статусов (ADR 0004, 0016): цвет + значок + подпись, одинаково в UI и отчёте. */
export type KnowledgeStatus =
  | 'rule'
  | 'hypothesis'
  | 'unknown'
  | 'gap'
  | 'ambiguous'
  | 'stale'
  | 'violation'
  | 'unsupported'

export interface StatusMeta {
  label: string
  icon: string
  /** Имя CSS-переменной цвета из темы. */
  color: string
  /** Дополнительный признак, кроме цвета. */
  decoration?: 'dashed' | 'dotted' | 'strike'
}

export const STATUS: Record<KnowledgeStatus, StatusMeta> = {
  rule: { label: 'правило', icon: 'i-lucide-check', color: 'var(--pl-st-rule)' },
  hypothesis: { label: 'гипотеза', icon: 'i-lucide-circle-help', color: 'var(--pl-st-hypothesis)' },
  unknown: { label: 'неизвестно', icon: 'i-lucide-dot', color: 'var(--pl-st-unknown)' },
  gap: { label: 'дыра', icon: 'i-lucide-square-dashed', color: 'var(--pl-st-gap)', decoration: 'dashed' },
  ambiguous: { label: 'неоднозначно', icon: 'i-lucide-equal-approximately', color: 'var(--pl-st-ambiguous)', decoration: 'dotted' },
  stale: { label: 'устарело', icon: 'i-lucide-rotate-ccw', color: 'var(--pl-st-stale)', decoration: 'strike' },
  violation: { label: 'нарушение', icon: 'i-lucide-x', color: 'var(--pl-st-violation)' },
  unsupported: { label: 'не поддерживается', icon: 'i-lucide-ban', color: 'var(--pl-st-unknown)' },
}

/** Значки для признаков соединения и кодов диагностики записи (контракт API). */
export const FLAG_STATUS: Record<string, { label: string, status: KnowledgeStatus }> = {
  gaps: { label: 'дыры', status: 'gap' },
  ambiguous: { label: 'перекрытие', status: 'ambiguous' },
  retransmissions: { label: 'повторы', status: 'unknown' },
  no_syn: { label: 'нет SYN', status: 'unknown' },
  bad_checksum: { label: 'checksum', status: 'violation' },
  truncated: { label: 'усечены', status: 'gap' },
  reused_ports: { label: 'порты повторно', status: 'unknown' },
}

export const DIAGNOSTIC_STATUS: Record<string, { label: string, status: KnowledgeStatus }> = {
  unsupported_link_type: { label: 'канальный уровень', status: 'unsupported' },
  non_ip: { label: 'не IPv4', status: 'unsupported' },
  ipv6_skipped: { label: 'IPv6', status: 'unsupported' },
  non_tcp: { label: 'не TCP', status: 'unsupported' },
  ip_fragment: { label: 'фрагмент IP', status: 'unsupported' },
  truncated_frame: { label: 'усечён', status: 'gap' },
  bad_ip_header: { label: 'заголовок IP', status: 'violation' },
  bad_tcp_header: { label: 'заголовок TCP', status: 'violation' },
  bad_checksum: { label: 'checksum', status: 'violation' },
  bad_block: { label: 'блок записи', status: 'violation' },
  limit_exceeded: { label: 'предел', status: 'violation' },
}
