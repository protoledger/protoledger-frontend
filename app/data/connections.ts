import type { Connection } from '~/api/types'
import type { ContractSource } from './source'

const PAGE = 500

/**
 * Соединения проекта постранично, но не больше cap: большие записи (сотни тысяч соединений)
 * целиком в браузер не грузим. total — сколько их всего, чтобы экран честно сказал «показаны N из M».
 */
export async function collectConnections(source: Pick<ContractSource, 'listConnections'>, cap = 2000): Promise<{ items: Connection[], total: number }> {
  const first = await source.listConnections({ limit: PAGE, offset: 0 })
  const items: Connection[] = [...first.items]
  while (items.length < first.total && items.length < cap) {
    const page = await source.listConnections({ limit: PAGE, offset: items.length })
    if (!page.items.length) break
    items.push(...page.items)
  }
  return { items: items.slice(0, cap), total: first.total }
}
