import { tr } from './i18n'
import type { MessageKey } from '~/i18n'

/** Единый язык статусов: цвет + значок + подпись, одинаково в UI и отчёте. Подписи — на языке интерфейса. */
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
  rule: { get label() { return tr('status.rule') }, icon: 'i-lucide-check', color: 'var(--pl-st-rule)' },
  hypothesis: { get label() { return tr('status.hypothesis') }, icon: 'i-lucide-circle-help', color: 'var(--pl-st-hypothesis)' },
  unknown: { get label() { return tr('status.unknown') }, icon: 'i-lucide-dot', color: 'var(--pl-st-unknown)' },
  gap: { get label() { return tr('status.gap') }, icon: 'i-lucide-square-dashed', color: 'var(--pl-st-gap)', decoration: 'dashed' },
  ambiguous: { get label() { return tr('status.ambiguous') }, icon: 'i-lucide-equal-approximately', color: 'var(--pl-st-ambiguous)', decoration: 'dotted' },
  stale: { get label() { return tr('status.stale') }, icon: 'i-lucide-rotate-ccw', color: 'var(--pl-st-stale)', decoration: 'strike' },
  violation: { get label() { return tr('status.violation') }, icon: 'i-lucide-x', color: 'var(--pl-st-violation)' },
  unsupported: { get label() { return tr('status.unsupported') }, icon: 'i-lucide-ban', color: 'var(--pl-st-unknown)' },
}

/** Значки для признаков соединения и кодов диагностики записи (контракт API). */
export const FLAG_STATUS: Record<string, { label: string, status: KnowledgeStatus }> = {
  gaps: { get label() { return tr('flag.gaps') }, status: 'gap' },
  ambiguous: { get label() { return tr('flag.ambiguous') }, status: 'ambiguous' },
  retransmissions: { get label() { return tr('flag.retransmissions') }, status: 'unknown' },
  no_syn: { get label() { return tr('flag.no_syn') }, status: 'unknown' },
  bad_checksum: { get label() { return tr('flag.bad_checksum') }, status: 'violation' },
  truncated: { get label() { return tr('flag.truncated') }, status: 'gap' },
  reused_ports: { get label() { return tr('flag.reused_ports') }, status: 'unknown' },
  out_of_window: { get label() { return tr('flag.out_of_window') }, status: 'gap' },
}

export const DIAGNOSTIC_STATUS: Record<string, { label: string, status: KnowledgeStatus }> = {
  unsupported_link_type: { get label() { return tr('diag.unsupported_link_type') }, status: 'unsupported' },
  non_ip: { get label() { return tr('diag.non_ip') }, status: 'unsupported' },
  ipv6_skipped: { get label() { return tr('diag.ipv6_skipped') }, status: 'unsupported' },
  non_tcp: { get label() { return tr('diag.non_tcp') }, status: 'unsupported' },
  ip_fragment: { get label() { return tr('diag.ip_fragment') }, status: 'unsupported' },
  truncated_frame: { get label() { return tr('diag.truncated_frame') }, status: 'gap' },
  bad_ip_header: { get label() { return tr('diag.bad_ip_header') }, status: 'violation' },
  bad_tcp_header: { get label() { return tr('diag.bad_tcp_header') }, status: 'violation' },
  bad_checksum: { get label() { return tr('diag.bad_checksum') }, status: 'violation' },
  checksum_offload: { get label() { return tr('diag.checksum_offload') }, status: 'rule' },
  bad_block: { get label() { return tr('diag.bad_block') }, status: 'violation' },
  limit_exceeded: { get label() { return tr('diag.limit_exceeded') }, status: 'violation' },
}

const POLICY: Record<string, MessageKey> = { first: 'policy.first', last: 'policy.last', flag: 'policy.flag', ignore: 'policy.ignore', warn: 'policy.warn', drop: 'policy.drop' }

/** Подпись политики сборки потоков; значение для движка остаётся прежним. */
export function policyLabel(value: string): string {
  const key = POLICY[value]
  return key ? tr(key) : value
}
